import * as THREE from "three";
import type { Player } from '../actors/Player';
import type { World } from '../../maps/world';
import type { Effects } from '../effects/Effects';
import { rayAABB } from '../../maps/world';
import { tracePlayer } from './hitDetection';
import { hitFeedback } from './hitFeedback';
import { MeshPool, ResourceTracker } from '../../core/ResourceTracker';

export type ProjectileSource = 'weapon' | 'ability' | 'ultimate';

export interface Projectile {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  radius: number;
  damage: number;
  team: number;
  owner: Player;
  pierceLeft: number;
  life: number;
  heal: boolean;
  color: number;
  gravity: number;
  ult: boolean;
  sourceKind: ProjectileSource;
  canHeadshot: boolean;
  headshotMult?: number;
  hitIds: Set<number>;
  mesh: THREE.Mesh;
}

interface Spirit {
  kind: "heal" | "attack";
  owner: Player;
  team: number;
  pos: THREE.Vector3;
  life: number;
  target: Player | null;
  healPerSec: number;
  attackDamage: number;
  fireTimer: number;
  mesh: THREE.Mesh;
  orbitAngle: number;
  tickTimer: number;
}

interface Clone {
  owner: Player;
  team: number;
  pos: THREE.Vector3;
  life: number;
  damage: number;
  sourceKind: ProjectileSource;
  fireTimer: number;
  mesh: THREE.Mesh;
}

interface Storm {
  owner: Player;
  team: number;
  pos: THREE.Vector3;
  radius: number;
  dps: number;
  life: number;
  slow: number;
  tickTimer: number;
  mesh: THREE.Mesh;
}

interface Smoke {
  team: number;
  pos: THREE.Vector3;
  radius: number;
  life: number;
  slow: number;
  mesh: THREE.Mesh;
}

interface Mark {
  owner: Player;
  target: Player;
  life: number;
  damage: number;
  mesh: THREE.Mesh;
}

const tmp = new THREE.Vector3();

// Entity meshes own their geometry and materials; none come from a shared cache.
function disposeMesh(mesh: THREE.Mesh) {
  ResourceTracker.dispose(mesh);
}

function nearestPlayer(players: Player[], from: THREE.Vector3, team: number, maxDist: number, allies = false, los = false, world?: World): Player | null {
  let best: Player | null = null;
  let bestD = maxDist * maxDist;
  for (const p of players) {
    if (!p.alive) continue;
    if (allies ? p.team !== team : p.team === team) continue;
    const d = from.distanceToSquared(p.center);
    if (d > bestD) continue;
    if (los && world && !p.isLocal) {
      // cheap LOS: skip for performance on bots; only check world ray
    }
    bestD = d;
    best = p;
  }
  return best;
}

export class EntityManager {
  private projectilePool = new MeshPool(128);
  get all() { return [...this.projectiles, ...this.spirits, ...this.clones, ...this.storms, ...this.smokes, ...this.marks]; }
  cancelOwner(owner: Player) {
    for (const entity of this.all) if ('owner' in entity && entity.owner === owner) entity.life = 0;
  }
  projectiles: Projectile[] = [];
  spirits: Spirit[] = [];
  clones: Clone[] = [];
  storms: Storm[] = [];
  smokes: Smoke[] = [];
  marks: Mark[] = [];
  private group = new THREE.Group();

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  spawnProjectile(opts: {
    origin: THREE.Vector3; dir: THREE.Vector3; speed: number; radius: number; damage: number;
    team: number; owner: Player; color: number; pierce?: number; gravity?: number; heal?: boolean;
    life?: number; ult?: boolean; spread?: number;
    sourceKind?: ProjectileSource; canHeadshot?: boolean; headshotMult?: number;
  }) {
    const dir = opts.dir.clone();
    if (opts.spread) {
      dir.x += (Math.random() - 0.5) * opts.spread;
      dir.y += (Math.random() - 0.5) * opts.spread;
      dir.z += (Math.random() - 0.5) * opts.spread;
      dir.normalize();
    }
    const mesh = this.projectilePool.acquire(opts.color, opts.radius * 2.2, .95);
    mesh.material.depthWrite = true;
    mesh.position.copy(opts.origin);
    this.group.add(mesh);
    this.projectiles.push({
      pos: opts.origin.clone(),
      vel: dir.multiplyScalar(opts.speed),
      radius: opts.radius,
      damage: opts.damage,
      team: opts.team,
      owner: opts.owner,
      pierceLeft: opts.pierce ?? 0,
      life: opts.life ?? 3,
      heal: !!opts.heal,
      color: opts.color,
      gravity: opts.gravity ?? 0,
      ult: opts.sourceKind ? opts.sourceKind === 'ultimate' : !!opts.ult,
      sourceKind: opts.sourceKind ?? (opts.ult ? 'ultimate' : 'ability'),
      canHeadshot: opts.canHeadshot ?? opts.sourceKind === 'weapon',
      headshotMult: opts.headshotMult,
      hitIds: new Set(),
      mesh,
    });
  }

  spawnHealSpirit(owner: Player, opts: { duration: number; healPerSec: number }) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0x7ee0b0 })
    );
    mesh.position.copy(owner.center);
    this.group.add(mesh);
    this.spirits.push({
      kind: "heal", owner, team: owner.team, pos: owner.center.clone(), life: opts.duration,
      target: null, healPerSec: opts.healPerSec, attackDamage: 0, fireTimer: 0, mesh,
      orbitAngle: Math.random() * Math.PI * 2, tickTimer: 0,
    });
  }

  spawnAttackSpirit(owner: Player, opts: { duration: number; damage: number }) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffb03b })
    );
    mesh.position.copy(owner.center);
    this.group.add(mesh);
    this.spirits.push({
      kind: "attack", owner, team: owner.team, pos: owner.center.clone(), life: opts.duration,
      target: null, healPerSec: 0, attackDamage: opts.damage, fireTimer: 0.8, mesh,
      orbitAngle: Math.random() * Math.PI * 2, tickTimer: 0,
    });
  }

  spawnClone(owner: Player, pos: THREE.Vector3, opts: { duration: number; damage: number; sourceKind?: ProjectileSource }) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.55, 1.9, 10),
      new THREE.MeshBasicMaterial({ color: owner.team === 0 ? 0x3f9fff : 0xff3b5c, transparent: true, opacity: 0.65 })
    );
    mesh.position.set(pos.x, 0.95, pos.z);
    this.group.add(mesh);
    this.clones.push({ owner, team: owner.team, pos: pos.clone(), life: opts.duration, damage: opts.damage, sourceKind: opts.sourceKind ?? 'ability', fireTimer: 0.5, mesh });
  }

  spawnStorm(owner: Player, opts: { radius: number; dps: number; duration: number; slow: number }) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(opts.radius, 18, 12),
      new THREE.MeshBasicMaterial({ color: 0x5ac8ff, transparent: true, opacity: 0.25, depthWrite: false })
    );
    mesh.position.copy(owner.pos).add(new THREE.Vector3(0, 1.2, 0));
    this.group.add(mesh);
    this.storms.push({
      owner, team: owner.team, pos: owner.pos.clone(), radius: opts.radius, dps: opts.dps,
      life: opts.duration, slow: opts.slow, tickTimer: 0, mesh,
    });
  }

  spawnSmoke(team: number, pos: THREE.Vector3, opts: { radius: number; duration: number; slow: number }) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(opts.radius, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0x8888aa, transparent: true, opacity: 0.28, depthWrite: false })
    );
    mesh.position.set(pos.x, 1.1, pos.z);
    this.group.add(mesh);
    this.smokes.push({ team, pos: pos.clone(), radius: opts.radius, life: opts.duration, slow: opts.slow, mesh });
  }

  spawnMark(owner: Player, target: Player, opts: { damage: number; duration: number }) {
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.28),
      new THREE.MeshBasicMaterial({ color: 0xff3b5c })
    );
    mesh.position.copy(target.center);
    this.group.add(mesh);
    this.marks.push({ owner, target, life: opts.duration, damage: opts.damage, mesh });
  }

  cloneCount(owner: Player): number {
    return this.clones.filter(c => c.owner === owner).length;
  }

  swapWithClone(owner: Player, _range: number): boolean {
    const clone = this.clones.find(c => c.owner === owner);
    if (!clone) return false;
    const old = owner.pos.clone();
    owner.pos.set(clone.pos.x, 0, clone.pos.z);
    clone.pos.copy(old);
    clone.mesh.position.set(old.x, 0.95, old.z);
    clone.life = Math.min(clone.life, 0.01); // vanish
    return true;
  }

  update(dt: number, world: World, players: Player[], effects: Effects) {
    // projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      if (pr.life <= 0) { this.removeProjectile(i); continue; }
      const step = Math.min(dt, Math.max(0, pr.life));
      pr.life -= dt;
      pr.vel.y -= pr.gravity * step;
      const start = pr.pos.clone();
      const travel = pr.vel.length() * step;
      const dir = pr.vel.clone().normalize();
      let wallT = Infinity;
      let wallBox: import('../../maps/world').AABB | null = null;
      for (const box of world.colliders) {
        const t = rayAABB(start, dir, {
          ...box,
          min: box.min.clone().addScalar(-pr.radius),
          max: box.max.clone().addScalar(pr.radius),
        });
        if (t <= travel && t < wallT) { wallT = t; wallBox = box; }
      }
      const hits = players.flatMap(p => {
        if (!p.alive || p === pr.owner || pr.hitIds.has(p.id) ||
            (pr.heal ? p.team !== pr.team : p.team === pr.team)) return [];
        const hit = tracePlayer(start, dir, p.pos, pr.radius);
        return hit && hit.t <= travel && hit.t < wallT ? [{ p, ...hit }] : [];
      }).sort((a, b) => a.t - b.t);
      let dead = false;
      for (const hit of hits) {
        const p = hit.p;
        pr.hitIds.add(p.id);
        const point = start.clone().addScaledVector(dir, hit.t);
        pr.owner.combat.emit('projectile_hit', { source: pr.owner, target: p, point, sourceKind: pr.sourceKind, headshot: pr.canHeadshot && hit.headshot });
        if (pr.heal) {
          p.applyHeal(pr.owner, pr.damage, { spirit: false });
          if (!pr.owner.combat.presentation) effects.healSpark(point);
        } else {
          const headshot = pr.canHeadshot && hit.headshot;
          const dmg = p.applyDamage(pr.owner, pr.damage, {
            ability: pr.sourceKind !== 'weapon', ult: pr.ult, headshot, headshotMult: pr.headshotMult,
          });
          effects.impact(point, new THREE.Vector3(0, 1, 0), pr.color, 0.6);
          hitFeedback(pr.owner, p, headshot, dmg);
        }
        if (pr.pierceLeft > 0) pr.pierceLeft--;
        else { dead = true; break; }
      }
      if (!dead && Number.isFinite(wallT)) {
        pr.owner.combat.emit('projectile_hit', { source: pr.owner, target: null, point: start.clone().addScaledVector(dir, wallT), sourceKind: pr.sourceKind, headshot: false });
        if (!pr.heal && wallBox?.onDamage) {
          const abilityMult = pr.sourceKind === 'weapon' ? 1 : pr.owner.stat('abilityDamageMult');
          wallBox.onDamage(pr.owner, pr.damage * abilityMult * (pr.ult ? pr.owner.stat('ultDamageMult') : 1));
        }
        effects.impact(start.clone().addScaledVector(dir, wallT), new THREE.Vector3(0, 1, 0), pr.color, 0.7);
        dead = true;
      }
      pr.pos.copy(start).addScaledVector(dir, travel);
      pr.mesh.position.copy(pr.pos);
      pr.mesh.rotation.x += dt * 8;
      dead ||= pr.life <= 0;
      if (dead) this.removeProjectile(i);
    }

    // spirits
    for (let i = this.spirits.length - 1; i >= 0; i--) {
      const s = this.spirits[i];
      s.life -= dt;
      if (s.life <= 0) { this.removeSpirit(i); continue; }

      if (s.kind === "heal") {
        if (!s.target || !s.target.alive || s.target.hp >= s.target.maxHp) {
          s.target = nearestPlayer(players, s.pos, s.team, 25, true) as Player | null;
          // prefer wounded allies
          if (s.target) {
            for (const p of players) {
              if (p.alive && p.team === s.team && p.hp < p.maxHp && p.hp < s.target.hp) s.target = p;
            }
          }
        }
        if (s.target) {
          const d = s.pos.distanceTo(s.target.center);
          if (d > 1.1) {
            s.pos.add(tmp.copy(s.target.center).sub(s.pos).normalize().multiplyScalar(14 * dt));
          } else {
            s.tickTimer -= dt;
            if (s.tickTimer <= 0) {
              s.tickTimer = 0.5;
              s.target.applyHeal(s.owner, s.healPerSec * 0.5, { spirit: true });
              if (!s.owner.combat.presentation) effects.healSpark(s.target.center);
            }
          }
        } else {
          s.pos.add(tmp.copy(s.owner.center).sub(s.pos).normalize().multiplyScalar(8 * dt));
        }
        s.mesh.position.copy(s.pos);
      } else {
        // attack spirit: orbit owner, shoot at enemies
        s.orbitAngle += dt * 3;
        const r = 1.8;
        s.pos.set(
          s.owner.pos.x + Math.cos(s.orbitAngle) * r,
          s.owner.pos.y + 1.4,
          s.owner.pos.z + Math.sin(s.orbitAngle) * r
        );
        s.mesh.position.copy(s.pos);
        s.fireTimer -= dt;
        if (s.fireTimer <= 0) {
          s.fireTimer = 0.9;
          const target = nearestPlayer(players, s.pos, s.team, 18, false);
          if (target) {
            const dir = tmp.copy(target.center).sub(s.pos).normalize();
            this.spawnProjectile({
              origin: s.pos.clone(), dir, speed: 38, radius: 0.2, damage: s.attackDamage,
              team: s.team, owner: s.owner, color: 0xffb03b, life: 1.2, sourceKind: 'ability',
            });
          }
        }
      }
    }

    // clones / illusions
    for (let i = this.clones.length - 1; i >= 0; i--) {
      const c = this.clones[i];
      c.life -= dt;
      if (c.life <= 0) { this.removeClone(i); continue; }
      c.mesh.position.y = 0.95 + Math.sin(c.life * 6) * 0.08;
      c.fireTimer -= dt;
      if (c.fireTimer <= 0) {
        c.fireTimer = 1.1;
        const target = nearestPlayer(players, c.pos, c.team, 20, false);
        if (target) {
          const dir = target.center.sub(new THREE.Vector3(c.pos.x, 1.2, c.pos.z)).normalize();
          this.spawnProjectile({
            origin: new THREE.Vector3(c.pos.x, 1.2, c.pos.z), dir, speed: 44, radius: 0.15, damage: c.damage,
            team: c.team, owner: c.owner, color: 0xff7ad9, life: 1.4, sourceKind: c.sourceKind,
          });
        }
      }
    }

    // storms
    for (let i = this.storms.length - 1; i >= 0; i--) {
      const st = this.storms[i];
      st.pos.copy(st.owner.pos);
      st.life -= dt;
      st.mesh.position.set(st.pos.x, st.pos.y + 1.2 + Math.sin(st.life * 8) * 0.15, st.pos.z);
      if (st.life <= 0) {
        disposeMesh(st.mesh);
        this.storms.splice(i, 1);
        continue;
      }
      st.tickTimer -= dt;
      if (st.tickTimer <= 0) {
        st.tickTimer = 0.5;
        for (const p of players) {
          if (!p.alive || p.team === st.team) continue;
          if (p.pos.distanceTo(st.pos) < st.radius) {
            p.applyDamage(st.owner, st.dps * 0.5, { ability: true, ult: true });
            p.applySlow(st.slow, 0.6, st.owner);
            effects.impact(new THREE.Vector3(p.pos.x, p.pos.y + 1.2, p.pos.z), tmp.set(0, 1, 0), 0x5ac8ff, 0.4);
          }
        }
      }
    }

    // smokes
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const sm = this.smokes[i];
      sm.life -= dt;
      if (sm.life <= 0) {
        disposeMesh(sm.mesh);
        this.smokes.splice(i, 1);
        continue;
      }
      for (const p of players) {
        if (!p.alive || p.team === sm.team) continue;
        const d = Math.hypot(p.pos.x - sm.pos.x, p.pos.z - sm.pos.z);
        if (d < sm.radius) p.applySlow(sm.slow, 0.3);
      }
    }

    // marks
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i];
      m.life -= dt;
      m.mesh.position.copy(m.target.center).add(tmp.set(0, 2.2 + Math.sin(m.life * 10) * 0.2, 0));
      if (m.life <= 0) {
        if (m.target.alive) m.target.applyDamage(m.owner, m.damage, { ability: true, ult: true });
        disposeMesh(m.mesh);
        this.marks.splice(i, 1);
      }
    }
  }

  private removeProjectile(i: number) {
    const p = this.projectiles[i];
    this.projectilePool.release(p.mesh);
    this.projectiles.splice(i, 1);
  }
  private removeSpirit(i: number) {
    const s = this.spirits[i];
    disposeMesh(s.mesh);
    this.spirits.splice(i, 1);
  }
  private removeClone(i: number) {
    const c = this.clones[i];
    disposeMesh(c.mesh);
    this.clones.splice(i, 1);
  }

  clear() {
    for (const entities of [this.projectiles, this.spirits, this.clones, this.storms, this.smokes, this.marks]) {
      for (const entity of entities) disposeMesh(entity.mesh);
    }
    this.projectiles = []; this.spirits = []; this.clones = []; this.storms = []; this.smokes = []; this.marks = [];
    this.projectilePool.clear();
  }
}
