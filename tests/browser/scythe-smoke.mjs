import { writeArtifact } from './helpers/artifacts.mjs';
// Headless smoke test: drives the menu -> hero -> deck -> match flow via CDP
// and reports runtime errors + match state. Usage: node tests/browser/scythe-smoke.mjs [port]
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";

const port = process.argv[2] || "9242";
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
  "--user-data-dir=" + tmpdir() + "/lino-scythe-profile-" + port,
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
  async function check(expression,label){if(!await evaluate(expression)) throw new Error(label);}
  await check(`!document.querySelector('.lino-hero-caption, #hero-rotate-left, #hero-idle')`, 'old viewer element removed');
  await evaluate(`document.getElementById('btn-training').click();document.getElementById('training-resume').click();window.__match.trainingFree=false;`);
  await check(`window.__match.local.hero.id==='lino' && window.__match.local.hero.hp===330`,'Lino identifier and base health');
  await check(`document.querySelector('#abil-0 .abil-key').textContent==='Q' && document.querySelector('#abil-ult .abil-key').textContent==='E'`,'HUD key labels');
  await evaluate(`(() => {
    const m=window.__match,p=m.local,i=window.__input;
    i.reset();i.blocked=false;i.locked=true;m.trainingPaused=false;p.resource=0;
    window.dispatchEvent(new MouseEvent('mousedown',{button:2}));m.update(.01);
    i.endFrame();window.dispatchEvent(new MouseEvent('mouseup',{button:2}));m.update(.01);i.endFrame();
    if(p.hero.abilities.length!==3 || p.abilityCd[2]<=0) throw new Error('right-click dash');
    const secondary=p.abilityCd[1];p.resource=100;
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE'}));m.update(.01);
    window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyE'}));i.endFrame();
    if(p.viewAction.kind!=='ultimate' || p.resource>=100 || p.abilityCd[1]>secondary) throw new Error('E must cast only ultimate');
    const stamp=p.viewAction.time;
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyX'}));m.update(.01);
    window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyX'}));i.endFrame();
    if(p.viewAction.time!==stamp) throw new Error('old X binding still active');
    const menu=new MouseEvent('contextmenu',{cancelable:true});document.getElementById('game-canvas').dispatchEvent(menu);
    if(!menu.defaultPrevented) throw new Error('right click opens browser menu');
    m.resetTraining();m.local.viewAction.time=-Infinity;m.trainingPaused=true;
  })()`);
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await sleep(250);
  let shot=await cdp('Page.captureScreenshot',{format:'png'});writeArtifact('lino-scythe-first-person.png',Buffer.from(shot.data,'base64'));
  await evaluate(`(async()=>{
    const {FirstPersonScythe}=await import('/src/characters/lino/FirstPersonScythe.ts');
    const moduleText=await (await fetch('/src/characters/lino/FirstPersonScythe.ts')).text();
    const timeUrl=moduleText.match(/from "([^"]*core.time.ts[^"]*)"/)[1];
    const {advanceGameTime}=await import(timeUrl);
    const m=window.__match,v=new FirstPersonScythe();v.update(m,1.6);
    if(!v.rig.visible || v.weapon.children.length<15) throw new Error('scythe not constructed for Lino');
    const idle=v.rig.position.toArray().join();advanceGameTime(.12);v.update(m,1.6);
    if(idle===v.rig.position.toArray().join()) throw new Error('idle is static');
    m.local.animateWeapon('melee');advanceGameTime(.2);v.update(m,1.6);
    if(v.rig.rotation.z<.5) throw new Error('melee swing not animated');
    const pose=v.rig.rotation.z;v.update(m,1.6);if(v.rig.rotation.z!==pose) throw new Error('animation ignores paused clock');
    m.local.alive=false;v.update(m,1.6);if(v.rig.visible) throw new Error('weapon visible after death');m.local.alive=true;
    const {HERO_MAP}=await import('/src/characters/index.ts');const saved=m.local.hero;
    m.local.hero=HERO_MAP.yume;v.update(m,1.6);if(v.rig.visible) throw new Error('scythe visible on another hero');m.local.hero=saved;
  })()`);
  await sleep(200);shot=await cdp('Page.captureScreenshot',{format:'png'});writeArtifact('lino-scythe-swing.png',Buffer.from(shot.data,'base64'));
  await check(`import('/src/characters/index.ts').then(({HEROES})=>HEROES.map(h=>h.hp).join(',')==='330,300,780,300,315,390')`, 'health boost across entire roster');
  if(errors.length) throw new Error(errors.join('\n'));
  console.log('SCYTHE AND CONTROLS PASSED: removed HUD block, Lino ID, health, right-click, E ultimate, old X disabled, idle/swing animation, pause/death/hero visibility.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{ws?.close();chrome.kill();});
