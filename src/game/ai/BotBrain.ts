import * as THREE from "three";
import type { Player, GameCtx } from '../actors/Player';
import { findGroundPath, groundSegmentClear } from './navigation';
import { hasLOS } from '../../maps/world';
import { weaponProjectileSpeed } from '../combat/weapons';
import { AI_PROFILES, profileFor, type AIProfileName } from './profiles';

export interface BotGoal {
  mode: "conquista" | "duelo";
  objectivePos: THREE.Vector3;
  objectiveRadius: number;
}

const tmp = new THREE.Vector3();

export class BotBrain {
  profile?: AIProfileName;
  state = 'idle';
  targetId: number | null = null;
  get path(): readonly THREE.Vector3[] { return this.route; }
  private strafeDir = Math.random() > 0.5 ? 1 : -1;
  private strafeTimer = 1 + Math.random() * 2;
  private abilityTimer = 2 + Math.random() * 3;
  private jumpTimer = 0;
  private accuracy: number;
  private route: THREE.Vector3[] = [];
  private routeTimer = 0;
  private routeGoal = new THREE.Vector3(Infinity, 0, Infinity);

  constructor() {
    this.accuracy = 0.55 + Math.random() * 0.35;
  }

  think(p: Player, dt: number, ctx: GameCtx, goal: BotGoal) {
    if (!p.alive) {
      this.state = 'dead'; this.targetId = null;
      p.botInput = null;
      return;
    }
    const input = (p.botInput ??= { move: new THREE.Vector3(), yaw: p.yaw, pitch: p.pitch, shoot: false, altShoot: false, melee: false, ability: -1, ult: false, jump: false });
    const profileName = this.profile ?? profileFor(p.hero), profile = AI_PROFILES[profileName];

    // target acquisition
    let target: Player | null = null;
    let bestD = Infinity;
    for (const pl of ctx.players) {
      if (!pl.alive || pl === p || pl.team === p.team) continue;
      const d = p.pos.distanceToSquared(pl.pos);
      if (d > 46 * 46) continue;
      const score = d * (1 - profile.woundedPriority * (1 - pl.hp / pl.maxHp)) *
        (pl.pos.distanceTo(goal.objectivePos) < goal.objectiveRadius ? 1 - profile.objectivePriority * .5 : 1);
      if (score > bestD) continue;
      if (hasLOS(ctx.world, p.eyePos, pl.center)) {
        bestD = score;
        target = pl;
      }
    }

    const hpFrac = p.hp / p.maxHp;
    const weaponRange = p.weapon.kind === "melee" ? (p.weapon.range ?? 4) * 1.3 : p.weapon.kind === "beam" ? (p.weapon.range ?? 25) * 0.9 : Math.max(22, profile.distance * 1.15);
    const inRange = target && p.pos.distanceTo(target.pos) <= weaponRange;
    const lowHp = hpFrac < profile.retreat;
    this.targetId = target?.id ?? null;
    this.state = lowHp ? 'retreat' : target ? 'engage' : 'objective';

    let dest: THREE.Vector3;
    let engage = false;

    if (lowHp) {
      // retreat toward own spawn
      dest = ctx.world.spawns[p.team][0];
    } else if (target && inRange) {
      engage = true;
      dest = target.pos;
    } else if (goal.mode === "conquista") {
      dest = goal.objectivePos;
      if (target && target.pos.distanceTo(goal.objectivePos) < goal.objectiveRadius + 6) engage = true;
    } else {
      dest = target ? target.pos : goal.objectivePos;
    }

    // Split opening approaches between the main street and both park flanks.
    const residential = ctx.world.map.theme === 'residential';
    if (residential && !lowHp && !engage && Math.abs(p.pos.x) > 18 && p.id % 3 !== 0) {
      dest = new THREE.Vector3(Math.sign(p.pos.x) * 16.5, 0, (p.id % 3 === 1 ? -1 : 1) * 23);
    }
    if (profileName === 'flanker' && target && !lowHp && !inRange) {
      dest = target.pos.clone().add(new THREE.Vector3(p.id % 2 ? 6 : -6, 0, 5));
      this.state = 'flank';
    }
    if (profileName === 'support' && !lowHp && !target) {
      const wounded = ctx.players.find(ally => ally !== p && ally.team === p.team && ally.alive && ally.hp < ally.maxHp * .7);
      if (wounded) { dest = wounded.pos; this.state = 'support'; }
    }
    let navigating = false;
    if (residential && p.pos.y < .45 && !groundSegmentClear(ctx.world, p.pos, dest)) {
      this.routeTimer -= dt;
      if (this.routeTimer <= 0 || this.routeGoal.distanceToSquared(dest) > 9) {
        this.route = findGroundPath(ctx.world, p.pos, dest);
        this.routeTimer = .9 + (p.id % 3) * .1;
        this.routeGoal.copy(dest);
      }
      while (this.route.length && p.pos.distanceToSquared(this.route[0]) < .7 ** 2) this.route.shift();
      // Shortcut only through space wide enough for a player, never through corners.
      for (let i = Math.min(7, this.route.length - 1); i > 0; i--) {
        if (groundSegmentClear(ctx.world, p.pos, this.route[i])) { this.route.splice(0, i); break; }
      }
      if (this.route.length) { dest = this.route[0]; navigating = true; }
    } else { this.routeTimer = 0; this.route = []; }

    // ---- movement ----
    const toDest = tmp.copy(dest).sub(p.pos);
    toDest.y = 0;
    const dist = toDest.length();
    if (dist > 0.6) {
      const dir = toDest.normalize();
      input.move.copy(dir);
      if (engage && !navigating) {
        this.strafeTimer -= dt;
        if (this.strafeTimer <= 0) {
          this.strafeTimer = 1 + Math.random() * 2;
          this.strafeDir *= -1;
        }
        const right = new THREE.Vector3(dir.z, 0, -dir.x);
        input.move.addScaledVector(right, this.strafeDir * 0.7);
      }
      // wall / obstacle avoidance: steer around and jump (to climb platforms)
      const ahead = p.pos.clone().addScaledVector(input.move.clone().normalize(), 1.6);
      ahead.y += 1;
      if (!navigating && hasLOS(ctx.world, ahead, p.pos.clone().add(new THREE.Vector3(0, 1, 0))) === false) {
        const avoid = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(this.strafeDir);
        input.move.copy(avoid);
        this.jumpTimer = 0.2;
        input.jump = true;
      }
      input.move.normalize();
      if (engage && target && !lowHp && p.weapon.kind !== 'melee' && p.pos.distanceTo(target.pos) < profile.distance * .65) {
        input.move.copy(p.pos).sub(target.pos).setY(0).normalize();
      }
    } else {
      input.move.set(0, 0, 0);
    }

    // jumping
    this.jumpTimer -= dt;
    if (this.jumpTimer > 0) input.jump = true;
    else if ((!p.onGround && input.jump) || Math.random() < 0.002) input.jump = false;

    // ---- aiming ----
    if (target) {
      const eye = p.eyePos;
      const aimPoint = target.center.clone();
      const err = (1 - this.accuracy) * 1.4;
      aimPoint.x += (Math.random() - 0.5) * err;
      aimPoint.y += (Math.random() - 0.5) * err * 0.6;
      aimPoint.z += (Math.random() - 0.5) * err;
      // Melee heroes with a ranged alternate (Kenji) predict that projectile too.
      const projectile = p.weapon.kind === 'projectile';
      const alternate = p.weapon.kind === 'melee' && !!p.weapon.alt;
      if ((projectile || alternate) && target.vel.lengthSq() > 0.5) {
        const speed = weaponProjectileSpeed(p, alternate);
        if (speed > 0) aimPoint.addScaledVector(target.vel, p.pos.distanceTo(target.pos) / speed);
      }
      const dx = aimPoint.x - eye.x, dy = aimPoint.y - eye.y, dz = aimPoint.z - eye.z;
      const horiz = Math.hypot(dx, dz);
      input.yaw = Math.atan2(-dx, -dz);
      input.pitch = Math.atan2(dy, horiz);
    }

    // ---- shooting ----
    input.shoot = engage && !!target && p.fireCd <= 0 && !p.reloading && Math.random() < 0.9;
    input.altShoot = !!p.weapon.alt && engage && p.altCd <= 0 && Math.random() < 0.25;

    // ---- abilities ----
    this.abilityTimer -= dt;
    input.ability = -1;
    input.ult = false;
    if (engage || lowHp || this.state === 'support') {
      const nearby = ctx.players.filter(other => other.alive && other !== p &&
        (profileName === 'support' ? other.team === p.team && other.hp < other.maxHp * .7 : other.team !== p.team) &&
        other.pos.distanceTo(p.pos) < (p.hero.ultimate.config.radius ?? p.hero.ultimate.config.range ?? 20)).length;
      if (p.ultReady && (nearby >= profile.ultTargets || (lowHp && profileName === 'tank' && nearby > 0))) {
        input.ult = true;
      } else if (this.abilityTimer <= 0) {
        this.abilityTimer = 3 + Math.random() * 4;
        const ab = p.hero.abilities;
        // pick: F defensive when low hp; first/second ability offensive in combat; dash to close distance
        if (p.hero.id === 'lino') {
          input.ability = lowHp || (target && p.pos.distanceTo(target.pos) < 8) ? 2 : 0;
        } else if (lowHp && ab[2] && (ab[2].defensive || ab[2].kind === "shield" || ab[2].kind === "buff")) {
          input.ability = 2;
        } else if (ab[0] && (ab[0].kind === "dash" || ab[0].kind === "projectile" || ab[0].kind === "summon" || ab[0].kind === "slam")) {
          input.ability = 0;
        } else if (ab[1]) {
          input.ability = 1;
        } else {
          input.ability = 0;
        }
      }
    }
  }
}
