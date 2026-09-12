import { dressTraining } from '../../maps/training/scene';
import { advanceCapture, type CaptureState } from '../modes/capture';
import { LinoMatter } from '../../characters/lino/LinoMatter';
import { validDeck } from '../../progression/loadouts/library';
import type { DeckCard } from '../../core/types';
import { gameNow, advanceGameTime, resetGameTime } from '../../core/time';
import * as THREE from "three";
import type { Input } from '../../core/input';
import type { World } from '../../maps/world';
import { buildWorld } from '../../maps/world';
import { EntityManager } from '../combat/projectiles';
import { Effects } from '../effects/Effects';
import { Player } from '../actors/Player';
import type { GameCtx } from '../actors/Player';
import { BotBrain } from '../ai/BotBrain';
import type { BotGoal } from '../ai/BotBrain';
import { castAbility, castUltimate } from '../combat/abilities';
import { firePrimary, fireAlt, fireMelee, startReload } from '../combat/weapons';
import { HERO_MAP, HEROES } from '../../characters/index';
import { BOT_NAMES } from '../ai/names';
import { MAPS } from '../../maps/index';
import { GAME_MODES } from '../modes/definitions';
import { SHOP_ITEMS, SHOP_RULES } from '../../progression/shop/items';
import { audio } from '../../core/audio';
import type { PlayerStats } from '../../core/types';
import { CombatEventSystem } from '../combat/CombatEventSystem';
import { AbilityRuntime } from '../combat/AbilityRuntime';
import { ResourceTracker } from '../../core/ResourceTracker';
import { createMatterState } from '../../characters/lino/LinoMatter';
import { MATTER_RULES } from '../../characters/lino/rules';

export interface MatchEvents {
  onKillFeed: (killerName: string, victimName: string, killerTeam: number, victimTeam: number) => void;
  onAnnounce: (msg: string) => void;
  onCapture: (team: number) => void;
  onEnd: (result: MatchResult) => void;
  onShopState: (open: boolean) => void;
  onLocalDeath: () => void;
  onLocalRespawn: () => void;
  onScore: (scores: [number, number]) => void;
}

export interface MatchResult {
  win: boolean;
  draw: boolean;
  score: [number, number];
  stats: PlayerStats;
  xp: number;
  modeName: string;
}

export interface MatchConfig {
  mode: keyof typeof GAME_MODES;
  mapId: string;
  heroId: string;
  cards: import("../../core/types").DeckCard[];
  training?: boolean;
}

const nowSec = () => gameNow();

export class Match {
  readonly combat = new CombatEventSystem();
  devOpen = false;
  freezeAI = false;
  timeScale = 1;
  lastHit = { amount: 0, headshot: false, source: '', sourceKind: '', target: '', time: 0 };
  private damageWindow: { time: number; amount: number }[] = [];
  get dps() {
    const now = gameNow();
    this.damageWindow = this.damageWindow.filter(hit => now - hit.time < 5);
    return this.damageWindow.reduce((sum, hit) => sum + hit.amount, 0) / 5;
  }
  paused = false;
  loadoutLocked = false;
  readonly training: boolean;
  trainingFree = true;
  trainingMoving = false;
  trainingAttack = false;
  trainingPaused = false;
  private trainingHomes = new Map<number, THREE.Vector3>();
  private ownedObjects: THREE.Object3D[] = [];
  mode: keyof typeof GAME_MODES;
  world: World;
  entities: EntityManager;
  effects: Effects;
  players: Player[] = [];
  local!: Player;
  brains: BotBrain[] = [];
  timeLeft: number;
  scores: [number, number] = [0, 0];
  state: "loadout" | "intro" | "running" | "ended" = "loadout";
  introTime = 3;
  shopOpen = false;
  shopAffordable = true;
  shopError: string | null = null;

  matter!: LinoMatter;
  private ctx: GameCtx;
  private input: Input;
  private events: MatchEvents;
  private obj: CaptureState = { progress: 0, controller: -1, claimant: -1, contested: false };
  private objKobanTimer: number[] = [];
  private goal: BotGoal;
  private announcerText = "";
  private announcerTimer = 0;
  private cameraPos = new THREE.Vector3();

  constructor(scene: THREE.Scene, cfg: MatchConfig, input: Input, events: MatchEvents) {
    resetGameTime();
    this.training = !!cfg.training;
    const previousObjects = new Set(scene.children);
    this.mode = cfg.mode;
    this.input = input;
    this.events = events;
    const mapDef = MAPS[cfg.mapId];
    this.timeLeft = GAME_MODES[cfg.mode].time;
    this.world = buildWorld(mapDef, scene);
    this.entities = new EntityManager(scene);
    this.effects = new Effects(scene);
    this.combat.presentation = true;
    this.combat.on('damage', event => {
      if (event.target.isLocal) audio.hurt();
      if (event.source.isLocal) {
        audio.hit(!!event.opts.headshot);
        this.lastHit = { amount: event.amount, headshot: !!event.opts.headshot, source: event.source.hero.name, sourceKind: event.sourceKind, target: event.target.name, time: gameNow() };
        this.damageWindow.push({ time: gameNow(), amount: event.amount });
        if (this.damageWindow.length > 1000) this.damageWindow.shift();
      }
    });
    this.combat.on('kill', ({ source, target }) => {
      this.effects.deathBurst(target.center, target.hero.color);
      if (source?.isLocal && source !== target && source.team !== target.team) audio.kill();
      this.handleDie(target, source);
    });
    this.combat.on('heal', ({ target, rewards }) => { if (rewards) this.effects.healSpark(target.center); });
    this.combat.on('shield', ({ target }) => this.effects.ring(target.pos.clone(), 0x7ee0b0, 2.5, .5));
    this.combat.on('ability_cast', ({ ability, ultimate }) => { audio.ability(ability.kind); if (ultimate) audio.ult(); });
    this.combat.on('objective_capture', ({ team }) => { audio.capture(); this.events.onCapture(team); });
    this.goal = {
      mode: this.mode,
      objectivePos: this.world.objectivePos,
      objectiveRadius: this.world.objectiveRadius,
    };

    const hero = HERO_MAP[cfg.heroId];
    const names0 = [...BOT_NAMES[0]].slice(0, 4);
    const names1 = [...BOT_NAMES[1]].slice(0, 5);

    if (this.training) {
      this.local = new Player(hero, 0, "VOCÊ", false);
      this.local.isLocal = true;
      this.setupPlayer(this.local, 0);
      for (let i = 0; i < 4; i++) {
        const target = new Player(HERO_MAP[i === 2 ? "raijin" : i === 0 ? "shin" : "lino"], 1,
          ["ALVO PRÓXIMO", "ALVO MÉDIO", "ALVO TANQUE", "ALVO DISTANTE"][i], false);
        this.setupPlayer(target, i);
      }
      for (let i = 0; i < 2; i++) {
        const ally = new Player(HERO_MAP.raijin, 0, "ALIADO • CURA", false);
        this.setupPlayer(ally, 0);
        ally.pos.set(6 + i * 3, 0, 8 - i);
      }
      for (const p of this.players) this.trainingHomes.set(p.id, p.pos.clone());
      this.resetTraining();
      this.local.yaw = 0;
      this.state = "running";
      this.world.objectiveBeacon.visible = false;
      dressTraining(this.world, this.players);
    } else {
    // team 0: player + 4 bots
    for (let i = 0; i < 5; i++) {
      const isLocal = i === 0;
      const p = new Player(hero, 0, isLocal ? "VOCÊ" : names0[i - 1], !isLocal);
      p.isLocal = isLocal;
      if (isLocal) {
        p.cards = [];
        this.local = p;
      }
      this.setupPlayer(p, i);
    }
    // team 1: 5 bots with random heroes
    for (let i = 0; i < 5; i++) {
      const enemyHero = HEROES[Math.floor(Math.random() * HEROES.length)];
      const p = new Player(enemyHero, 1, names1[i], true);
      this.setupPlayer(p, i);
    }
    }
    this.ctx = { world: this.world, players: this.players, entities: this.entities, effects: this.effects };
    this.matter = new LinoMatter(this.ctx);
    this.ctx.matter = this.matter;

    // scene ambience
    scene.fog = new THREE.Fog(mapDef.fogColor, mapDef.fogNear, mapDef.fogFar);
    scene.background = new THREE.Color(mapDef.skyColor);
    const residential = mapDef.theme === 'residential';
    const hemi = new THREE.HemisphereLight(residential ? 0xd6dced : 0x8899cc, mapDef.groundColor, mapDef.ambient);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffeedd, residential ? 1.8 : 1.1);
    dir.position.set(20, 30, 10);
    if (residential) {
      dir.castShadow = true;
      dir.shadow.mapSize.set(2048, 2048);
      Object.assign(dir.shadow.camera, { left: -58, right: 58, top: 48, bottom: -48, near: .5, far: 140 });
      dir.position.set(35, 65, 25); dir.shadow.bias = -.0003; dir.shadow.normalBias = .04;
    }
    scene.add(dir);
    this.ownedObjects = scene.children.filter(obj => !previousObjects.has(obj));
    this.updateCamera();
  }

  refillTraining(resetFire = true) {
    if (!this.training) return;
    const p = this.local;
    p.hp = p.maxHp;
    p.resource = 100;
    p.resetCooldowns(resetFire);
    if (resetFire) p.lino.control = MATTER_RULES.control - p.lino.reserved;
    p.reloading = false;
    p.weaponAmmo = p.weapon.ammo < 0 ? -1 : Math.ceil(p.weapon.ammo * p.stat("ammoMult"));
  }

  resetTraining() {
    if (!this.training) return;
    this.entities.clear();
    this.matter?.reset();
    for (const p of this.players) {
      for (const runtime of [...p.runtimes, p.ultimateRuntime]) runtime.reset();
      p.respawn(this.trainingHomes.get(p.id)!);
      p.invulnUntil = 0;
      p.dash = null;
      p.buffs = [];
      p.damageSources.clear();
      p.slowUntil = 0;
      p.slowMult = 0;
      p.speedBoostUntil = p.slideUntil = p.kenjiStacksUntil = 0;
      p.kenjiStacks = 0;
      p.abilityCd.fill(0);
      p.localMove.set(0, 0, 0);
      if (!p.isLocal && p.team === 0) p.hp = p.maxHp * 0.3;
    }
    this.local.yaw = this.local.pitch = 0;
    this.local.stats.damage = this.local.stats.healing = this.local.stats.kills = 0;
    this.damageWindow = []; this.lastHit.amount = 0;
    this.refillTraining();
    this.updateCamera();
  }

  private updateTraining(dt: number) {
    if (this.trainingPaused) return;
    if (this.trainingFree && this.local.alive) this.refillTraining(false);
    if (this.input.wasPressed("KeyG")) this.refillTraining();
    if (this.input.wasPressed("KeyN")) this.resetTraining();
    if (this.input.locked && !this.devOpen) this.handleLocalInput();
    if (this.paused) return;
    for (const p of this.players) {
      if (!p.alive && nowSec() >= p.respawnAt) {
        p.respawn(this.trainingHomes.get(p.id)!);
        p.invulnUntil = 0;
      }
      if (!p.isLocal && p.team === 1 && p.alive && !this.freezeAI) {
        const home = this.trainingHomes.get(p.id)!;
        if (this.trainingMoving) p.localMove.x = Math.sin(nowSec() * 1.5 + p.id) > 0 ? 0.5 : -0.5;
        else p.localMove.set(0, 0, 0);
        if (Math.abs(p.pos.x - home.x) > 4) p.localMove.x = Math.sign(home.x - p.pos.x);
        if (this.trainingAttack && p === this.players[1]) {
          const aim = this.local.center.sub(p.eyePos).normalize();
          p.yaw = Math.atan2(-aim.x, -aim.z);
          p.pitch = Math.asin(aim.y);
          firePrimary(p, this.ctx);
        }
      }
      if (this.freezeAI && !p.isLocal) { p.localMove.set(0, 0, 0); p.vel.set(0, 0, 0); }
      p.update(dt, this.ctx);
    }
    this.matter.update(dt);
    this.entities.update(dt, this.world, this.players, this.effects);
    this.updateAuraRegen(dt);
    this.effects.update(dt);
    this.updateCamera();
  }

  private setupPlayer(p: Player, slot: number) {
    const spawns = this.world.spawns[p.team];
    const sp = spawns[slot % spawns.length];
    p.pos.set(sp.x, 0, sp.z);
    p.yaw = p.team === 0 ? -Math.PI / 2 : Math.PI / 2;
    p.recomputeMods();
    p.respawn(p.pos);
    p.hp = p.maxHp;
    p.combat = this.combat;
    this.players.push(p);
    this.objKobanTimer.push(0);
    if (p.isBot) this.brains.push(new BotBrain());
    this.sceneAdd(p.model);
  }

  private sceneAdd(obj: THREE.Object3D) {
    // world group is added to scene in buildWorld; players added to the world group
    this.world.group.add(obj);
  }

  get camera(): THREE.Vector3 { return this.cameraPos; }

  confirmLoadout(cards: DeckCard[]): boolean {
    if (this.paused || this.training || this.loadoutLocked || this.state !== 'loadout' || !validDeck(this.local.hero.id, { name: 'Partida', cards })) return false;
    this.local.cards = structuredClone(cards);
    this.local.recomputeMods();
    this.local.hp = this.local.maxHp;
    this.local.weaponAmmo = this.local.weapon.ammo > 0 ? Math.ceil(this.local.weapon.ammo * this.local.stat('ammoMult')) : -1;
    this.loadoutLocked = true;
    this.state = 'intro';
    this.introTime = 3;
    return true;
  }

  update(dt: number) {
    if (this.paused || this.trainingPaused || this.state === 'loadout' || this.state === 'ended') { this.updateCamera(); return; }
    if (!Number.isFinite(dt) || dt < 0) return;
    dt *= Math.max(0, Math.min(4, Number.isFinite(this.timeScale) ? this.timeScale : 1));
    if (dt === 0) { this.updateCamera(); return; }
    advanceGameTime(dt);
    this.announcerTimer -= dt;
    if (this.announcerTimer <= 0 && this.announcerText) {
      this.announcerText = ''; this.events.onAnnounce('');
    }
    if (this.state === "intro") {
      this.introTime -= dt;
      for (const p of this.players) p.update(dt, this.ctx);
      this.effects.update(dt);
      if (this.introTime <= 0) {
        this.state = "running";
        this.announce("A BATALHA COMEÇOU!");
        audio.announce();
      }
      this.updateCamera();
      return;
    }
    if (this.state !== "running") return;

    if (this.training) { this.updateTraining(dt); return; }

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) { this.endMatch(); return; }

    if (!this.shopOpen && !this.devOpen) this.handleLocalInput();
    if (this.paused) return;

    // bots think + cast
    let bi = 0;
    for (const p of this.players) {
      if (!p.isBot) continue;
      if (this.freezeAI) { p.botInput = null; p.localMove.set(0, 0, 0); p.vel.set(0, 0, 0); bi++; continue; }
      this.brains[bi].think(p, dt, this.ctx, this.goal);
      const inp = p.botInput;
      if (inp) {
        if (inp.shoot) firePrimary(p, this.ctx);
        if (inp.altShoot) fireAlt(p, this.ctx);
        if (inp.ability >= 0) castAbility(p, inp.ability, this.ctx);
        if (inp.ult) castUltimate(p, this.ctx);
      }
      bi++;
    }

    for (const p of this.players) p.update(dt, this.ctx);
    this.matter.update(dt);
    this.entities.update(dt, this.world, this.players, this.effects);
    this.handleRespawns();
    if (this.mode === "conquista") this.updateObjective(dt);
    this.updateKobanTicks(dt);
    this.updateAuraRegen(dt);
    this.effects.update(dt);

    // objective beacon pulse
    const t = nowSec();
    this.world.objectiveBeacon.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
    (this.world.objectiveBeacon.material as THREE.MeshBasicMaterial).opacity = 0.65 + Math.sin(t * 3.4) * 0.25;

    this.updateCamera();
  }

  private updateCamera() {
    const p = this.local;
    this.cameraPos.set(p.pos.x, p.pos.y + p.eyeHeight, p.pos.z);
  }

  private handleLocalInput() {
    const p = this.local;
    const inp = this.input;

    if (!this.training && inp.wasPressed("KeyB")) this.toggleShop();
    if (inp.wasPressed("KeyH")) {
      this.events.onAnnounce(""); // unused hook
      (window as any).__kageToggleHelp?.();
    }

    // movement
    let sx = 0, sz = 0;
    if (inp.down("KeyW")) sz -= 1;
    if (inp.down("KeyS")) sz += 1;
    if (inp.down("KeyA")) sx -= 1;
    if (inp.down("KeyD")) sx += 1;
    const yaw = p.yaw;
    const mx = sx * Math.cos(yaw) + sz * Math.sin(yaw);
    const mz = -sx * Math.sin(yaw) + sz * Math.cos(yaw);
    p.localMove.set(mx, 0, mz);

    p.sprinting = p.hero.id !== "lino" && inp.down("ShiftLeft") && (mx !== 0 || mz !== 0);
    if (inp.wasPressed("ControlLeft") && p.onGround && (mx !== 0 || mz !== 0)) {
      p.slideUntil = nowSec() + 0.5;
      audio.ability("dash");
    }
    if (inp.wasPressed("Space")) p.localJump = true;

    // look
    const [dx, dy] = inp.takeMouse();
    const sens = 0.0022 * inp.sensitivity;
    p.yaw -= dx * sens;
    p.pitch = Math.max(-1.35, Math.min(1.35, p.pitch - dy * sens));

    // combat
    if (p.hero.id === "lino") { this.matter.input(p, inp); return; }
    if (inp.mouseDown(0)) firePrimary(p, this.ctx);
    if (inp.wasMousePressed(2)) castAbility(p, 1, this.ctx);
    if (inp.wasMousePressed(1)) fireAlt(p, this.ctx);
    if (inp.wasPressed("KeyV")) fireMelee(p, this.ctx);
    if (inp.wasPressed("KeyR")) startReload(p);
    if (inp.wasPressed("KeyQ")) castAbility(p, 0, this.ctx);
    if (inp.wasPressed("KeyF")) castAbility(p, 2, this.ctx);
    if (inp.wasPressed("KeyE")) castUltimate(p, this.ctx);
  }

  canOpenShop(player: Player = this.local): boolean {
    return !this.training && this.world.spawns[player.team].some(spawn => player.pos.distanceTo(spawn) < 12);
  }

  private toggleShop() {
    if (this.shopOpen) { this.closeShop(); return; }
    // must be near own spawn (safe zone)
    if (!this.canOpenShop()) {
      audio.deny();
      this.shopError = "A loja só abre perto do ponto de renascimento!";
      setTimeout(() => (this.shopError = null), 2000);
      return;
    }
    this.shopOpen = true;
    audio.ui();
    this.events.onShopState(true);
  }

  closeShop() {
    this.shopOpen = false;
    audio.ui();
    this.events.onShopState(false);
  }

  /** Buy or upgrade an item for the local player. Returns error string or null. */
  shopAction(itemId: string): string | null {
    const p = this.local;
    const def = SHOP_ITEMS.find(i => i.id === itemId);
    if (!def) return "Item desconhecido";
    const owned = p.items.find(i => i.def.id === itemId);
    if (!owned) {
      if (p.items.length >= SHOP_RULES.maxItems) return `Limite de ${SHOP_RULES.maxItems} itens atingido!`;
      const cost = def.costs[0];
      if (p.koban < cost) return "Koban insuficiente";
      p.koban -= cost;
      p.stats.kobanEarned -= 0; // spent, not earned
      p.items.push({ def, level: 1 });
      audio.buy();
    } else {
      if (owned.level >= def.levels) return "Item no nível máximo";
      const cost = def.costs[owned.level];
      if (p.koban < cost) return "Koban insuficiente";
      p.koban -= cost;
      owned.level++;
      audio.buy();
    }
    p.recomputeMods();
    return null;
  }

  shopSell(itemId: string) {
    const p = this.local;
    const idx = p.items.findIndex(i => i.def.id === itemId);
    if (idx < 0) return;
    const it = p.items[idx];
    const invested = it.def.costs.slice(0, it.level).reduce((a, b) => a + b, 0);
    const refund = Math.floor(invested * SHOP_RULES.sellReturn);
    p.koban += refund;
    p.items.splice(idx, 1);
    p.recomputeMods();
    audio.sell();
  }

  private handleDie(victim: Player, killer: Player | null) {
    if (this.training) {
      victim.respawnAt = nowSec() + 2;
      if (killer === this.local && victim.team !== killer.team) killer.stats.kills++;
      return;
    }
    if (victim.isLocal) {
      this.events.onLocalDeath();
      audio.death();
      this.world.objectiveBeacon; // touch
    }
    if (!killer || killer === victim || killer.team === victim.team) {
      this.events.onKillFeed("O ABISMO", victim.name, -1, victim.team);
      return;
    }
    killer.stats.kills++;
    // assists
    const now = nowSec();
    for (const [id, t] of victim.lastDamagers) {
      if (now - t > 6) continue;
      const dealer = this.players.find(pl => pl.id === id);
      if (dealer && dealer !== killer && dealer.alive) {
        dealer.stats.assists++;
        dealer.koban += SHOP_RULES.koban.assist;
        dealer.stats.kobanEarned += SHOP_RULES.koban.assist;
      }
    }
    // killer rewards
    killer.koban += SHOP_RULES.koban.kill;
    killer.stats.kobanEarned += SHOP_RULES.koban.kill;
    const onKillHeal = killer.stat("onKillHeal");
    if (onKillHeal > 0) killer.healRaw(killer.maxHp * onKillHeal);
    const onKillSpeed = killer.stat("onKillSpeed");
    if (onKillSpeed > 0) {
      killer.speedBoostMult = onKillSpeed;
      killer.speedBoostUntil = now + (killer.mods.onKillSpeedDur ?? 2);
    }
    this.events.onKillFeed(killer.name, victim.name, killer.team, victim.team);
    this.events.onScore([this.scores[0], this.scores[1]]);

    if (this.mode === "duelo") {
      this.scores[killer.team]++;
      this.events.onScore([this.scores[0], this.scores[1]]);
      if (this.scores[killer.team] >= GAME_MODES.duelo.winScore) this.endMatch();
    }
  }

  private handleRespawns() {
    const now = nowSec();
    for (const p of this.players) {
      if (p.alive || now < p.respawnAt) continue;
      const spawns = this.world.spawns[p.team];
      const sp = spawns[p.stats.deaths % spawns.length];
      p.respawn(new THREE.Vector3(sp.x, 0, sp.z));
      this.effects.ring(p.pos.clone(), p.team === 0 ? 0x3f9fff : 0xff3b5c, 2.5, 0.5);
      if (p.isLocal) {
        this.events.onLocalRespawn();
        audio.respawn();
      }
    }
  }

  private updateObjective(dt: number) {
    const inside: [boolean, boolean] = [false, false];
    for (const p of this.players) {
      if (!p.alive) continue;
      if (p.pos.distanceTo(this.world.objectivePos) < this.world.objectiveRadius) inside[p.team] = true;
    }
    const result = advanceCapture(this.obj, inside, dt);
    if (result.captured !== -1) {
      this.combat.emit('objective_capture', { team: result.captured });
      this.announce(result.captured === 0 ? "TIME AZUL CONTROLA O PONTO" : "TIME VERMELHO CONTROLA O PONTO");
    }
    const color = this.obj.controller === -1 ? this.world.map.accent : this.obj.controller === 0 ? 0x3f9fff : 0xff3b5c;
    (this.world.objectiveBeacon.material as THREE.MeshBasicMaterial).color.setHex(color);
    this.world.beaconLight.color.setHex(color);
    if (result.scoring !== -1) {
      const c = result.scoring;
      this.scores[c] += 2.2 * dt;
      this.events.onScore([this.scores[0], this.scores[1]]);
      if (this.scores[c] >= GAME_MODES.conquista.winScore) this.endMatch();
    }
  }

  private updateKobanTicks(dt: number) {
    const p = this.local;
    const inZone = p.alive && p.pos.distanceTo(this.world.objectivePos) < this.world.objectiveRadius;
    if (!inZone) { this.objKobanTimer[0] = 0; return; }
    this.objKobanTimer[0] += dt;
    while (this.objKobanTimer[0] >= SHOP_RULES.koban.objInterval) {
      this.objKobanTimer[0] -= SHOP_RULES.koban.objInterval;
      p.koban += SHOP_RULES.koban.objTick;
      p.stats.kobanEarned += SHOP_RULES.koban.objTick;
      audio.tick();
    }
  }

  private updateAuraRegen(dt: number) {
    for (const p of this.players) {
      if (!p.alive || p.hero.passive.mechanic !== "auraRegen") continue;
      for (const ally of this.players) {
        if (!ally.alive || ally === p || ally.team !== p.team) continue;
        if (p.pos.distanceTo(ally.pos) < (p.hero.passive.auraRadius ?? 0)) ally.healRaw((p.hero.passive.healPerSec ?? 0) * dt);
      }
    }
  }

  announce(msg: string) {
    this.announcerText = msg;
    this.announcerTimer = 3;
    this.events.onAnnounce(msg);
  }

  private endMatch() {
    if (this.state === "ended") return;
    this.state = "ended";
    const myTeam = this.local.team;
    let difference = this.scores[myTeam] - this.scores[1 - myTeam];
    if (this.mode === "conquista" && difference === 0) {
      difference = this.players.reduce((sum, p) => sum + (p.team === myTeam ? p.stats.kills : -p.stats.kills), 0);
    }
    const win = difference > 0;
    const draw = difference === 0;
    const st = this.local.stats;
    const xp = Math.round(120 + st.kills * 25 + st.damage / 80 + st.healing / 60 + (win ? 150 : 40));
    if (win) audio.victory(); else if (!draw) audio.defeat();
    this.events.onEnd({
      win,
      draw,
      score: [this.scores[0], this.scores[1]],
      stats: { ...st },
      xp,
      modeName: GAME_MODES[this.mode].name,
    });
  }

  get announcer(): string { return this.announcerText; }
  get captureProgress(): number { return this.obj.progress; }
  get captureController(): number { return this.obj.controller; }
  get captureContested(): boolean { return this.obj.contested; }
  get captureClaimant(): number { return this.obj.claimant; }

  shopData() {
    return {
      koban: Math.floor(this.local.koban),
      items: SHOP_ITEMS.map(def => {
        const owned = this.local.items.find(i => i.def.id === def.id);
        return {
          def,
          level: owned?.level ?? 0,
          nextCost: owned ? (owned.level < def.levels ? def.costs[owned.level] : null) : def.costs[0],
          maxed: owned ? owned.level >= def.levels : false,
        };
      }),
      ownedCount: this.local.items.length,
      maxItems: SHOP_RULES.maxItems,
    };
  }

  cleanup() {
    this.entities.clear();
    this.effects.clear();
    this.matter?.reset();
    ResourceTracker.dispose(...this.ownedObjects);
    this.combat.clear();
    this.ownedObjects = [];
  }

  changeHero(player: Player, heroId: string): boolean {
    const hero = HERO_MAP[heroId];
    if (!hero || !this.players.includes(player)) return false;
    this.matter.reset(player);
    this.entities.cancelOwner(player);
    for (const runtime of player.runtimes) runtime.reset();
    player.ultimateRuntime.reset();
    player.hero = hero; player.debugMaxHp = null; player.cards = []; player.items = []; player.lino = createMatterState();
    player.runtimes = hero.abilities.map(() => new AbilityRuntime());
    player.abilityCd = hero.abilities.map(() => 0);
    player.resource = 0; player.recomputeMods(); player.respawn(player.pos.clone()); player.resetCooldowns();
    if (player.isLocal && this.training) this.refillTraining();
    return true;
  }

  changeTeam(player: Player, team: number): boolean {
    if ((team !== 0 && team !== 1) || !this.players.includes(player)) return false;
    this.matter.reset(player); this.entities.cancelOwner(player); player.team = team;
    const color = team === 0 ? 0x3f9fff : 0xff3b5c;
    player.model.traverse(object => {
      if (object instanceof THREE.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material instanceof THREE.MeshBasicMaterial || material instanceof THREE.MeshStandardMaterial) material.color.setHex(color);
        if (material instanceof THREE.MeshStandardMaterial) material.emissive.setHex(color);
      }
    });
    player.respawn(this.world.spawns[team][0]);
    return true;
  }

  teleport(player: Player, x: number, y: number, z: number): boolean {
    if (![x, y, z].every(Number.isFinite) || Math.abs(x) > this.world.size.w / 2 || Math.abs(z) > this.world.size.d / 2 || y < 0 || y > 200) return false;
    this.matter.detach(player); player.dash = null; player.pos.set(x, y, z); player.vel.set(0, 0, 0);
    this.updateCamera(); return true;
  }
}
