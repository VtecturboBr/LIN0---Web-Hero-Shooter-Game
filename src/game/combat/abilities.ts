import { gameNow } from '../../core/time';
import * as THREE from "three";
import type { Player, GameCtx } from '../actors/Player';
import type { AbilityDef } from '../../core/types';
import { audio } from '../../core/audio';
import { moveWithCollision, raycastWorld } from '../../maps/world';
import type { ActiveStatus } from './StatusEffectManager';

function nearestEnemy(p: Player, ctx: GameCtx, maxDist: number): Player | null {
  let best: Player | null = null;
  let bestD = maxDist * maxDist;
  for (const pl of ctx.players) {
    if (!pl.alive || pl === p || pl.team === p.team) continue;
    const d = p.pos.distanceToSquared(pl.pos);
    if (d < bestD) { bestD = d; best = pl; }
  }
  return best;
}

function beamHit(p: Player, ctx: GameCtx, range: number, damage: number, color: number, ult = false) {
  const eye = p.eyePos;
  const dir = p.aimDir();
  const worldHit = raycastWorld(ctx.world, eye, dir, range);
  let hitT = worldHit?.t ?? range;
  let target: Player | null = null;
  for (const pl of ctx.players) {
    if (!pl.alive || pl === p || pl.team === p.team) continue;
    const oc = eye.clone().sub(pl.center);
    const b = oc.dot(dir);
    const c = oc.dot(oc) - 0.62 * 0.62;
    const disc = b * b - c;
    if (disc < 0) continue;
    const t = -b - Math.sqrt(disc);
    if (t >= 0 && t < hitT) { hitT = t; target = pl; }
  }
  const end = eye.clone().addScaledVector(dir, hitT);
  ctx.effects.beam(eye, end, color);
  if (target) {
    target.applyDamage(p, damage, { ability: true, ult });
    ctx.effects.impact(end, new THREE.Vector3(0, 1, 0), color, 0.7);
    if (p.isLocal && !p.combat.presentation) audio.hit(false);
  } else if (worldHit) {
    worldHit.box.onDamage?.(p, damage);
    ctx.effects.impact(worldHit.point, worldHit.normal, color, 0.7);
  }
}

function blink(p: Player, ctx: GameCtx, range: number) {
  const dir = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
  const steps = Math.ceil(range / 0.4);
  for (let i = 0; i < steps; i++) {
    const vel = dir.clone().multiplyScalar(0.4);
    const before = p.pos.clone();
    moveWithCollision(ctx.world, p.pos, vel, 1, p.radius, p.height);
    if (p.pos.distanceTo(before) < 0.05) break;
  }
}

export function castAbility(p: Player, idx: number, ctx: GameCtx): boolean {
  if (!p.alive || !Number.isInteger(idx) || idx < 0 || idx >= p.hero.abilities.length) return false;
  if (p.hero.id === 'lino' && ctx.matter) return ctx.matter.cast(p, idx);
  const ab = p.hero.abilities[idx];
  if (p.abilityCd[idx] > 0 || p.actionBlocked) return false;
  const runtime = p.runtimes[idx];
  if (runtime && (runtime.state === 'CASTING' || runtime.state === 'ACTIVE')) return false;
  p.abilityCd[idx] = ab.cooldown * p.stat("cooldownMult");
  if (ab.defensive) {
    const amt = p.stat("defensiveShield");
    if (amt > 0) p.grantShield(amt, 3);
  }
  if (p.hero.resource.gainPerCast) p.addResource(p.hero.resource.gainPerCast);
  p.animateWeapon('ability');
  runAbility(p, ab, idx, ctx, false);
  return true;
}

export function castUltimate(p: Player, ctx: GameCtx): boolean {
  if (p.hero.id === 'lino' && ctx.matter) return ctx.matter.ultimate(p);
  if (!p.alive || !p.ultReady || p.actionBlocked || p.ultimateRuntime.state === 'ACTIVE') return false;
  p.useUlt();
  p.animateWeapon('ultimate');
  runAbility(p, p.hero.ultimate, -1, ctx, true);
  return true;
}

function runAbility(p: Player, ab: AbilityDef, index: number, ctx: GameCtx, ultimate: boolean) {
  const runtime = index < 0 ? p.ultimateRuntime : p.runtimes[index];
  const activate = () => execute(p, ab, ctx, ultimate);
  let spawned: { life: number }[] = [];
  let statuses: { target: Player; effect: ActiveStatus }[] = [];
  p.combat.emit('ability_cast', { source: p, ability: ab, ultimate });
  runtime.start({ duration: ab.config.duration, ...ab.runtime }, {
    activate: () => {
      const before = new Set(ctx.entities.all);
      const previousStatuses = new Set(ctx.players.flatMap(target => target.status.active));
      activate(); spawned = ctx.entities.all.filter(entity => !before.has(entity));
      statuses = ctx.players.flatMap(target => target.status.active.filter(effect => !previousStatuses.has(effect)).map(effect => ({ target, effect })));
    },
    end: interrupted => {
      if (!interrupted) return;
      for (const entity of spawned) entity.life = 0;
      for (const { target, effect } of statuses) target.status.cancel(effect);
      if (ab.kind === 'dash' || ab.kind === 'clone') p.dash = null;
    },
  });
}

function execute(p: Player, ab: AbilityDef, ctx: GameCtx, isUlt: boolean) {
  const cfg = ab.config;
  const radius = (cfg.radius ?? 5) * p.stat("abilityRadius");
  if (!p.combat.presentation) { audio.ability(ab.kind); if (isUlt) audio.ult(); }

  switch (ab.kind) {
    case "dash": {
      const dir = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      p.dash = {
        dir,
        until: gameNow() + (cfg.duration ?? 0.25),
        speed: cfg.speed ?? 20,
        damage: cfg.damage ?? 0,
        radius: cfg.radius ?? 1.6,
        invuln: cfg.invuln ?? 0,
        hitIds: new Set(),
      };
      ctx.effects.ring(p.pos.clone(), ab.config.trailColor ?? p.hero.color, 2);
      break;
    }
    case "projectile":
    case "wave": {
      const eye = p.eyePos;
      const dir = p.aimDir();
      const shots = cfg.shots ?? 1;
      for (let i = 0; i < shots; i++) {
        const d = dir.clone();
        if (shots > 1) {
          const spread = cfg.spread ?? 0.2;
          d.x += (i - (shots - 1) / 2) * spread;
          d.z += (i - (shots - 1) / 2) * spread;
          d.normalize();
        }
        ctx.entities.spawnProjectile({
          origin: eye.clone(), dir: d, speed: cfg.speed ?? 45,
          radius: cfg.radius ?? 0.4, damage: cfg.damage ?? 50,
          team: p.team, owner: p, color: cfg.trailColor ?? p.hero.color,
          pierce: cfg.pierce ?? 0, life: cfg.duration ?? 2.5, ult: isUlt,
          sourceKind: isUlt ? 'ultimate' : 'ability',
        });
      }
      ctx.effects.muzzle(eye, dir, cfg.trailColor ?? p.hero.color);
      break;
    }
    case "beam":
      beamHit(p, ctx, cfg.range ?? 25, cfg.damage ?? 60, cfg.trailColor ?? 0x5ac8ff, isUlt);
      break;
    case "slam": {
      const pos = p.pos.clone();
      ctx.effects.ring(pos, cfg.trailColor ?? p.hero.color, radius);
      ctx.effects.ring(pos, cfg.trailColor ?? p.hero.color, radius * 0.6, 0.6);
      for (const t of ctx.players) {
        if (!t.alive || t === p || t.team === p.team) continue;
        const d = t.pos.distanceTo(pos);
        if (d < radius + 0.8) {
          t.applyDamage(p, cfg.damage ?? 60, { ability: true, ult: isUlt });
          if (cfg.slow) t.applySlow(cfg.slow, cfg.slowDur ?? 2, p);
          if (cfg.knockback) {
            const away = t.pos.clone().sub(pos);
            away.y = 0;
            if (away.lengthSq() > 0.01) away.normalize().multiplyScalar(cfg.knockback);
            t.vel.add(away);
          }
          ctx.effects.impact(t.center, new THREE.Vector3(0, 1, 0), cfg.trailColor ?? p.hero.color, 0.6);
        }
      }
      break;
    }
    case "buff":
      p.addBuff(cfg.buffStat ?? "dmgResist", cfg.buffMult ?? 0.3, cfg.duration ?? 3);
      ctx.effects.ring(p.pos.clone(), cfg.trailColor ?? p.hero.color, 3, 0.4);
      break;
    case "shield": {
      p.grantShield(cfg.shield ?? 100, cfg.duration ?? 4);
      if (!p.combat.presentation) ctx.effects.ring(p.pos.clone(), 0x7ee0b0, 2.5, 0.5);
      break;
    }
    case "smoke":
      ctx.entities.spawnSmoke(p.team, p.pos.clone(), { radius: radius, duration: (cfg.duration ?? 4) + p.stat("smokeDuration"), slow: cfg.slow ?? 0.3 });
      ctx.effects.smokeCloud(p.pos.clone(), 0x7777aa, radius, 1);
      break;
    case "clone": {
      const count = (cfg.cloneCount ?? 1) + Math.round(p.stat("cloneCount"));
      for (let i = 0; i < count; i++) {
        ctx.entities.spawnClone(p, p.pos.clone().add(new THREE.Vector3((i % 2) * 0.6 - 0.3, 0, 0.3)), {
          duration: cfg.cloneDuration ?? 4, damage: cfg.damage ?? 8,
        });
      }
      const dir = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      p.dash = {
        dir, until: gameNow() + (cfg.duration ?? 0.25),
        speed: cfg.speed ?? 20, damage: 0, radius: 1, invuln: 0.1, hitIds: new Set(),
      };
      ctx.effects.ring(p.pos.clone(), cfg.trailColor ?? p.hero.color, 2);
      break;
    }
    case "teleport": {
      if (!ctx.entities.swapWithClone(p, cfg.range ?? 8)) blink(p, ctx, cfg.range ?? 8);
      ctx.effects.ring(p.pos.clone(), 0xff7ad9, 2, 0.4);
      break;
    }
    case "summon": {
      if (cfg.summonKind === "heal") {
        ctx.entities.spawnHealSpirit(p, { duration: cfg.duration ?? 6, healPerSec: cfg.healPerSec ?? 20 });
      } else {
        ctx.entities.spawnAttackSpirit(p, { duration: cfg.duration ?? 7, damage: cfg.damage ?? 18 });
      }
      break;
    }
    case "storm":
      ctx.entities.spawnStorm(p, { radius: radius, dps: cfg.dps ?? 60, duration: cfg.duration ?? 4.5, slow: cfg.slow ?? 0.3 });
      ctx.effects.ring(p.pos.clone(), 0x5ac8ff, radius, 0.7);
      break;
    case "illusions": {
      const count = (cfg.count ?? 3);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        ctx.entities.spawnClone(p, p.pos.clone().add(new THREE.Vector3(Math.cos(a) * 2.2, 0, Math.sin(a) * 2.2)), {
          duration: cfg.duration ?? 7, damage: cfg.damage ?? 14, sourceKind: 'ultimate',
        });
      }
      ctx.effects.ring(p.pos.clone(), cfg.trailColor ?? 0xff7ad9, 4, 0.6);
      break;
    }
    case "mark": {
      const target = nearestEnemy(p, ctx, cfg.range ?? 30);
      if (target) ctx.entities.spawnMark(p, target, { damage: cfg.damage ?? 150, duration: cfg.duration ?? 1.2 });
      break;
    }
    case "nova": {
      ctx.effects.ring(p.pos.clone(), 0x7ee0b0, radius, 0.8);
      ctx.effects.ring(p.pos.clone(), 0x7ee0b0, radius * 0.5, 0.9);
      for (const t of ctx.players) {
        if (!t.alive || t.team !== p.team) continue;
        if (t.pos.distanceTo(p.pos) < radius + 1) {
          if (cfg.healPerSec && cfg.duration) t.healOverTime(p, cfg.healPerSec, cfg.duration, true);
          if (cfg.buffStat && cfg.buffMult) t.addBuff(cfg.buffStat, cfg.buffMult, cfg.buffDuration ?? 6, p);
          if (!p.combat.presentation) ctx.effects.healSpark(t.center);
        }
      }
      break;
    }
  }
}
