import { FirstPersonScythe } from './characters/lino/FirstPersonScythe';
import * as THREE from "three";
import { Input } from './core/input';
import { Match } from './game/match/Match';
import type { MatchResult } from './game/match/Match';
import { Hud } from './ui/hud/Hud';
import { Screens } from './ui/screens';
import { audio } from './core/audio';
import { HEROES } from './characters/index';
import { MainMenu } from './ui/menu/MainMenu';
import { MenuScene } from './ui/menu/MenuScene';
import "./ui/menu/menu.css";
import "./ui/gallery/gallery.css";
import { PauseMenu } from './ui/match/PauseMenu';
import { GAME_MODES } from './game/modes/definitions';
import { DevPanel } from './ui/dev/DevPanel';

// ---------- renderer / scene ----------
const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(1, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.info.autoReset = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 300);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const menuScene = new MenuScene(scene);
const firstPerson = new FirstPersonScythe();

// ---------- app state ----------
const input = new Input(canvas);
const screens = new Screens();
let match: Match | null = null;
let hud: Hud | null = null;
let matchGroup: THREE.Group | null = null;
let clock = new THREE.Clock();
const devPanel = new DevPanel(() => match, input, () => {
  if (!match) return;
  hud = new Hud(match);
  if (match.state === 'loadout') screens.showMatchLoadouts(match.local.hero.id);
  if (match.trainingPaused) openTrainingPanel();
});

let needResumeLock = false;
const menuUI = new MainMenu({
  heroes: () => screens.showHeroSelect(),
  play: () => screens.showModes(),
});

window.addEventListener('lino:navigate', e => {
  screens.showMenu(); menuUI.navigate((e as CustomEvent<string>).detail);
});
window.addEventListener('lino:train-hero', e => startMatch('duelo', 'training', (e as CustomEvent<string>).detail, [], true));
window.addEventListener('lino:gallery-turn', e => menuScene.gallery.rotate((e as CustomEvent<number>).detail));

(window as any).__kageToggleHelp = () => openPause();
(window as any).__hitMarker = (headshot: boolean, killed = false) => hud?.showHit(headshot, killed);
(window as any).__damageNumber = (amount: number, headshot = false) => hud?.showDamageNumber(amount, headshot);
(window as any).__input = input;
window.addEventListener("error", (e) => { (window as any).__err = e.message; });

function resetSceneToMenu() {
  scene.background = new THREE.Color(0x0b0814);
  scene.fog = new THREE.Fog(0x0d0a16, 25, 90);
  if (matchGroup) {
    scene.remove(matchGroup);
    matchGroup = null;
  }
}

function startMatch(mode: "conquista" | "duelo", mapId: string, heroId: string, cards: import("./core/types").DeckCard[], training = false) {
  devPanel.detach();
  pauseUI.close();
  needResumeLock = false;
  input.blocked = true;
  menuUI.close();
  menuScene.setVisible(false);
  resetSceneToMenu();
  if (match) match.cleanup();
  match = null;
  hud = null;

  const m = new Match(scene, { mode, mapId, heroId, cards, training }, input, {
    onKillFeed: (k, v, kt, vt) => hud?.killFeed(k, v, kt, vt),
    onAnnounce: (msg) => hud?.announce(msg),
    onCapture: () => undefined,
    onEnd: (res: MatchResult) => endMatch(res),
    onShopState: (open) => {
      hud?.renderShop(open);
      if (open) {
        if (document.pointerLockElement) document.exitPointerLock();
      } else {
        needResumeLock = true;
      }
    },
    onLocalDeath: () => match?.announce("VOCÊ FOI ELIMINADO — REAPAREÇA EM 5s"),
    onLocalRespawn: () => match?.announce("VOCÊ REAPARECEU"),
    onScore: () => undefined,
  });
  match = m;
  m.combat.on('damage', event => {
    if (event.source.isLocal) { hud?.showHit(!!event.opts.headshot, event.killed); hud?.showDamageNumber(event.amount, !!event.opts.headshot); }
  });
  (window as any).__match = match;
  hud = new Hud(m);
  matchGroup = m.world.group;

  // intro overlay — hide all screens (including deck builder), then show intro
  screens.show("screen-intro");
  document.getElementById("intro-title")!.textContent = GAME_MODES[mode].name;
  document.getElementById("hud")!.classList.remove("hidden");

  document.body.classList.toggle("training", training);
  document.getElementById("training-status")!.classList.toggle("hidden", !training);
  document.querySelector('#training-status > span:last-child')!.textContent = heroId === 'lino'
    ? 'T painel · Esc pausa · G recuperar · N reiniciar · Q moldar · RMB dash · Shift fio · E suprema'
    : 'T painel · Esc pausa · G recuperar · N reiniciar · Q / RMB / F habilidades · E suprema';
  document.getElementById("training-panel")!.classList.add("hidden");
  input.reset();
  if (training) {
    document.getElementById("screen-intro")!.classList.add("hidden");
    openTrainingPanel();
  } else {
    screens.showMatchLoadouts(heroId);
    if (document.pointerLockElement) document.exitPointerLock();
  }
  audio.ensure();
}

function endMatch(result: MatchResult) {
  pauseUI.close(); input.blocked = true; needResumeLock = false;
  if (document.pointerLockElement) document.exitPointerLock();
  // small delay handled by screens.showEnd
  hud?.renderScoreboard(false);
  hud?.renderShop(false);
  screens.showEnd(result, () => {
    cleanupMatch();
  });
}

function cleanupMatch() {
  devPanel.detach();
  pauseUI.close(); input.blocked = true; needResumeLock = false;
  document.body.classList.remove("training");
  document.getElementById("training-panel")!.classList.add("hidden");
  document.getElementById("training-status")!.classList.add("hidden");
  document.getElementById("screen-help")?.classList.add("hidden");
  input.reset();
  if (match) match.cleanup();
  match = null;
  (window as any).__match = null;
  hud = null;
  if (matchGroup) {
    scene.remove(matchGroup);
    matchGroup = null;
  }
  document.exitPointerLock?.();
  document.getElementById("hud")!.classList.add("hidden");
  document.getElementById("screen-intro")!.classList.add("hidden");
  resetSceneToMenu();
  screens.showMenu();
}

// ---------- flow ----------
screens.init(heroId => {
  startMatch(screens.selectedMode, screens.selectedMap, heroId, []);
}, cleanupMatch);
screens.onDeck(choice => {
  if (!match || match.paused || choice.heroId !== match.local.hero.id || !match.confirmLoadout(choice.cards)) return;
  hud = new Hud(match);
  screens.show('screen-intro');
  input.reset(); input.blocked = false;
  input.requestLock();
});

const pauseUI = new PauseMenu(input, { resume: resumePause, exit: cleanupMatch });
function openPause() {
  if (!match || match.state === 'ended' || pauseUI.isOpen) return;
  match.paused = true; input.blocked = true; input.reset(); needResumeLock = false;
  match.closeShop(); hud?.renderShop(false); hud?.renderScoreboard(false);
  needResumeLock = false;
  pauseUI.open(match);
  if (document.pointerLockElement) document.exitPointerLock();
}
function resumePause() {
  if (!match) { pauseUI.close(); return; }
  pauseUI.close(); match.paused = false; input.reset();
  input.blocked = match.state === 'loadout' || match.trainingPaused;
  if (!input.blocked) input.requestLock();
}
window.addEventListener('keydown', e => {
  if (e.code !== 'Escape' || e.repeat || !match || pauseUI.isOpen) return;
  e.preventDefault(); openPause();
});
window.addEventListener('blur', () => { if (match && match.state !== 'loadout') openPause(); });

const trainingPanel = document.getElementById("training-panel")!;
const heroSelect = document.getElementById("training-hero") as HTMLSelectElement;
heroSelect.innerHTML = HEROES.map(h => `<option value="${h.id}">${h.name} — ${h.title}</option>`).join("");
function openTrainingPanel() {
  if (!match?.training) return;
  match.trainingPaused = true; input.blocked = true;
  input.reset();
  document.exitPointerLock?.();
  trainingPanel.classList.remove("hidden");
  heroSelect.value = match.local.hero.id;
  const hero = match.local.hero;
  document.getElementById("training-abilities")!.innerHTML = [
    `<div><b>Passiva · ${hero.passive.name}</b> — ${hero.passive.description}</div>`,
    ...hero.abilities.map(a => `<div><b>${a.key} · ${a.name}</b> — ${a.description} <small>(${a.cooldown}s)</small></div>`),
    `<div><b>E · ${hero.ultimate.name}</b> — ${hero.ultimate.description}</div>`
  ].join("");
  for (const [id, value] of [["free", match.trainingFree], ["moving", match.trainingMoving], ["attack", match.trainingAttack]] as const)
    (document.getElementById(`training-${id}`) as HTMLInputElement).checked = value;
  document.getElementById("training-resume")!.focus();
}
function resumeTraining() {
  if (!match?.training) return;
  input.reset();
  match.trainingPaused = false; input.blocked = false;
  trainingPanel.classList.add("hidden");
  input.requestLock();
}
document.getElementById("btn-training")!.onclick = () => startMatch("duelo", "training", "lino", [], true);
document.getElementById("training-resume")!.onclick = resumeTraining;
document.getElementById("training-reset")!.onclick = () => match?.resetTraining();
document.getElementById("training-exit")!.onclick = cleanupMatch;
heroSelect.onchange = () => {
  if (match?.training && match.changeHero(match.local, heroSelect.value)) hud = new Hud(match);
  openTrainingPanel();
};
for (const [id, property] of [["free", "trainingFree"], ["moving", "trainingMoving"], ["attack", "trainingAttack"]] as const) {
  const checkbox = document.getElementById(`training-${id}`) as HTMLInputElement;
  checkbox.onchange = () => { if (match?.training) match[property] = checkbox.checked; };
}
window.addEventListener("keydown", e => {
  if (pauseUI.isOpen || !match?.training || e.repeat || e.code !== "KeyT" || (e.target as HTMLElement).tagName === "SELECT") return;
  e.preventDefault();
  if (match.trainingPaused) resumeTraining(); else openTrainingPanel();
});

// ---------- pointer lock ----------
document.addEventListener("pointerlockchange", () => {
  const wasLocked = input.locked;
  input.setLocked(document.pointerLockElement === canvas);
  if (wasLocked && !input.locked && match && match.state !== 'ended' && !match.shopOpen && !match.trainingPaused && !match.paused && !match.devOpen) openPause();
});
canvas.addEventListener("click", () => {
  if (match && match.state === "running" && !match.shopOpen && !match.trainingPaused && !match.paused) {
    if (document.pointerLockElement !== canvas) input.requestLock();
  }
});

function renderFrame() {
  renderer.info.reset();
  renderer.render(scene, camera);
  firstPerson.update(match, camera.aspect);
  firstPerson.render(renderer);
  devPanel.frame(renderer.info);
}

// ---------- loop ----------
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());

  if (!match) {
    const gallery = document.getElementById("screen-hero")!;
    menuScene.update(dt, camera, menuUI.reducedMotion, gallery.classList.contains("hidden") ? undefined : gallery.dataset.hero);
    input.endFrame();
    renderFrame();
    return;
  }

  menuScene.setVisible(false);

  if (match.paused || match.state === 'loadout') {
    match.update(0);
    camera.position.copy(match.camera);
    camera.rotation.set(match.local.pitch, match.local.yaw, 0, 'YXZ');
    input.endFrame(); renderFrame(); return;
  }

  if (match.state === "intro") {
    match.update(dt);
    camera.position.copy(match.camera);
    camera.rotation.set(0, 0, 0);
    camera.rotateY(match.local.yaw);
    camera.rotateX(match.local.pitch);
    hud?.update(dt);
    input.endFrame();
    renderFrame();
    return;
  }

  if (match.state === "running") {
    document.getElementById("screen-intro")!.classList.add("hidden");

    if (match.training) {
      const p = match.local;
      document.getElementById("training-metrics")!.textContent = `${p.hero.name} · Dano: ${Math.floor(p.stats.damage)} · DPS (5s): ${match.dps.toFixed(1)} · Último hit: ${match.lastHit.amount.toFixed(1)}${match.lastHit.headshot ? ' HEADSHOT' : ''} · Cura: ${Math.floor(p.stats.healing)} · Eliminações: ${p.stats.kills} · F3: ferramentas · ${match.trainingFree ? "Treino livre" : "Recargas normais"}`;
    }
    // scoreboard hold
    hud?.renderScoreboard(!match.training && input.down("Tab"));

    // resume pointer lock after shop close
    if (needResumeLock) {
      needResumeLock = false;
      input.requestLock();
    }

    match.update(dt);
    camera.position.copy(match.camera);
    camera.rotation.set(0, 0, 0);
    camera.rotateY(match.local.yaw);
    camera.rotateX(match.local.pitch);
    hud?.update(dt);
  }

  input.endFrame();
  renderFrame();
}

resetSceneToMenu();
screens.showMenu();
requestAnimationFrame(loop);
