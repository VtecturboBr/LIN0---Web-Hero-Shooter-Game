import { writeFileSync } from 'node:fs';
import { writeArtifact } from './helpers/artifacts.mjs';
// Headless review of Shoto: menu, rendering, 5v5 simulation and point recapture.
// Usage: node tests/browser/shoto-smoke.mjs [Chrome debugging port]
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";

const port = process.argv[2] || "9251";
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
  "--user-data-dir=" + tmpdir() + "/lino-shoto-profile-" + port,
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



  mkdirSync('public/assets/maps', {recursive:true});
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await evaluate(`document.querySelector('#screen-menu [data-route="play"]').click();`);
  await check(`document.querySelector('#screen-modes [data-map="kyoto"]').textContent.includes('DISTRITO SHŌTŌ')`,'map card title');
  await check(`fetch('/assets/maps/shoto-preview.jpg').then(r=>r.ok)`,'preview image available');
  await sleep(200);
  const modeShot=await cdp('Page.captureScreenshot',{format:'png'});writeArtifact('artifacts/shoto/shoto-mode-selection.png',Buffer.from(modeShot.data,'base64'));
  await evaluate(`document.getElementById('btn-mode-next').click();document.getElementById('btn-pick-confirm').click();document.getElementById('btn-deck-next').click();`);
  await evaluate(`window.__match.update(3.1);`);
  await sleep(500);
  await check(`window.__match?.world.map.name==='DISTRITO SHŌTŌ' && window.__match.mode==='conquista' && window.__match.state==='running'`, 'new conquest map loads');
  await evaluate(`window.__match.paused=true;window.__input.reset();`);
  // Rendering review uses the actual map geometry, material and lighting configuration.
  const overview=await evaluate(`(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const m=window.__match,map=m.world.map;
    const scene=new THREE.Scene();scene.background=new THREE.Color(map.skyColor);scene.fog=new THREE.Fog(map.fogColor,map.fogNear,map.fogFar);
    const environment=m.world.group.clone(true);
    m.world.group.children.forEach((child,index)=>{if(m.players.some(p=>p.model===child))environment.children[index].visible=false;});
    scene.add(environment);
    scene.add(new THREE.HemisphereLight(0xd6dced,map.groundColor,map.ambient));const sun=new THREE.DirectionalLight(0xffeedd,1.8);sun.position.set(35,65,25);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-58,right:58,top:48,bottom:-48,near:.5,far:140});sun.shadow.bias=-.0003;sun.shadow.normalBias=.04;scene.add(sun);
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1440,900);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.domElement.style.cssText='position:fixed;inset:0;z-index:99999;width:100vw;height:100vh';document.body.append(renderer.domElement);
    const camera=new THREE.PerspectiveCamera(48,1440/900,.1,300);camera.position.set(62,68,66);camera.lookAt(0,0,0);
    window.mapView={scene,renderer,camera};renderer.render(scene,camera);
    return {calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,solids:m.world.colliders.length};
  })()`);
  console.log('OVERVIEW',overview);
  let shot=await cdp('Page.captureScreenshot',{format:'png'});writeArtifact('artifacts/shoto/shoto-overview.png',Buffer.from(shot.data,'base64'));
  await evaluate(`mapView.camera.position.set(-20,8,22);mapView.camera.lookAt(1,1,-2);mapView.renderer.render(mapView.scene,mapView.camera);`);
  shot=await cdp('Page.captureScreenshot',{format:'png'});writeArtifact('artifacts/shoto/shoto-plaza.png',Buffer.from(shot.data,'base64'));
  const preview=await cdp('Page.captureScreenshot',{format:'jpeg',quality:88});writeFileSync('public/assets/maps/shoto-preview.jpg',Buffer.from(preview.data,'base64'));
  await evaluate(`mapView.camera.position.set(-24,1.65,23);mapView.camera.lookAt(-2,2.4,27);mapView.renderer.render(mapView.scene,mapView.camera);`);
  shot=await cdp('Page.captureScreenshot',{format:'png'});writeArtifact('artifacts/shoto/shoto-park.png',Buffer.from(shot.data,'base64'));
  await evaluate(`mapView.renderer.domElement.remove();mapView.renderer.dispose();delete window.mapView;window.__match.local.pos.set(-8,0,1);window.__match.local.yaw=-Math.PI/2;window.__match.local.pitch=0;window.__match.updateCamera();`);
  await sleep(250);
  shot=await cdp('Page.captureScreenshot',{format:'png'});writeArtifact('artifacts/shoto/shoto-first-person.png',Buffer.from(shot.data,'base64'));

  const simulation=await evaluate(`(()=>{
    const m=window.__match;m.paused=false;window.__input.reset();m.local.pos.copy(m.world.spawns[0][0]);
    const closest=m.players.map(p=>p.pos.distanceTo(m.world.objectivePos));
    const start=performance.now();
    for(let tick=0;tick<1800;tick++) {m.update(1/60);for(let i=0;i<m.players.length;i++)closest[i]=Math.min(closest[i],m.players[i].pos.distanceTo(m.world.objectivePos));}
    m.paused=true;
    return {milliseconds:Math.round(performance.now()-start),time:m.timeLeft,scores:m.scores,players:m.players.map((p,i)=>({team:p.team,bot:p.isBot,closest:Math.round(closest[i]),kills:p.stats.kills})),structures:m.matter.structures.length};
  })()`);
  console.log('30 SECOND MATCH',JSON.stringify(simulation));
  for(const team of [0,1]) if(!simulation.players.some(p=>p.bot&&p.team===team&&p.closest<6.25)) throw new Error('no bot reached capture point for team '+team);
  // Validate scoring/recapture through the real Match integration as well as unit rules.
  await evaluate(`(()=>{
    const m=window.__match,p=m.local,enemy=m.players.find(p=>p.team===1);m.matter.reset();m.scores=[0,0];
    for(const player of m.players)player.alive=false;
    m.obj={progress:0,controller:-1,claimant:-1,contested:false};p.alive=true;p.pos.set(0,0,0);
    for(let i=0;i<600;i++)m.updateObjective(1/60);
    if(m.captureController!==0||m.scores[0]<=0)throw new Error('blue capture');
    enemy.alive=true;enemy.pos.set(0,0,0);const score=m.scores[0];m.updateObjective(1);
    if(!m.captureContested||m.scores[0]!==score)throw new Error('contested score');
    p.pos.copy(m.world.spawns[0][0]);for(let i=0;i<900;i++)m.updateObjective(1/60);
    if(m.captureController!==1||m.scores[1]<=0)throw new Error('red recapture');
  })()`);
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('SHOTO BROWSER PASSED: mode > hero > saved deck > conquest, geometry and first-person rendering, no runtime errors.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{ws?.close();chrome.kill();});
