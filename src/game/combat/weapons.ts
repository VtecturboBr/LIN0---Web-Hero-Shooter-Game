import { gameNow } from '../../core/time';
import * as THREE from "three";
import type { Player, GameCtx } from '../actors/Player';
import type { WeaponDef } from '../../core/types';
import { raycastWorld } from '../../maps/world';
import { audio } from '../../core/audio';
import { tracePlayer } from './hitDetection';
import { hitFeedback } from './hitFeedback';

/** Actual launch speed shared by firing and bot prediction. */
export function weaponProjectileSpeed(p: Player, alternate = false): number {
  return ((alternate ? p.weapon.alt?.projectileSpeed : p.weapon.projectileSpeed) ?? 40) * p.stat('projSpeed');
}

function consumeAmmo(p: Player, w: WeaponDef): boolean {
  if (w.ammo < 0) return true;
  if (p.weaponAmmo <= 0) {
    audio.dry();
    startReload(p);
    return false;
  }
  p.weaponAmmo--;
  if (p.weaponAmmo <= 0) startReload(p);
  return true;
}

export function startReload(p: Player) {
  if (!p.alive || p.actionBlocked || p.reloading || p.weapon.ammo < 0 || p.weaponAmmo >= Math.ceil(p.weapon.ammo * p.stat('ammoMult'))) return;
  p.reloading = true;
  p.reloadEnd = gameNow() + p.weapon.reloadTime * p.stat("reloadMult");
  audio.reload();
}

function aimWithSpread(p: Player, spread: number): THREE.Vector3 {
  const dir = p.aimDir();
  if (spread > 0) {
    dir.x += (Math.random() - 0.5) * 2 * spread;
    dir.y += (Math.random() - 0.5) * 2 * spread;
    dir.z += (Math.random() - 0.5) * 2 * spread;
    dir.normalize();
  }
  return dir;
}

export function firePrimary(p: Player, ctx: GameCtx) {
  if (!p.alive || p.actionBlocked || p.reloading || p.fireCd > 0) return;
  let w = p.weapon;
  if (w.combo) {
    if (p.lino.molding) return;
    if (gameNow() > p.lino.comboUntil) p.lino.combo = 0;
    const combo = w.combo;
    w = { ...w, ...combo.steps[p.lino.combo % combo.steps.length] };
    p.lino.combo = (p.lino.combo + 1) % combo.steps.length; p.lino.comboUntil = gameNow() + combo.resetAfter;
    p.meleeCd = 1 / w.fireRate;
  }
  p.fireCd = 1 / w.fireRate;
  if (w.ammo < 0 || p.weaponAmmo > 0) p.animateWeapon(w.kind === 'melee' ? 'melee' : 'fire');
  switch (w.kind) {
    case "melee": meleeSwing(p, ctx, w); break;
    case "hitscan": fireHitscan(p, ctx, w); break;
    case "projectile": fireGunProjectile(p, ctx, w); break;
    case "beam": fireBeam(p, ctx, w); break;
  }
}

export function fireAlt(p: Player, ctx: GameCtx) {
  if (!p.alive || p.actionBlocked || p.altCd > 0 || !p.weapon.alt) return;
  const alt = p.weapon.alt;
  p.altCd = 1 / alt.fireRate;
  const origin = p.eyePos.clone();
  const dir = aimWithSpread(p, 0.02);
  ctx.entities.spawnProjectile({
    origin, dir, speed: weaponProjectileSpeed(p, true), radius: alt.projectileRadius, damage: alt.damage,
    team: p.team, owner: p, color: 0xff9a3d, gravity: 0.8, life: 3, sourceKind: 'weapon', canHeadshot: false,
  });
  audio.alt();
  ctx.effects.muzzle(origin, dir, 0xff9a3d);
}

export function fireMelee(p: Player, ctx: GameCtx) {
  if (p.hero.id === 'lino') { firePrimary(p, ctx); return; }
  if (!p.alive || p.actionBlocked || p.meleeCd > 0) return;
  const m = p.hero.melee;
  p.meleeCd = 1 / m.rate;
  p.animateWeapon('melee');
  meleeSwing(p, ctx, { kind: "melee", name: "Corpo a corpo", damage: m.damage, fireRate: m.rate, ammo: -1, reloadTime: 0, spread: 0, auto: true, range: m.range, cone: m.cone, tracerColor: p.hero.color });
}

export function meleeSwing(p: Player, ctx: GameCtx, w: WeaponDef) {
  const range = (w.range ?? 3) * p.stat("meleeRangeMult");
  const dir = p.aimDir();
  const eye = p.eyePos;
  audio.shoot("melee");
  ctx.effects.muzzle(eye, dir, p.hero.color);
  const structureHit = raycastWorld(ctx.world, eye, dir, range);
  structureHit?.box.onDamage?.(p, w.damage * p.stat('meleeDamageMult'));
  for (const t of ctx.players) {
    if (!t.alive || t === p || t.team === p.team) continue;
    const to = t.center.sub(eye);
    const dist = to.length();
    if (dist > range + 0.5) continue;
    const angle = Math.acos(Math.max(-1, Math.min(1, to.normalize().dot(dir))));
    if (angle > (w.cone ?? 0.8)) continue;
    if (raycastWorld(ctx.world, eye, to, dist)) continue;
    const head = false;
    const dmg = t.applyDamage(p, w.damage, { melee: true, headshot: head });
    if (dmg > 0 && p.hero.id === 'lino' && p.lino.combo === 0) t.vel.addScaledVector(dir, 6);
    ctx.effects.impact(t.center, new THREE.Vector3(0, 1, 0), p.hero.color, 0.6);
    if (p.hero.resource.gainMeleeHit) p.addResource(p.hero.resource.gainMeleeHit);
    if (p.hero.passive.mechanic === 'meleeResource') {
      p.kenjiStacks = Math.min(p.hero.passive.maxStacks ?? 1, p.kenjiStacks + 1);
      p.kenjiStacksUntil = gameNow() + (p.hero.passive.stackDuration ?? 0);
    }
    if (p.isLocal) hitFeedback(p, t, head, dmg);
  }
}

function fireHitscan(p: Player, ctx: GameCtx, w: WeaponDef) {
  if (!consumeAmmo(p, w)) return;
  const eye = p.eyePos;
  const spread = w.spread * p.stat("spreadMult");
  const dir = aimWithSpread(p, spread);
  audio.shoot("hitscan");
  const worldHit = raycastWorld(ctx.world, eye, dir, 220);
  let hitT = worldHit?.t ?? 220;
  let target: Player | null = null;
  let headshot = false;

  for (const pl of ctx.players) {
    if (!pl.alive || pl === p || pl.team === p.team) continue;
    const hit = tracePlayer(eye, dir, pl.pos);
    const t = hit?.t ?? null;
    if (t !== null && t < hitT) {
      hitT = t;
      target = pl;
      headshot = hit!.headshot;
    }
  }

  const end = eye.clone().addScaledVector(dir, hitT);
  ctx.effects.tracer(eye, end, w.tracerColor ?? p.hero.color);
  ctx.effects.muzzle(eye, dir, w.tracerColor ?? p.hero.color);

  if (target) {
    const point = eye.clone().addScaledVector(dir, hitT);
    const dmg = target.applyDamage(p, w.damage, { headshot });
    ctx.effects.impact(point, new THREE.Vector3(0, 1, 0), w.tracerColor ?? p.hero.color, 0.7);
    if (p.isLocal) hitFeedback(p, target, headshot, dmg);
  } else if (worldHit) {
    worldHit.box.onDamage?.(p, w.damage);
    ctx.effects.impact(worldHit.point, worldHit.normal, w.tracerColor ?? p.hero.color, 0.8);
  }
}

function fireGunProjectile(p: Player, ctx: GameCtx, w: WeaponDef) {
  if (!consumeAmmo(p, w)) return;
  const eye = p.eyePos;
  const spread = w.spread * p.stat("spreadMult");
  const dir = aimWithSpread(p, spread);
  audio.shoot(w.name === "Arco Espiritual" ? "bow" : "projectile");
  const pellets = w.pellets ?? 1;
  for (let i = 0; i < pellets; i++) {
    ctx.entities.spawnProjectile({
      origin: eye.clone(),
      dir: aimWithSpread(p, spread),
      speed: weaponProjectileSpeed(p),
      radius: w.projectileRadius ?? 0.3,
      damage: w.damage,
      sourceKind: 'weapon',
      headshotMult: w.headshotMult ?? 1.5,
      team: p.team,
      owner: p,
      color: w.tracerColor ?? p.hero.color,
      pierce: w.pierce ?? 0,
      gravity: w.gravity ?? 0,
      life: 3.5,
    });
  }
  ctx.effects.muzzle(eye, dir, w.tracerColor ?? p.hero.color);
}

function fireBeam(p: Player, ctx: GameCtx, w: WeaponDef) {
  if (!consumeAmmo(p, w)) return;
  const eye = p.eyePos;
  const dir = p.aimDir();
  const range = w.range ?? 25;
  audio.shoot("beam");
  const worldHit = raycastWorld(ctx.world, eye, dir, range);
  let hitT = worldHit?.t ?? range;
  let target: Player | null = null;
  for (const pl of ctx.players) {
    if (!pl.alive || pl === p || pl.team === p.team) continue;
    const hit = tracePlayer(eye, dir, pl.pos);
    const t = hit?.t ?? null;
    if (t !== null && t < hitT) { hitT = t; target = pl; }
  }
  const end = eye.clone().addScaledVector(dir, hitT);
  ctx.effects.beam(eye, end, w.tracerColor ?? 0x5ac8ff);
  if (target) {
    const dmg = target.applyDamage(p, w.damage);
    ctx.effects.impact(end, new THREE.Vector3(0, 1, 0), 0x5ac8ff, 0.7);
    if (p.isLocal) hitFeedback(p, target, false, dmg);
  } else if (worldHit) {
    worldHit.box.onDamage?.(p, w.damage);
    ctx.effects.impact(worldHit.point, worldHit.normal, 0x5ac8ff, 0.8);
  }
}

// small helper exposed for HUD
export function ammoInfo(p: Player): { ammo: number; max: number; infinite: boolean; reloading: boolean } {
  const w = p.weapon;
  if (w.ammo < 0) return { ammo: -1, max: -1, infinite: true, reloading: false };
  return { ammo: p.weaponAmmo, max: Math.ceil(w.ammo * p.stat("ammoMult")), infinite: false, reloading: p.reloading };
}
