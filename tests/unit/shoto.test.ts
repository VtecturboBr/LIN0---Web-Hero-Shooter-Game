import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { MAPS } from '../../src/maps/index';
import { buildWorld, hasLOS, moveWithCollision, raycastWorld } from '../../src/maps/world';
import { findGroundPath, groundClear, groundSegmentClear } from '../../src/game/ai/navigation';
import { advanceCapture, type CaptureState } from '../../src/game/modes/capture';
import { BotBrain } from '../../src/game/ai/BotBrain';
import { Player, type GameCtx } from '../../src/game/actors/Player';
import { HERO_MAP } from '../../src/characters/index';
import { EntityManager } from '../../src/game/combat/projectiles';
import { Effects } from '../../src/game/effects/Effects';
import { advanceGameTime, resetGameTime } from '../../src/core/time';

(globalThis as any).window = {};
(globalThis as any).document = { createElement: () => ({ getContext: () => ({ clearRect() {}, fillText() {}, fillRect() {} }) }) };
const scene = new THREE.Scene(), world = buildWorld(MAPS.kyoto, scene);
const objective = new THREE.Vector3(0, 0, 0);

test('movement returns ground state and resolves solid landings, ceilings and empty ramp space', () => {
  const testWorld = { ...world, colliders: [{ min: new THREE.Vector3(-2, 1, -2), max: new THREE.Vector3(2, 2, 2) }] };
  const pos = new THREE.Vector3(0, 3, 0), vel = new THREE.Vector3(0, -5, 0);
  assert.equal(moveWithCollision(testWorld, pos, vel, .3, .42, 1.8).onGround, true);
  assert.equal(pos.y, 2); assert.equal(vel.y, 0);
  testWorld.colliders[0].min.y = 3; testWorld.colliders[0].max.y = 4;
  pos.set(0, 0, 0); vel.set(0, 5, 0);
  assert.equal(moveWithCollision(testWorld, pos, vel, .3, .42, 1.8).onGround, false);
  assert.ok(Math.abs(pos.y - 1.2) < 1e-9); assert.equal(vel.y, 0);
});

test('all ten spawn positions have player clearance and a solid screen from the point', () => {
  for (const spawns of world.spawns) for (const p of spawns) {
    assert.ok(groundClear(world, p.x, p.z), `spawn ${p.toArray()}`);
    assert.equal(hasLOS(world, p.clone().setY(1.6), objective.clone().setY(1.6)), false);
  }
});
test('gameplay footprints and heights are symmetric between teams', () => {
  for (const b of MAPS.kyoto.boxes) {
    const counterpart = MAPS.kyoto.boxes.find(c => c.x === -b.x && c.z === -b.z && c.y === b.y && c.w === b.w && c.h === b.h && c.d === b.d);
    assert.ok(counterpart, `unpaired solid ${b.detail} ${b.x},${b.z}`);
  }
});
test('both teams can reach the point via the street and both parks without cutting a solid corner', () => {
  for (const team of world.spawns) for (const z of [-23, 0, 23]) {
    const start = team[0], via = new THREE.Vector3(Math.sign(start.x) * 16.5, 0, z);
    for (const [from, to] of [[start, via], [via, objective]]) {
      const path = findGroundPath(world, from, to);
      assert.ok(path.length > 0, `route ${from.toArray()} to ${to.toArray()}`);
      let previous = from;
      for (const step of path) { assert.ok(groundSegmentClear(world, previous, step)); previous = step; }
      assert.ok(previous.distanceTo(to) < .01);
    }
  }
});
for (const side of [-1, 1]) for (const approach of [-1, 1]) {
  test(`continuous ramp ${side}/${approach} joins the 3.6m terrace and can be descended`, () => {
    const pos = new THREE.Vector3(approach * 16.9, 0, side * 15);
    for (let i = 0; i < 180; i++) {
      const previous = pos.y;
      moveWithCollision(world, pos, new THREE.Vector3(-approach * 6.2, -.4, 0), 1 / 60, .42, 1.8);
      assert.ok(Math.abs(pos.y - previous) < .3, `abrupt step ${pos.toArray()}`);
    }
    assert.ok(Math.abs(pos.x) < 2 && Math.abs(pos.y - 3.6) < .02, `landing ${pos.toArray()}`);
    for (let i = 0; i < 200; i++) moveWithCollision(world, pos, new THREE.Vector3(approach * 6.2, -.8, 0), 1 / 60, .42, 1.8);
    assert.ok(Math.abs(pos.x) > 16.5 && pos.y < .2, `descent ${pos.toArray()}`);
  });
}
test('cover blocks shots and homes/terraces offer reachable tether surfaces', () => {
  assert.equal(hasLOS(world, new THREE.Vector3(10, 1.6, 2.6), new THREE.Vector3(18, 1.6, 2.6)), false);
  for (const point of [new THREE.Vector3(-24, 6, -12), new THREE.Vector3(0, 3, -15)]) {
    const from = new THREE.Vector3(-14, 1.6, -6), dir = point.clone().sub(from).normalize();
    const hit = raycastWorld(world, from, dir, 28);
    assert.ok(hit && hit.t < 28);
  }
});
test('temporary player walls affect routing and reopen when removed', () => {
  const a = new THREE.Vector3(-4, 0, 0), b = new THREE.Vector3(4, 0, 0);
  assert.ok(groundSegmentClear(world, a, b));
  world.colliders.push({ min: new THREE.Vector3(-.3, 0, -3), max: new THREE.Vector3(.3, 3, 3) });
  try {
    assert.equal(groundSegmentClear(world, a, b), false);
    const route = findGroundPath(world, a, b);
    assert.ok(route.some(p => Math.abs(p.z) > 3.5));
  } finally { world.colliders.pop(); }
  assert.ok(groundSegmentClear(world, a, b));
});
test('bots physically travel from every spawn to capture range without an enemy', () => {
  for (let ti = 0; ti < 2; ti++) for (const spawn of world.spawns[ti]) {
    resetGameTime();
    const p = new Player(HERO_MAP.yume, ti as 0 | 1, 'Route test', true); p.pos.copy(spawn);
    const brain = new BotBrain();
    const ctx: GameCtx = { world, players: [p], entities: new EntityManager(scene), effects: new Effects(scene) };
    let arrived = false;
    for (let i = 0; i < 1800; i++) {
      const dt = 1 / 60; advanceGameTime(dt);
      brain.think(p, dt, ctx, { mode: 'conquista', objectivePos: objective, objectiveRadius: 6.25 }); p.update(dt, ctx);
      if (p.pos.distanceTo(objective) < 6.25) { arrived = true; break; }
    }
    assert.ok(arrived, `bot from ${spawn.toArray()} stopped at ${p.pos.toArray()}`);
  }
});
const fresh = (): CaptureState => ({ progress: 0, controller: -1, claimant: -1, contested: false });
const tick = (s: CaptureState, teams: [boolean, boolean], seconds: number) => { let last; for (let i = 0; i < seconds * 60; i++) last = advanceCapture(s, teams, 1 / 60); return last!; };
test('either team can take a neutral point; the opponent can neutralize and recapture it', () => {
  for (const first of [0, 1]) {
    const state = fresh(); tick(state, [first === 0, first === 1], 9); assert.equal(state.controller, first);
    tick(state, [first === 1, first === 0], 5); assert.equal(state.controller, -1);
    tick(state, [first === 1, first === 0], 9); assert.equal(state.controller, 1 - first);
  }
});
test('contesting freezes capture and scoring; enemy presence blocks points while neutralizing', () => {
  const state = fresh(); tick(state, [true, false], 9);
  const contested = tick(state, [true, true], 3);
  assert.equal(state.progress, 100); assert.ok(state.contested); assert.equal(contested.scoring, -1);
  const enemy = tick(state, [false, true], 2);
  assert.equal(state.controller, 0); assert.ok(state.progress < 100); assert.equal(enemy.scoring, -1);
});
test('abandoned partial claims decay, but a captured point stays owned and scores', () => {
  const partial = fresh(); tick(partial, [true, false], 2); tick(partial, [false, false], 4);
  assert.equal(partial.progress, 0); assert.equal(partial.claimant, -1);
  const owned = fresh(); tick(owned, [true, false], 9);
  assert.equal(tick(owned, [false, false], 15).scoring, 0); assert.equal(owned.controller, 0);
});
