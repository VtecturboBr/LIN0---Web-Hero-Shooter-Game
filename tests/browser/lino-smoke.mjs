import { writeArtifact } from './helpers/artifacts.mjs';
// Headless smoke test: drives the menu -> hero -> deck -> match flow via CDP
// and reports runtime errors + match state. Usage: node tests/browser/lino-smoke.mjs [port]
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";

const port = process.argv[2] || "9245";
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
  "--user-data-dir=" + tmpdir() + "/lino-kit-profile-" + port,
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


  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await evaluate(`document.querySelector('#screen-menu [data-route="play"]').click();document.getElementById('btn-play-training').click();document.getElementById('training-resume').click();window.__match.trainingFree=false;window.__match.trainingPaused=true;`);
  await check(`document.querySelector('#abil-2 .abil-key').textContent==='M2' && window.__match.local.hero.abilities.length===3`,'dash HUD');
  await evaluate(`(()=>{
    const m=window.__match,p=m.local,i=window.__input;
    window.step=(dt=.016)=>{m.trainingPaused=false;m.update(dt);m.trainingPaused=true;i.endFrame();};
    window.key=(code)=>{window.dispatchEvent(new KeyboardEvent('keydown',{code}));step();window.dispatchEvent(new KeyboardEvent('keyup',{code}));};
    i.reset();i.blocked=false;i.locked=true;p.pos.set(-7,0,16);p.yaw=0;p.pitch=0;
    key('KeyQ');key('Digit2');window.dispatchEvent(new MouseEvent('mousedown',{button:0}));step();window.dispatchEvent(new MouseEvent('mouseup',{button:0}));step(.4);
    if(m.matter.structures.length!==1||m.matter.structures[0].parts.length!==1||!m.matter.structures[0].parts[0].box.ramp)throw new Error('ramp must be a single wedge');
    key('KeyQ');p.pos.set(-3,0,14);p.yaw=.6;p.pitch=.05;step();
  })()`);
  await sleep(250);
  let shot=await cdp('Page.captureScreenshot',{format:'png'});writeArtifact('lino-continuous-ramp.png',Buffer.from(shot.data,'base64'));
  await evaluate(`(()=>{
    const m=window.__match,p=m.local,i=window.__input;m.resetTraining();p.pos.z=12;
    key('KeyQ');window.dispatchEvent(new MouseEvent('mousedown',{button:2}));step();window.dispatchEvent(new MouseEvent('mouseup',{button:2}));
    if(!p.dash||p.lino.molding||p.applyDamage(m.players[1],100)!==0)throw new Error('dash and invulnerability');
    for(let n=0;n<12;n++)step();
    if(m.players[1].hp!==m.players[1].maxHp-55)throw new Error('dash area damage');
    if(p.pos.z>8||p.pos.z<6.8)throw new Error('dash travel');
    for(let n=0;n<10;n++)step();if(p.applyDamage(m.players[1],10)!==10)throw new Error('invulnerability must expire');
    m.resetTraining();i.reset();i.locked=true;i.blocked=false;
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'ShiftLeft'}));step();
    if(p.lino.anchorTarget!==m.players[1]||p.lino.reserved!==30||Math.abs(p.lino.control-70)>.001)throw new Error('enemy grapple at cost 30');
    m.players[1].pos.x=1;step();if(Math.abs(p.lino.anchor.x-1)>.01)throw new Error('anchor must follow enemy');
  })()`);
  await sleep(180);shot=await cdp('Page.captureScreenshot',{format:'png'});writeArtifact('lino-enemy-tether.png',Buffer.from(shot.data,'base64'));
  await evaluate(`(()=>{const m=window.__match,p=m.local;window.dispatchEvent(new KeyboardEvent('keyup',{code:'ShiftLeft'}));step();if(p.lino.anchor||p.lino.reserved)throw new Error('release target');
    m.resetTraining();p.pos.y=15;p.onGround=false;window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyD'}));for(let n=0;n<15;n++)step();window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyD'}));if(p.vel.x<8||p.pos.x<1)throw new Error('air steering');
    m.resetTraining();p.resource=100;key('KeyE');if(!p.lino.field)throw new Error('ultimate');p.pos.x=-8;key('KeyQ');key('Digit4');window.dispatchEvent(new MouseEvent('mousedown',{button:0}));step();window.dispatchEvent(new MouseEvent('mouseup',{button:0}));step(.2);if(!m.matter.structures.some(s=>s.field))throw new Error('ultimate pillar');
    m.paused=true;const before=JSON.stringify(p.lino);m.update(3);if(before!==JSON.stringify(p.lino))throw new Error('pause advances kit');m.paused=false;
  })()`);
  await sleep(180);
  await check(`document.querySelectorAll('#lino-molding kbd').length===6`,'ultimate shapes');
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('LINO KIT BROWSER PASSED: continuous ramp, Q molding, RMB area dash and brief invulnerability, enemy tether for 30 Control, moving anchor, air steering, ultimate, pause.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{ws?.close();chrome.kill();});
