import { writeArtifact } from './helpers/artifacts.mjs';
// Headless smoke test: drives the menu -> hero -> deck -> match flow via CDP
// and reports runtime errors + match state. Usage: node tests/browser/menu-smoke.mjs [port]
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";

const port = process.argv[2] || "9234";
const url = process.env.SMOKE_URL || "http://localhost:5173/";

const chromePath = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
].find((p) => existsSync(p)) || "google-chrome";

const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  `--remote-debugging-port=${port}`,
  "--user-data-dir=" + tmpdir() + "/lino-menu-profile-" + port,
  "about:blank",
], { stdio: "ignore", windowsHide: true });

const errors = [];
let ws;
let id = 0;
const pending = new Map();

function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

async function main() {
  // wait for debugger port
  let targets;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/json`);
      targets = await res.json();
      if (targets.length) break;
    } catch { /* retry */ }
    await sleep(250);
  }
  if (!targets?.length) throw new Error("chrome debug port not available");
  const page = targets.find((t) => t.type === "page");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method === "Runtime.exceptionThrown") {
      errors.push(msg.params.exceptionDetails.text + ": " + (msg.params.exceptionDetails.exception?.description || "").slice(0, 300));
    } else if (msg.method === "Log.entryAdded") {
      if (msg.params.entry.level === "error" && !msg.params.entry.text.includes("Failed to load resource")) {
        errors.push(msg.params.entry.text);
      }
    }
  };

  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Log.enable");
  await cdp("Page.navigate", { url });
  await sleep(1500);

  const result = await cdp('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: `(async () => {
    const checks = [];
    const $ = id => document.getElementById(id);
    const check = (condition, name) => { if (!condition) throw new Error(name); checks.push(name); };
    const route = name => document.querySelector('[data-route="' + name + '"]').click();
    check(document.title.startsWith('LIN0'), 'LIN0 identity');
    check(document.querySelectorAll('.lino-mainnav > button').length === 9, 'complete side navigation');
    check(document.querySelectorAll('.lino-news .lino-card').length === 3, 'three news cards');
    for (const page of ['pass', 'store', 'missions', 'social', 'messages', 'season', 'event', 'cosmetics']) {
      route(page);
      check($('menu-dialog').open && $('menu-preview-text').textContent.length > 40, page + ' preview opens');
      document.querySelector('.dialog-close').click();
    }
    route('settings');
    const sound = $('menu-sound'); sound.click();
    check(localStorage.getItem('lino.sound') === String(sound.checked), 'sound preference saved');
    sound.click();
    $('menu-motion').click();
    check(document.body.classList.contains('menu-reduced-motion') === $('menu-motion').checked, 'reduced motion applied');
    if ($('menu-motion').checked) $('menu-motion').click();
    document.querySelector('.dialog-close').click();
    route('profile');
    $('menu-profile-name').value = 'LINO TESTE';
    $('menu-profile-form').requestSubmit();
    check($('menu-player-name').textContent === 'LINO TESTE' && localStorage.getItem('lino.name') === 'LINO TESTE', 'profile save updates top bar');
    document.querySelector('.dialog-close').click();
    check(!document.querySelector('.lino-hero-caption'), 'viewer controls removed');
    route('play');
    check(!$('screen-modes').classList.contains('hidden'), 'play opens dedicated mode screen');
    document.querySelector('#screen-modes [data-mode="duelo"]').click();
    document.querySelector('#screen-modes [data-map="castle"]').click();
    $('btn-mode-next').click();
    check(!$('screen-pick').classList.contains('hidden'), 'play enters separate hero selection');
    $('btn-pick-confirm').click();
    check(window.__match?.state === 'loadout' && !$('screen-deck').classList.contains('hidden'), 'loaded match offers deck choice');
    $('btn-deck-back').click();
    check(!$('screen-menu').classList.contains('hidden'), 'back navigation returns home');
    $('btn-training').click();
    check(window.__match?.training && !$('training-panel').classList.contains('hidden'), 'training connected');
    $('training-exit').click();
    check(window.__match === null && !$('screen-menu').classList.contains('hidden'), 'training exits to new menu');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F1', bubbles: true }));
    check($('menu-dialog').open, 'F1 opens social');
    document.querySelector('.dialog-close').click();
    return checks;
  })()` });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  for (const [width, height, name] of [[1920, 1080, 'desktop'], [1280, 720, 'laptop'], [390, 844, 'mobile']]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await sleep(350);
    const layout = await cdp('Runtime.evaluate', { returnByValue: true, expression: `(() => { const r = document.getElementById('screen-menu'); return { overflow: r.scrollWidth > r.clientWidth + 2, width: r.clientWidth }; })()` });
    if (layout.result.value.overflow) throw new Error('Horizontal overflow at ' + width);
    const shot = await cdp('Page.captureScreenshot', { format: 'png' });
    writeArtifact('menu-' + name + '.png', Buffer.from(shot.data, 'base64'));
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ checks: result.result.value, errors, screenshots: ['desktop', 'laptop', 'mobile'] }, null, 2));
  console.log('MENU SMOKE TEST PASSED');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { ws?.close(); chrome.kill(); });

