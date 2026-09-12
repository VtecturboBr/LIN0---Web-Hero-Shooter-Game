import { writeArtifact } from './helpers/artifacts.mjs';
// Headless smoke test: drives the menu -> hero -> deck -> match flow via CDP
// and reports runtime errors + match state. Usage: node tests/browser/gallery-smoke.mjs [port]
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";

const port = process.argv[2] || "9236";
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
  "--user-data-dir=" + tmpdir() + "/lino-gallery-profile-" + port,
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

  if (errors.length) throw new Error(errors.join('\n'));
  const res = await cdp('Runtime.evaluate', { returnByValue: true, expression: `(() => {
    const checks = [], $ = id => document.getElementById(id);
    const check = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); };
    document.querySelector('#screen-menu [data-route="heroes"]').click();
    const root = $('screen-hero');
    check(!root.classList.contains('hidden') && root.querySelectorAll('.hero-card').length === 6, 'six playable heroes');
    for (const [role, count] of [['Damage',2],['Tank',1],['Support',1],['Controller',2],['all',6]]) {
      root.querySelector('[data-filter="'+role+'"]').click();
      check(root.querySelectorAll('.hero-card').length === count, role + ' filter');
    }
    for (const id of ['lino','yume','raijin','kitsune','shin','kenji']) {
      root.querySelector('[data-hero="'+id+'"]').click();
      check(root.dataset.hero === id && ($('gallery-name').querySelector('img')?.alt || $('gallery-name').textContent).toLowerCase() === (id === 'lino' ? 'lino' : id), id + ' selection updates');
      for (const tab of ['details','abilities','lore','skins']) {
        root.querySelector('[data-tab="'+tab+'"]').click();
        check($('hero-detail').textContent.length > 30, id + ' ' + tab);
      }
      for (let i = 0; i < (6); i++) {
        root.querySelector('[data-skill="'+i+'"]').click();
        check(root.querySelector('[data-tab="abilities"]').getAttribute('aria-selected') === 'true', id + ' skill ' + i);
      }
    }
    $('gallery-training').click();
    check(window.__match?.training && window.__match.local.hero.id === 'kenji', 'training uses selected hero');
    $('training-exit').click();
    document.querySelector('#screen-menu [data-route="heroes"]').click();
    $('btn-hero-next').click();
    check(!$('screen-modes').classList.contains('hidden'), 'gallery selection enters match setup');
    $('btn-mode-back').click();
    check(!$('screen-menu').classList.contains('hidden'), 'back returns home');
    document.querySelector('#screen-menu [data-route="heroes"]').click();
    root.querySelector('[data-route="settings"]').click();
    check($('menu-dialog').open, 'shared header settings navigation');
    document.querySelector('.dialog-close').click();
    document.querySelector('#screen-menu [data-route="heroes"]').click();
    root.querySelector('[data-hero="yume"]').click();
    root.querySelector('[data-tab="details"]').click();
    return checks;
  })()` });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  for (const [width,height,name] of [[1920,1080,'desktop'],[1280,720,'laptop'],[390,844,'mobile']]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width,height,deviceScaleFactor:1,mobile:false });
    await sleep(400);
    const layout = await cdp('Runtime.evaluate', { returnByValue:true, expression:`(() => { const r=document.getElementById('screen-hero'); return { overflow:r.scrollWidth>r.clientWidth+2, images:[...r.querySelectorAll('.gallery-grid img, .gallery-name-logo')].every(i=>i.complete&&i.naturalWidth>0) }; })()` });
    if (layout.result.value.overflow || !layout.result.value.images) throw new Error('Layout or portrait load failed: ' + name + JSON.stringify(layout.result.value));
    const shot = await cdp('Page.captureScreenshot', { format:'png' });
    writeArtifact('gallery-'+name+'.png',Buffer.from(shot.data,'base64'));
  }
  if(errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({checks:res.result.value.length,errors},null,2));
  console.log('GALLERY SMOKE TEST PASSED');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{ws?.close();chrome.kill();});

