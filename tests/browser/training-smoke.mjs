import { writeArtifact } from './helpers/artifacts.mjs';
// Headless smoke test: drives the menu -> hero -> deck -> match flow via CDP
// and reports runtime errors + match state. Usage: node tests/browser/training-smoke.mjs [port]
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";

const port = process.argv[2] || "9231";
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
  "--user-data-dir=" + tmpdir() + "/kage-training-profile-" + port,
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

  const res = await cdp('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
    const checks = [];
    const check = (ok, name) => { if (!ok) throw new Error(name); checks.push(name); };
    const $ = id => document.getElementById(id);
    $('btn-training').click();
    let m = window.__match;
    check(m.training && m.players.length === 7 && m.brains.length === 0, 'dojo with four enemies and two allies');
    check(!m.players.slice(1).some(p => p.invulnUntil > Date.now()/1000), 'targets immediately vulnerable');
    check(!$('training-panel').classList.contains('hidden'), 'training panel opens');
    const step = dt => { m.trainingPaused = false; m.update(dt); m.trainingPaused = true; };
    m.timeLeft = 0.01; step(0.05);
    check(m.state === 'running' && m.timeLeft === 0.01, 'no time limit');
    m.local.fireCd = 1; m.local.weaponAmmo = 1; m.local.resource = 0; m.local.abilityCd[0] = 5;
    step(0.05);
    check(m.local.weaponAmmo === -1 && m.local.resource === 100 && m.local.abilityCd[0] <= 0 && m.local.fireCd > 0.9, 'free mode refills without changing weapon cadence');
    $('training-free').click();
    const select = $('training-hero');
    for (const id of ['lino', 'yume', 'raijin', 'kitsune', 'shin', 'kenji']) {
      select.value = id; select.dispatchEvent(new Event('change'));
      m = window.__match;
      check(m.local.hero.id === id && !m.trainingFree, id + ' selected and options preserved');
      // Exercise the real keyboard -> match -> ability route.
      for (const code of (id === 'lino' ? ['KeyQ', 'KeyE'] : ['KeyQ', 'MouseRight', 'KeyF', 'KeyE'])) {
        window.__input.reset(); window.__input.locked = true; window.__input.blocked = false;
        if (code === 'MouseRight') window.dispatchEvent(new MouseEvent('mousedown', { button: 2 }));
        else window.dispatchEvent(new KeyboardEvent('keydown', { code }));
        step(0.01);
        if (code === 'MouseRight') window.dispatchEvent(new MouseEvent('mouseup', { button: 2 }));
        else window.dispatchEvent(new KeyboardEvent('keyup', { code }));
        window.__input.endFrame(); window.__input.locked = false;
      }
      if(id === 'lino') check(m.local.lino.molding && !!m.local.lino.field && m.local.hero.abilities.length===3, 'Lino molding and field execute');
      else check(m.local.abilityCd.every(cd => cd > 0), id + ' Q/right-click/F execute');
      check(m.local.resource < 100, id + ' ultimate executes');
      if (id === 'yume') check(m.local.stats.healing > 0 && m.local.shield > 0, 'Yume heals allies and creates shield');
      if (id === 'kitsune') check(m.entities.clones.length >= 3 && m.entities.smokes.length === 1, 'Kitsune illusions and smoke');
      if (id === 'raijin') check(m.entities.storms.length === 1, 'Raijin storm');
    }
    m.resetTraining();
    const enemy = m.players[1];
    enemy.applyDamage(m.local, 10000);
    check(!enemy.alive && m.local.stats.kills === 1 && m.local.stats.damage > 0, 'target damage and elimination recorded');
    enemy.respawnAt = 0; step(0.01);
    check(enemy.alive && enemy.invulnUntil === 0, 'target respawns vulnerable');
    m.trainingMoving = true; const x = enemy.pos.x; step(0.05);
    check(enemy.pos.x !== x, 'moving targets');
    m.resetTraining(); m.trainingMoving = false; m.trainingAttack = true;
    const hp = m.local.hp; step(0.05);
    check(m.local.hp < hp, 'enemy fire damages player with free mode off');
    m.resetTraining();
    check(m.local.stats.damage === 0 && m.local.stats.kills === 0 && m.entities.projectiles.length === 0 && m.players.filter(p => !p.isLocal && p.team === 0).every(p => p.hp < p.maxHp), 'reset clears effects, statistics and wounds allies');
    $('training-exit').click();
    check(window.__match === null && !$('screen-menu').classList.contains('hidden') && !document.body.classList.contains('training'), 'exit returns to menu');
    $('btn-training').click();
    check(window.__match.training && window.__match.local.hero.id === 'lino', 'reentry works');
    return checks;
  })()` });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  console.log(JSON.stringify({ checks: res.result.value, errors }, null, 2));
  if (errors.length) throw new Error('Browser runtime errors');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  const shot = await cdp('Page.captureScreenshot', { format: 'png' });
  writeArtifact('training-panel.png', Buffer.from(shot.data, 'base64'));
  await cdp('Runtime.evaluate', { expression: `document.getElementById('training-resume').click()` });
  await sleep(300);
  const field = await cdp('Page.captureScreenshot', { format: 'png' });
  writeArtifact('training-field.png', Buffer.from(field.data, 'base64'));
  console.log('TRAINING SMOKE TEST PASSED');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => {
  ws?.close();
  chrome.kill();
});

