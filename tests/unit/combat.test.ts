import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { rayAABB } from '../../src/maps/world';
import { tracePlayer } from '../../src/game/combat/hitDetection';
import { EntityManager } from '../../src/game/combat/projectiles';
import { hitFeedback } from '../../src/game/combat/hitFeedback';
import { CombatEventSystem } from '../../src/game/combat/CombatEventSystem';

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const dir = v(0, 0, -1);
test('world rays ignore walls behind shooter and handle an origin inside cover', () => {
  assert.equal(rayAABB(v(), dir, { min: v(-1, -1, 2), max: v(1, 1, 3) }), Infinity);
  assert.equal(rayAABB(v(), dir, { min: v(-1, -1, -1), max: v(1, 1, 1) }), 0);
});
test('visible head, torso and lower body register; empty space misses', () => {
  const target = v(0, 0, -10);
  assert.equal(tracePlayer(v(0, 1.85), dir, target)?.headshot, true);
  assert.equal(tracePlayer(v(0, 1), dir, target)?.headshot, false);
  assert.equal(tracePlayer(v(0, 0.35), dir, target)?.headshot, false);
  assert.equal(tracePlayer(v(0, 2.1), dir, target), null);
  assert.equal(tracePlayer(v(0, 1), dir, v(0, 0, 10)), null);
});
function simulate(wallZ?: number, pierce = 0) {
  const manager = new EntityManager(new THREE.Scene());
  const owner = { team: 0, isLocal: false, combat: new CombatEventSystem() } as any;
  const order: number[] = [];
  const target = (id: number, z: number) => ({ id, pos: v(0, 0, z), alive: true, team: 1,
    applyDamage: () => { order.push(id); return 10; } });
  manager.spawnProjectile({ origin: v(0, 1), dir, speed: 200, radius: 0.1, damage: 10, team: 0, owner, color: 0xffffff, pierce });
  const colliders = wallZ === undefined ? [] : [{ min: v(-2, 0, wallZ - 0.1), max: v(2, 3, wallZ + 0.1) }];
  manager.update(0.05, { colliders } as any, [target(2, -7), target(1, -4)] as any,
    { impact() {}, healSpark() {} } as any);
  manager.clear();
  return order;
}
test('fast projectiles hit the nearest target between frames', () => assert.deepEqual(simulate(), [1]));
test('cover blocks a projectile before the target', () => assert.deepEqual(simulate(-2), []));
test('a wall beyond the target does not swallow its hit', () => assert.deepEqual(simulate(-6), [1]));
test('piercing processes targets by distance and stops at cover', () => {
  assert.deepEqual(simulate(undefined, 1), [1, 2]);
  assert.deepEqual(simulate(-6, 1), [1]);
});
test('only confirmed local damage creates hit feedback, including kills', () => {
  const calls: unknown[] = [];
  (globalThis as any).window = { __hitMarker: (...args: unknown[]) => calls.push(args), __damageNumber: () => {} };
  hitFeedback({ isLocal: true } as any, { alive: true } as any, false, 0);
  hitFeedback({ isLocal: false } as any, { alive: true } as any, false, 10);
  assert.equal(calls.length, 0);
  hitFeedback({ isLocal: true } as any, { alive: false } as any, true, 10);
  assert.deepEqual(calls, [[true, true]]);
});
