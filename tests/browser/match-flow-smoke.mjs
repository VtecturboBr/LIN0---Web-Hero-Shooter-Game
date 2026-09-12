import { writeArtifact } from './helpers/artifacts.mjs';
import { checkGameplayHud } from './helpers/gameplay.mjs';
import { checkDevPanel } from './helpers/dev-panel.mjs';
// Headless smoke test: drives the menu -> hero -> deck -> match flow via CDP
// and reports runtime errors + match state. Usage: node tests/browser/match-flow-smoke.mjs [port]
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";

const port = process.argv[2] || "9240";
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
  "--user-data-dir=" + tmpdir() + "/lino-matchflow-profile-" + port,
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



  async function evaluate(expression) {
    const res=await cdp('Runtime.evaluate',{returnByValue:true,awaitPromise:true,expression});
    if(res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    return res.result.value;
  }
  async function check(expression, label) { if(!await evaluate(expression)) throw new Error(label); }
  async function shots(root,name) {
    for(const [width,height,label] of [[1440,900,'desktop'],[390,844,'mobile']]) {
      await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await evaluate(`document.getElementById('${root}').scrollTop=0`); await sleep(300);
      await check(`document.getElementById('${root}').scrollWidth <= document.getElementById('${root}').clientWidth+2`,'overflow '+name+label);
      const shot=await cdp('Page.captureScreenshot',{format:'png'});
      writeArtifact(name+'-'+label+'.png',Buffer.from(shot.data,'base64'));
    }
    await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  }
  await evaluate(`document.querySelector('#screen-menu [data-route="play"]').click()`);
  await check(`!document.getElementById('screen-modes').classList.contains('hidden') && !document.getElementById('menu-dialog').open`, 'dedicated mode screen');
  await check(`document.querySelectorAll('#screen-modes [data-map]').length===2`, 'two maps');
  await evaluate(`document.querySelector('#screen-modes [data-mode="duelo"]').click();document.querySelector('#screen-modes [data-map="castle"]').click()`);
  await shots('screen-modes','mode-selection');
  await evaluate(`document.getElementById('btn-mode-next').click()`);
  await check(`document.querySelectorAll('#screen-pick [data-pick]').length===6 && !window.__match`, 'separate hero screen before match');
  await evaluate(`document.querySelector('#screen-pick [data-pick="yume"]').click()`);
  await shots('screen-pick','character-selection');
  await evaluate(`document.getElementById('btn-pick-back').click()`);
  await check(`document.querySelector('#screen-modes [data-mode="duelo"]').getAttribute('aria-pressed')==='true' && document.querySelector('#screen-modes [data-map="castle"]').getAttribute('aria-pressed')==='true'`, 'mode/map retained');
  await evaluate(`document.getElementById('btn-mode-next').click();document.getElementById('btn-pick-confirm').click()`);
  await check(`window.__match?.state==='loadout' && window.__match.local.hero.id==='yume' && window.__match.mode==='duelo' && !window.__match.loadoutLocked`, 'match already loaded before card selection');
  await check(`document.querySelectorAll('#screen-deck [data-slot]').length===9 && !document.querySelector('#screen-deck [data-add], #screen-deck [data-level]')`, 'saved decks read only');
  const timer=await evaluate('window.__match.timeLeft');await sleep(600);
  await check(`window.__match.timeLeft===${timer} && window.__match.state==='loadout'`,'waiting for deck freezes combat');
  await shots('screen-deck','in-match-loadouts');
  await evaluate(`document.getElementById('btn-deck-next').click()`);
  await sleep(3300);
  await check(`window.__match.state==='running' && window.__match.loadoutLocked && window.__match.local.cards.length===5`, 'confirm starts combat');
  await check(`(() => {const m=window.__match;const before=JSON.stringify(m.local.cards);return !m.confirmLoadout(m.local.cards) && JSON.stringify(m.local.cards)===before;})()`, 'second confirmation rejected');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await check(`document.getElementById('pause-dialog').open && window.__match.paused`,'Escape opens pause');
  const frozen=await evaluate(`JSON.stringify({time:window.__match.timeLeft,scores:window.__match.scores,players:window.__match.players.map(p=>[p.pos.x,p.pos.z,p.hp,p.resource])})`);
  const gameTime=await evaluate(`import('/src/core/time.ts').then(m=>m.gameNow())`);
  await sleep(750);
  await check(`JSON.stringify({time:window.__match.timeLeft,scores:window.__match.scores,players:window.__match.players.map(p=>[p.pos.x,p.pos.z,p.hp,p.resource])})===${JSON.stringify(frozen)}`,'bots, timer and health frozen');
  await check(`import('/src/core/time.ts').then(m=>m.gameNow()===${gameTime})`,'effect deadlines frozen');
  await check(`!document.querySelector('#pause-dialog [data-slot]') && document.getElementById('pause-dialog').textContent.includes('FIXO NESTA PARTIDA')`,'pause cannot swap deck');
  await evaluate(`const sensitivity=document.getElementById('pause-sensitivity');sensitivity.value='1.5';sensitivity.dispatchEvent(new Event('input'));`);
  await check(`window.__input.sensitivity===1.5 && localStorage.getItem('lino.sensitivity')==='1.5'`,'sensitivity applies and persists');
  await shots('pause-dialog','pause-menu');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await sleep(250);
  await check(`!document.getElementById('pause-dialog').open && !window.__match.paused && window.__match.timeLeft<${timer}`,'Escape resumes');
  await evaluate(`window.dispatchEvent(new Event('blur'))`);
  await check(`document.getElementById('pause-dialog').open && window.__match.paused`,'focus loss pauses');
  await evaluate(`document.getElementById('pause-exit').click()`);
  await check(`!window.__match && !document.getElementById('pause-dialog').open && !document.getElementById('screen-menu').classList.contains('hidden') && document.getElementById('hud').classList.contains('hidden')`,'exit cleanup');
  await evaluate(`document.querySelector('#screen-menu [data-route="play"]').click();document.getElementById('btn-mode-next').click();document.getElementById('btn-pick-confirm').click()`);
  await check(`window.__match.state==='loadout' && !window.__match.loadoutLocked`,'next match gets fresh choice');
  await evaluate(`document.getElementById('btn-deck-back').click();document.getElementById('btn-training').click()`);
  await check(`window.__match.training && window.__match.trainingPaused && !document.getElementById('training-panel').classList.contains('hidden')`,'training preserved');
  console.log('DEV PANEL PASSED:', await checkDevPanel(evaluate, cdp, async () => {
    const shot = await cdp('Page.captureScreenshot', { format: 'png' });
    writeArtifact('dev-panel.png', Buffer.from(shot.data, 'base64'));
  }));
  await evaluate(`document.getElementById('training-exit').click()`);
  console.log('GAMEPLAY HUD PASSED:', await checkGameplayHud(evaluate));
  await evaluate(`document.querySelector('#screen-menu [data-route="play"]').click();document.getElementById('btn-mode-next').click();document.getElementById('btn-pick-confirm').click()`);
  await evaluate(`const tied = window.__match; tied.scores = [0, 0]; tied.endMatch();`);
  await check(`document.getElementById('end-result').textContent === 'EMPATE'`, 'total tie shown as draw');
  await evaluate(`document.getElementById('btn-end-menu').click()`);
  if(errors.length) throw new Error(errors.join('\n'));
  console.log('MATCH FLOW PASSED: modes/maps, character selection, in-match deck lock, pause/resume, frozen simulation, settings, exit and training.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{ws?.close();chrome.kill();});
