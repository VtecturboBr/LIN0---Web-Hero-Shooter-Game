import { hitFeedback } from '../combat/hitFeedback';
import { createMatterState, type LinoMatter } from '../../characters/lino/LinoMatter';
import { gameNow } from '../../core/time';
import * as THREE from "three";
import type { HeroDef, Mods, StatKey, TeamId, WeaponDef, ShopItemDef } from '../../core/types';
import { cardMods } from '../../progression/cards/catalog';
import { CombatEventSystem } from '../combat/CombatEventSystem';
import { StatusEffectManager } from '../combat/StatusEffectManager';
import { AbilityRuntime } from '../combat/AbilityRuntime';
import { audio } from '../../core/audio';
import { moveWithCollision, raycastWorld } from '../../maps/world';
import type { World } from '../../maps/world';
import type { EntityManager } from '../combat/projectiles';
import type { Effects } from '../effects/Effects';

const nowSec = () => gameNow();

/** Stats that are used as raw additive values (fractions or amounts), not multipliers. */
const ADDITIVE: Set<StatKey> = new Set([
  "hpRegen", "dmgResist", "lifesteal", "onKillHeal", "onKillSpeed", "lowHpDamage",
  "defensiveShield", "cloneCount", "smokeDuration", "onKillSpeedDur",
]);

export interface DamageOpts {
  status?: string;
  ability?: boolean;
  ult?: boolean;
  headshot?: boolean;
  headshotMult?: number;
  melee?: boolean;
  dash?: boolean;
}

export interface GameCtx {
  matter?: LinoMatter;
  world: World;
  players: Player[];
  entities: EntityManager;
  effects: Effects;
}

export interface BotInput {
  move: THREE.Vector3;
  yaw: number;
  pitch: number;
  shoot: boolean;
  altShoot: boolean;
  melee: boolean;
  ability: number;   // -1 none, 0/1/2 index
  ult: boolean;
  jump: boolean;
}

let nextId = 1;

export class Player {
  combat = new CombatEventSystem();
  readonly status = new StatusEffectManager(this);
  runtimes: AbilityRuntime[] = [];
  ultimateRuntime = new AbilityRuntime();
  debugInvincible = false;
  debugMaxHp: number | null = null;
  headshotsOnly = false;
  get actionBlocked() { return this.runtimes.some(r => r.blocksActions) || this.ultimateRuntime.blocksActions; }
  resetCooldowns(resetWeapon = true) {
    this.abilityCd.fill(0);
    if (resetWeapon) this.fireCd = this.altCd = this.meleeCd = 0;
    for (const runtime of this.runtimes) if (runtime.state === 'COOLDOWN') runtime.reset();
  }
  id = nextId++;
  name: string;
  hero: HeroDef;
  team: TeamId;
  isBot: boolean;
  isLocal = false;
  botInput: BotInput | null = null;

  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  onGround = true;
  jumpsLeft = 1;

  mods: Mods = {};
  hp: number;
  shield = 0;
  shieldUntil = 0;
  alive = true;
  respawnAt = 0;
  invulnUntil = 0;

  viewAction: { kind: 'fire' | 'melee' | 'ability' | 'ultimate'; time: number } = { kind: 'fire', time: -Infinity };
  animateWeapon(kind: 'fire' | 'melee' | 'ability' | 'ultimate') {
    if (this.isLocal) this.viewAction = { kind, time: gameNow() };
  }

  // weapon state
  weaponAmmo: number;
  reloading = false;
  reloadEnd = 0;
  fireCd = 0;
  meleeCd = 0;
  altCd = 0;

  abilityCd: number[] = [];
  lino = createMatterState();
  resource = 0;
  sprinting = false;
  slideUntil = 0;

  buffs: { stat: StatKey; mult: number; until: number }[] = [];
  slowUntil = 0;
  slowMult = 0;
  speedBoostUntil = 0;
  speedBoostMult = 0;
  kenjiStacks = 0;
  kenjiStacksUntil = 0;
  dash: { dir: THREE.Vector3; until: number; speed: number; damage: number; radius: number; invuln: number; hitIds: Set<number> } | null = null;

  cards: import("../../core/types").DeckCard[] = [];
  items: { def: ShopItemDef; level: number }[] = [];
  koban = 0;
  stats = { kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, kobanEarned: 0 };

  lastDamagers = new Map<number, number>();
  damageSources: Set<Player> = new Set();

  // visual
  model = new THREE.Group();
  private label: THREE.Sprite | null = null;
  private labelCanvas = document.createElement("canvas");
  private labelTex: THREE.CanvasTexture | null = null;
  private labelTimer = 0;
  private bodyMesh: THREE.Mesh;
  private headMesh: THREE.Mesh;
  private auraBody: THREE.Mesh;
  private auraHead: THREE.Mesh;
  private auraDisc: THREE.Mesh;

  onDie: ((victim: Player, killer: Player | null) => void) | null = null;

  readonly radius = 0.42;
  readonly height = 1.8;

  get eyeHeight(): number {
    return gameNow() < this.slideUntil ? 1.0 : 1.6;
  }

  constructor(hero: HeroDef, team: TeamId, name: string, isBot: boolean) {
    this.hero = hero;
    this.team = team;
    this.name = name;
    this.isBot = isBot;
    this.hp = hero.hp;
    this.weaponAmmo = hero.weapon.ammo > 0 ? hero.weapon.ammo : -1;
    this.abilityCd = hero.abilities.map(() => 0);
    this.runtimes = hero.abilities.map(() => new AbilityRuntime());
    this.jumpsLeft = hero.passive.mechanic === "doubleJump" ? 2 : 1;

    // model
    const teamColor = team === 0 ? 0x3f9fff : 0xff3b5c;
    const bodyMat = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.5, emissive: teamColor, emissiveIntensity: 0.35 });
    this.bodyMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 1.3, 12), bodyMat);
    this.bodyMesh.position.y = 0.95;
    this.headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), new THREE.MeshStandardMaterial({ color: teamColor, emissive: teamColor, emissiveIntensity: 0.35, roughness: 0.7 }));
    this.headMesh.position.y = 1.72;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.05, 8, 20),
      new THREE.MeshBasicMaterial({ color: teamColor })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.06;
    this.model.add(this.bodyMesh, this.headMesh, ring);
    this.model.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });

    // team-colored outline aura (BackSide trick)
    const isEnemy = team === 1;
    const auraColor = teamColor;
    const auraOpacity = isEnemy ? 0.45 : 0.22;
    const auraBodyScale = isEnemy ? 1.18 : 1.1;
    const auraHeadScale = isEnemy ? 1.25 : 1.15;
    const auraMat = new THREE.MeshBasicMaterial({ color: auraColor, transparent: true, opacity: auraOpacity, side: THREE.BackSide, depthWrite: false });
    this.auraBody = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 1.3, 12), auraMat);
    this.auraBody.position.y = 0.95;
    this.auraBody.scale.setScalar(auraBodyScale);
    this.auraHead = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), auraMat);
    this.auraHead.position.y = 1.72;
    this.auraHead.scale.setScalar(auraHeadScale);
    // ground disc glow
    const discMat = new THREE.MeshBasicMaterial({ color: auraColor, transparent: true, opacity: isEnemy ? 0.35 : 0.18, side: THREE.DoubleSide, depthWrite: false });
    this.auraDisc = new THREE.Mesh(new THREE.RingGeometry(0.5, 1.1, 24), discMat);
    this.auraDisc.rotation.x = -Math.PI / 2;
    this.auraDisc.position.y = 0.02;
    this.model.add(this.auraBody, this.auraHead, this.auraDisc);
    // name label
    this.labelCanvas.width = 256;
    this.labelCanvas.height = 80;
    this.labelTex = new THREE.CanvasTexture(this.labelCanvas);
    const spriteMat = new THREE.SpriteMaterial({ map: this.labelTex, depthTest: false, transparent: true });
    this.label = new THREE.Sprite(spriteMat);
    this.label.scale.set(1.7, 0.53, 1);
    this.label.position.y = 2.6;
    this.model.add(this.label);
    this.drawLabel();
  }

  get center(): THREE.Vector3 {
    return new THREE.Vector3(this.pos.x, this.pos.y + 1.0, this.pos.z);
  }

  get eyePos(): THREE.Vector3 {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
  }

  get maxHp(): number {
    return this.debugMaxHp ?? this.hero.hp * this.stat("maxHp");
  }

  get weapon(): WeaponDef {
    return this.hero.weapon;
  }

  get speed(): number {
    let s = this.hero.moveSpeed * this.stat("moveSpeed");
    const now = nowSec();
    s *= 1 - Math.min(.95, Math.max(0, now < this.slowUntil ? this.slowMult : 0, this.status.value('slow')));
    if (now < this.speedBoostUntil) s *= 1 + this.speedBoostMult;
    if (this.kenjiStacks > 0 && now < this.kenjiStacksUntil) s *= 1 + (this.hero.passive.stackSpeed ?? 0) * this.kenjiStacks;
    if (this.sprinting && (this.localMove.lengthSq() > 0 || this.botInput)) s *= 1.32;
    if (now < this.slideUntil) s *= 1.45;
    return s;
  }

  get ultReady(): boolean { return this.resource >= 100; }

  // ---------------- stats ----------------
  recomputeMods() {
    const m: Mods = {};
    const add = (mods?: Mods) => {
      if (!mods) return;
      for (const k of Object.keys(mods) as StatKey[]) {
        // Kill speed stacks in strength; its duration is the longest source, not their sum.
        m[k] = k === 'onKillSpeedDur' ? Math.max(m[k] ?? 0, mods[k] ?? 0) : (m[k] ?? 0) + (mods[k] ?? 0);
      }
    };
    add(this.hero.passive.mods);
    for (const card of this.cards) add(cardMods(card));
    for (const it of this.items) add(it.def.mods[it.level - 1]);
    this.mods = m;
    if (this.hp > this.maxHp) this.hp = this.maxHp;
  }

  stat(key: StatKey): number {
    const base = (this.mods[key] ?? 0) + this.status.modifier(key);
    if (ADDITIVE.has(key)) {
      let b = 0;
      const now = nowSec();
      for (const bu of this.buffs) if (bu.stat === key && bu.until > now) b += bu.mult;
      return base + b;
    }
    let b = 0;
    const now = nowSec();
    for (const bu of this.buffs) if (bu.stat === key && bu.until > now) b += bu.mult;
    return Math.max(0, 1 + base + b);
  }

  explainStat(key: StatKey) {
    const sources = [
      { source: `Passiva: ${this.hero.passive.name}`, value: this.hero.passive.mods?.[key] ?? 0 },
      ...this.cards.map(card => ({ source: `Carta: ${card.id} nível ${card.level}`, value: cardMods(card)[key] ?? 0 })),
      ...this.items.map(item => ({ source: `Item: ${item.def.name} nível ${item.level}`, value: item.def.mods[item.level - 1]?.[key] ?? 0 })),
      ...this.buffs.filter(b => b.stat === key && b.until > gameNow()).map(b => ({ source: 'Buff', value: b.mult })),
      { source: 'Status', value: this.status.modifier(key) },
    ].filter(s => s.value !== 0);
    return { key, base: ADDITIVE.has(key) ? 0 : 1, operation: key === 'onKillSpeedDur' ? 'max' : 'sum', sources, final: this.stat(key) };
  }

  critMult(base = this.weapon.headshotMult ?? 1.5): number {
    return Math.max(0, base + this.stat('headshotMult') - 1);
  }

  // ---------------- damage / heal ----------------
  applyDamage(source: Player, amount: number, opts: DamageOpts = {}): number {
    const now = nowSec();
    if (!this.alive || now < this.invulnUntil || this.debugInvincible || this.status.value('invulnerability') > 0 || this === source ||
        !Number.isFinite(amount) || amount <= 0 || (this.headshotsOnly && !opts.headshot)) return 0;
    let dmg = amount * source.stat("damageMult");
    if (opts.headshot) dmg *= source.critMult(opts.headshotMult);
    if (opts.ability) dmg *= source.stat("abilityDamageMult");
    if (opts.melee) dmg *= source.stat("meleeDamageMult");
    if (opts.ult) dmg *= source.stat("ultDamageMult");
    if (opts.dash) dmg *= source.stat("dashDamageMult");
    if (source.hp / source.maxHp < 0.4) dmg *= 1 + source.stat("lowHpDamage");
    const resist = Math.min(0.85, Math.max(0, this.stat("dmgResist")));
    dmg *= 1 - resist;
    dmg *= Math.max(0, 1 + this.status.value('vulnerability'));
    if (dmg <= 0) return 0;

    dmg = Math.min(dmg, Math.max(0, this.hp) + this.shield);
    const absorbed = Math.min(this.shield, dmg);
    this.shield -= absorbed;
    this.hp -= dmg - absorbed;

    this.lastDamagers.set(source.id, now);
    this.damageSources.add(source);
    this.combat.emit('damage', { source, target: this, amount: dmg, absorbed, opts,
      sourceKind: opts.status ? 'status' : opts.ult ? 'ultimate' : opts.ability ? 'ability' : 'weapon', killed: this.hp <= 0 });
    if (opts.headshot) this.combat.emit('headshot', { source, target: this, amount: dmg });
    if (this.hp <= 0) this.die(source);
    return dmg;
  }

  healRaw(amount: number) {
    if (!this.alive || !Number.isFinite(amount) || amount <= 0) return;
    const before = this.hp;
    this.hp += Math.min(amount, Math.max(0, this.maxHp - this.hp));
    if (this.hp > before) this.combat.emit('heal', { source: this, target: this, amount: this.hp - before, rewards: false });
  }

  applyHeal(source: Player, amount: number, opts: { spirit?: boolean } = {}): number {
    if (!this.alive || !Number.isFinite(amount) || amount <= 0) return 0;
    let amt = amount * source.stat("healMult");
    if (opts.spirit) amt *= source.stat("spiritHealMult");
    const before = this.hp;
    this.hp += Math.min(amt, Math.max(0, this.maxHp - this.hp));
    const done = this.hp - before;
    if (done > 0) {
      this.combat.emit('heal', { source, target: this, amount: done, rewards: true });
    }
    return done;
  }

  grantShield(amount: number, duration: number, source: Player = this) {
    if (!this.alive || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(duration) || duration <= 0) return;
    const before = this.shield;
    this.shield = Math.min(300, this.shield + amount * this.stat("shieldMult"));
    this.shieldUntil = Math.max(this.shieldUntil, nowSec() + duration);
    this.combat.emit('shield', { source, target: this, amount: this.shield - before, duration });
  }

  healOverTime(source: Player, perSec: number, duration: number, spirit = false) {
    if (this.alive) this.status.add({ id: 'heal-over-time', kind: 'hot', source, value: perSec, duration, spirit, stacking: 'stack' });
  }

  addResource(amount: number) {
    if (!this.alive) return;
    const gain = amount * this.stat("resourceGain") * this.stat("ultGain");
    const before = this.resource;
    this.resource = Math.min(100, this.resource + gain);
    if (before < 100 && this.resource >= 100 && this.isLocal) audio.ultReady();
  }

  useUlt() { this.resource = 0; }

  applySlow(mult: number, dur: number, source: Player = this) {
    if (!this.status.add({ id: 'slow', kind: 'slow', source, value: mult, duration: dur, stacking: 'strongest' })) return;
    this.slowMult = nowSec() < this.slowUntil ? Math.max(this.slowMult, mult) : mult;
    this.slowUntil = Math.max(this.slowUntil, nowSec() + dur);
  }

  addBuff(stat: StatKey, mult: number, duration: number, source: Player = this) {
    this.status.add({ id: `buff:${stat}`, kind: 'buff', stat, value: mult, duration, source, stacking: 'stack' });
  }

  die(source: Player | null) {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    this.stats.deaths++;
    this.respawnAt = nowSec() + 5;
    this.dash = null;
    this.buffs = [];
    this.status.clear();
    for (const runtime of this.runtimes) runtime.interrupt(true);
    this.ultimateRuntime.interrupt(true);
    this.shield = 0;
    this.combat.emit('kill', { source, target: this });
    this.onDie?.(this, source);
  }

  respawn(pos: THREE.Vector3) {
    this.status.clear(); this.buffs = [];
    this.dash = null;
    this.speedBoostUntil = this.slideUntil = this.kenjiStacksUntil = 0; this.kenjiStacks = 0;
    this.alive = true;
    this.hp = this.maxHp;
    this.shield = 0;
    this.shieldUntil = 0;
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.reloading = false;
    this.weaponAmmo = this.hero.weapon.ammo > 0 ? Math.ceil(this.hero.weapon.ammo * this.stat("ammoMult")) : -1;
    this.invulnUntil = nowSec() + 2;
    this.lastDamagers.clear();
    this.damageSources.clear();
    this.slowUntil = 0;
  }

  // ---------------- movement / update ----------------
  aimDir(): THREE.Vector3 {
    return new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    ).normalize();
  }

  private drawLabel() {
    const c = this.labelCanvas.getContext("2d")!;
    c.clearRect(0, 0, 256, 80);
    const isAlly = this.team === 0;
    const teamColor = isAlly ? "#3f9fff" : "#ff3b5c";
    const teamBadge = isAlly ? "ALIADO" : "INIMIGO";
    // team badge
    c.font = "bold 12px sans-serif";
    c.textAlign = "center";
    c.fillStyle = teamColor;
    c.fillText(teamBadge, 128, 16);
    // name
    c.font = "bold 22px sans-serif";
    c.fillStyle = teamColor;
    c.fillText(this.name, 128, 38);
    // hp bar
    const frac = Math.max(0, Math.min(1, this.hp / this.maxHp));
    c.fillStyle = "rgba(0,0,0,0.55)";
    c.fillRect(38, 52, 180, 12);
    c.fillStyle = teamColor;
    c.fillRect(40, 54, 176 * frac, 8);
    if (this.labelTex) this.labelTex.needsUpdate = true;
  }

  update(dt: number, ctx: GameCtx) {
    const now = nowSec();
    this.fireCd -= dt;
    this.meleeCd -= dt;
    this.altCd -= dt;
    for (let i = 0; i < this.abilityCd.length; i++) {
      this.abilityCd[i] = Math.max(0, this.abilityCd[i] - dt);
      this.runtimes[i]?.update(dt, this.abilityCd[i]);
    }
    this.ultimateRuntime.update(dt, this.ultReady ? 0 : 1);

    if (this.reloading && now >= this.reloadEnd) {
      this.reloading = false;
      this.weaponAmmo = this.hero.weapon.ammo > 0 ? Math.ceil(this.hero.weapon.ammo * this.stat("ammoMult")) : -1;
    }
    if (now >= this.shieldUntil && this.shieldUntil > 0) this.shield = 0;
    if (this.kenjiStacksUntil < now) this.kenjiStacks = 0;

    if (!this.alive) {
      this.model.visible = false;
      return;
    }
    this.model.visible = true;

    this.auraBody.visible = this.auraHead.visible = this.auraDisc.visible = !this.isLocal;

    // pulse enemy aura
    if (this.team === 1 && this.auraBody.material instanceof THREE.MeshBasicMaterial) {
      const pulse = 0.35 + Math.sin(now * 4) * 0.1;
      (this.auraBody.material as THREE.MeshBasicMaterial).opacity = pulse;
      (this.auraHead.material as THREE.MeshBasicMaterial).opacity = pulse;
      (this.auraDisc.material as THREE.MeshBasicMaterial).opacity = pulse * 0.7;
    }

    // ---- movement input ----
    const move = new THREE.Vector3();
    if (this.botInput) {
      move.copy(this.botInput.move);
      this.yaw = this.botInput.yaw;
      this.pitch = this.botInput.pitch;
    } else {
      // local handled by match (keys -> wish vector)
      move.copy(this.localMove);
      this.localMove.set(0, 0, 0);
    }
    const wish = new THREE.Vector3();
    if (this.dash) {
      wish.copy(this.dash.dir);
      if (now < this.dash.until) {
        this.vel.x = this.dash.dir.x * this.dash.speed;
        this.vel.z = this.dash.dir.z * this.dash.speed;
        // dash damage
        for (const p of ctx.players) {
          if (!p.alive || p === this || p.team === this.team || this.dash.hitIds.has(p.id)) continue;
          if (p.pos.distanceTo(this.pos) < this.dash.radius + 0.9) {
            const toTarget = p.center.sub(this.center);
            if (raycastWorld(ctx.world, this.center, toTarget.clone().normalize(), toTarget.length())) continue;
            this.dash.hitIds.add(p.id);
            const dealt = p.applyDamage(this, this.dash.damage, { ability: true, dash: true });
            if (this.isLocal) hitFeedback(this, p, false, dealt);
            ctx.effects.impact(p.center, new THREE.Vector3(0, 1, 0), this.hero.color, 0.7);
            if (!this.combat.presentation) audio.hit(false);
          }
        }
        if (this.dash.invuln > 0) this.invulnUntil = now + this.dash.invuln;
      } else {
        this.dash = null;
      }
    } else {
      const spd = this.speed;
      move.normalize().multiplyScalar(spd);
      if (this.hero.id === 'lino' && !this.onGround) {
        // Strong air steering without damping the launch when no direction is held.
        const cap = Math.max(spd * 1.4, Math.hypot(this.vel.x, this.vel.z));
        const direction = move.clone().normalize();
        this.vel.x += direction.x * 42 * dt;
        this.vel.z += direction.z * 42 * dt;
        const horizontal = Math.hypot(this.vel.x, this.vel.z);
        if (horizontal > cap) { this.vel.x *= cap / horizontal; this.vel.z *= cap / horizontal; }
      } else {
      const accel = this.onGround ? (this.lino.anchor ? 1 : 12) : (this.lino.anchor || now < this.lino.momentumUntil) ? (move.lengthSq() > 0 ? .6 : 0) : 4;
      this.vel.x += (move.x - this.vel.x) * Math.min(1, accel * dt);
      this.vel.z += (move.z - this.vel.z) * Math.min(1, accel * dt);
      }
      wish.copy(this.vel);
    }

    // jump
    if (this.botInput ? this.botInput.jump : this.localJump) {
      if (this.onGround) {
        this.vel.y = this.hero.jumpPower * this.stat("jumpPower");
        this.onGround = false;
        this.jumpsLeft = Math.max(0, this.jumpsLeft - 1);
      } else if (this.hero.passive.mechanic === "doubleJump" && this.jumpsLeft > 0) {
        this.vel.y = this.hero.jumpPower * this.stat("jumpPower") * 0.95;
        this.jumpsLeft--;
        audio.ability("dash");
      }
    }
    if (this.localJump) this.localJump = false;
    if (this.botInput) this.botInput.jump = false;

    // gravity + integrate
    this.vel.y -= 26 * dt;
    ctx.matter?.physics(this, dt);
    const res = movePlayer(ctx.world, this.pos, this.vel, dt, this.radius, this.height);
    if (res.onGround) {
      this.onGround = true;
      if (this.hero.passive.mechanic === "doubleJump") this.jumpsLeft = 2;
      else this.jumpsLeft = 1;
    } else this.onGround = false;

    this.status.update(dt);
    this.buffs = this.buffs.filter(buff => buff.until > now);
    this.hp = Math.min(this.hp, this.maxHp);

    // regen
    const regen = this.stat("hpRegen");
    if (regen > 0) this.healRaw(regen * dt);
    const resRegen = this.hero.resource.regen;
    if (resRegen && this.alive) this.addResource(resRegen * dt);

    // model placement
    this.model.position.copy(this.pos);
    this.model.rotation.y = this.yaw;
    this.labelTimer -= dt;
    if (this.labelTimer <= 0) {
      this.labelTimer = 0.25;
      this.drawLabel();
    }
  }

  // local input staging (filled by match)
  localMove = new THREE.Vector3();
  localJump = false;
}

function movePlayer(world: World, pos: THREE.Vector3, vel: THREE.Vector3, dt: number, r: number, h: number) {
  // Fast tether launches must still collide with thin walls between frames.
  const steps = Math.max(1, Math.ceil(vel.length() * dt / .25));
  let result = { onGround: false };
  for (let i = 0; i < steps; i++) result = moveWithCollision(world, pos, vel, dt / steps, r, h);
  return result;
}
