import { writeArtifact } from './helpers/artifacts.mjs';
// Headless smoke test: drives the menu -> hero -> deck -> match flow via CDP
// and reports runtime errors + match state. Usage: node tests/browser/training-buildings-smoke.mjs [port]
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";

const port = process.argv[2] || "9246";
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
  "--user-data-dir=" + tmpdir() + "/training-buildings-profile-" + port,
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
  await evaluate(`document.getElementById('btn-training').click();document.getElementById('training-resume').click();window.__match.trainingFree=false;window.__match.trainingPaused=true;`);
  await evaluate(`(()=>{
    const m=window.__match,p=m.local;
    window.__input.reset();window.__input.locked=false;
    const buildings=m.world.map.boxes.filter(b=>b.kind==='tower');
    if(buildings.length!==6)throw new Error('expected six buildings');
    for(const b of buildings) {
      for(const player of m.players) if(Math.abs(player.pos.x-b.x)<b.w/2+player.radius&&Math.abs(player.pos.z-b.z)<b.d/2+player.radius)throw new Error('spawn blocked');
      m.matter.reset(p);p.abilityCd[1]=0;p.pos.set(b.x,0,b.z+b.d/2+5);p.vel.set(0,0,0);p.yaw=0;
      p.pitch=Math.atan2(b.h-2.6,b.d/2+5);
      if(!m.matter.cast(p,1))throw new Error('cannot grapple '+b.h+'m building');
      const anchor=p.lino.anchorBox;
      if(anchor.max.y!==b.h || anchor.min.x!==b.x-b.w/2)throw new Error('grapple attached to wrong geometry');
      const start=p.pos.clone();
      m.trainingPaused=false;for(let i=0;i<12;i++)m.update(.016);m.trainingPaused=true;
      if(p.pos.distanceTo(start)<.5)throw new Error('grapple not pulling');
      m.matter.detach(p);
    }
    m.resetTraining();p.pitch=.18;m.trainingPaused=false;m.update(.016);m.trainingPaused=true;
  })()`);
  await sleep(250);
  const shot=await cdp('Page.captureScreenshot',{format:'png'});writeArtifact('training-buildings.png',Buffer.from(shot.data,'base64'));
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('TRAINING BUILDINGS PASSED: six solid buildings, unblocked spawns, grapple attaches and pulls on every facade.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{ws?.close();chrome.kill();});
