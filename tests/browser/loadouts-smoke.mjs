import { writeArtifact } from './helpers/artifacts.mjs';
// Headless smoke test: drives the menu -> hero -> deck -> match flow via CDP
// and reports runtime errors + match state. Usage: node tests/browser/loadouts-smoke.mjs [port]
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";

const port = process.argv[2] || "9238";
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
  "--user-data-dir=" + tmpdir() + "/lino-loadouts-profile-" + port,
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
    const res = await cdp('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    return res.result.value;
  }
  await evaluate(`(() => {
    localStorage.removeItem('lino.loadouts.v1');
    document.querySelector('#screen-menu [data-route="heroes"]').click();
    document.querySelector('#screen-hero [data-hero="lino"]').click();
    document.getElementById('gallery-loadouts').click();
    const root = document.getElementById('screen-loadouts');
    const check = (ok, label) => { if (!ok) throw new Error(label); };
    check(root.querySelectorAll('[data-slot]').length === 9, 'nine library slots');
    root.querySelector('[data-slot="1"]').click();
    root.querySelector('#loadout-edit').click();
    check(root.querySelectorAll('[data-add]').length === 20, '20 choices');
    check(root.querySelector('#loadout-save').disabled, 'empty deck cannot save');
    const input = root.querySelector('#loadout-name');
    input.value = 'Foice & Vida <5>'; input.dispatchEvent(new Event('input'));
    for (const id of ['c_vigor','c_regen','c_wind','c_cooldown','c_lino_foice']) root.querySelector('[data-add="'+id+'"]').click();
    check([...root.querySelectorAll('[data-add]')].every(b=>b.disabled), 'cannot add a sixth or duplicate');
    check(root.querySelector('#loadout-save').disabled, '5 points cannot save');
    for (const [id, count] of [['c_vigor',4],['c_cooldown',2],['c_lino_foice',4]]) {
      for(let i=0;i<count;i++) root.querySelector('[data-card="'+id+'"][data-level="1"]').click();
    }
    check(!root.querySelector('#loadout-save').disabled, '5/1/1/3/5 can save');
    check([...root.querySelectorAll('[data-level="1"]')].every(b=>b.disabled), '15 point cap');
    check(root.querySelector('[data-card="c_regen"][data-level="-1"]').disabled, 'level one floor');
    check([...root.querySelectorAll('[data-slot]')].every(b=>b.disabled), 'draft protected against slot switching');
  })()`);
  for (const [width,height,label] of [[1440,900,'desktop'],[390,844,'mobile']]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width,height,deviceScaleFactor:1,mobile:false });
    await evaluate(`document.getElementById('screen-loadouts').scrollTop=0`);
    await sleep(300);
    if (await evaluate(`document.getElementById('screen-loadouts').scrollWidth > document.getElementById('screen-loadouts').clientWidth+2`)) throw new Error('editor horizontal overflow '+label);
    const shot=await cdp('Page.captureScreenshot',{format:'png'});
    writeArtifact('loadouts-editor-'+label+'.png',Buffer.from(shot.data,'base64'));
  }
  await evaluate(`(() => {
    const root = document.getElementById('screen-loadouts');
    root.querySelector('#loadout-save').click();
    if (!root.querySelector('#loadout-message').textContent.includes('salvo')) throw new Error('save did not succeed');
    root.querySelector('#loadout-edit').click();
    root.querySelector('[data-remove="c_vigor"]').click();
    root.querySelector('#loadout-cancel').click();
    if (root.querySelectorAll('.loadout-card').length !== 5) throw new Error('cancel changed saved deck');
  })()`);
  await cdp('Page.reload'); await sleep(1600);
  await evaluate(`(() => {
    document.querySelector('#screen-menu [data-route="play"]').click();
    document.getElementById('btn-mode-next').click();
    const root=document.getElementById('screen-pick');
    if (root.querySelector('#gallery-loadouts')) throw new Error('editor offered in match setup');
    root.querySelector('[data-pick="lino"]').click();
    root.querySelector('#btn-pick-confirm').click();
    if (window.__match?.state !== 'loadout') throw new Error('match not loaded before deck selection');
    const select=document.getElementById('screen-deck');
    if(select.querySelectorAll('[data-slot]').length!==9) throw new Error('nine pre-match slots');
    if(select.querySelector('[data-add], [data-level], input, #loadout-edit')) throw new Error('selection is editable');
    if(!select.querySelector('[data-slot="2"]').disabled) throw new Error('empty slot enabled');
    select.querySelector('[data-slot="1"]').click();
    if(!select.textContent.includes('Foice & Vida <5>')) throw new Error('name was not persisted or escaped');
    if(select.querySelectorAll('.loadout-card').length!==5) throw new Error('saved cards missing');
  })()`);
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await sleep(300);
  const shot=await cdp('Page.captureScreenshot',{format:'png'});
  writeArtifact('loadouts-selection.png',Buffer.from(shot.data,'base64'));
  await evaluate(`document.getElementById('btn-deck-next').click()`);
  await sleep(3500);
  const state=await evaluate(`(() => {
    const m=window.__match,p=m?.local;
    if(!p || p.hero.id!=='lino') throw new Error('no selected hero in match');
    if(p.cards.map(c=>c.level).join(',')!=='5,1,1,3,5') throw new Error('levels lost entering match');
    if(p.maxHp!==p.hero.hp*1.25 || Math.abs(p.stat('cooldownMult')-.85)>1e-8 || p.stat('hpRegen')!==1) throw new Error('wrong card effects');
    const before=JSON.stringify(p.cards);
    const saved=JSON.parse(localStorage.getItem('lino.loadouts.v1'));
    saved.lino[1].cards[0].level=1;localStorage.setItem('lino.loadouts.v1',JSON.stringify(saved));
    p.recomputeMods();
    if(JSON.stringify(p.cards)!==before || p.maxHp!==p.hero.hp*1.25) throw new Error('match loadout was not frozen');
    return { hero:p.hero.name, cards:p.cards, maxHp:p.maxHp, cooldown:p.stat('cooldownMult'), regen:p.stat('hpRegen') };
  })()`);
  if(errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify(state,null,2));
  console.log('LOADOUT FLOW PASSED: editor, validation, persistence, cancel, read-only selection, gameplay levels and snapshot.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{ws?.close();chrome.kill();});
