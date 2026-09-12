import assert from 'node:assert/strict';
import { test, beforeEach, afterEach } from 'node:test';
import * as THREE from 'three';
import { Player, type GameCtx } from '../../src/game/actors/Player';
import { CombatEventSystem } from '../../src/game/combat/CombatEventSystem';
import { AbilityRuntime } from '../../src/game/combat/AbilityRuntime';
import { castAbility, castUltimate } from '../../src/game/combat/abilities';
import { firePrimary, startReload } from '../../src/game/combat/weapons';
import { EntityManager } from '../../src/game/combat/projectiles';
import { Effects } from '../../src/game/effects/Effects';
import { HERO_MAP, HEROES, HeroRegistry } from '../../src/characters';
import { resetGameTime, advanceGameTime, gameNow } from '../../src/core/time';
import { ResourceTracker, MeshPool } from '../../src/core/ResourceTracker';
import { Match } from '../../src/game/match/Match';
import { Input } from '../../src/core/input';
import { AI_PROFILES, profileFor } from '../../src/game/ai/profiles';
import { BotBrain } from '../../src/game/ai/BotBrain';

const cleanup: (() => void)[] = [];
beforeEach(() => {
  resetGameTime();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: Object.assign(new EventTarget(), {
    createElement: () => Object.assign(new EventTarget(), { getContext: () => ({ clearRect() {}, fillRect() {}, fillText() {} }) }),
  }) });
});
afterEach(() => { while (cleanup.length) cleanup.pop()!(); });
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
function players() {
  const source = new Player(HERO_MAP.yume, 0, 'Source', false), target = new Player(HERO_MAP.raijin, 1, 'Target', false);
  const combat = new CombatEventSystem(); source.combat = target.combat = combat;
  cleanup.push(() => ResourceTracker.dispose(source.model, target.model));
  return { source, target, combat };
}
function match(training = false) {
  const scene = new THREE.Scene();
  const m = new Match(scene, { mode: 'conquista', mapId: 'castle', heroId: 'yume', cards: [], training }, new Input(document.createElement('canvas')), {
    onKillFeed() {}, onAnnounce() {}, onCapture() {}, onEnd() {}, onShopState() {}, onLocalDeath() {}, onLocalRespawn() {}, onScore() {},
  });
  cleanup.push(() => m.cleanup()); return m;
}

test('combat events update rewards once, preserve source/headshot/shield and unsubscribe', () => {
  const { source, target, combat } = players();
  const sequence: string[] = [];
  const off = combat.on('damage', event => { sequence.push('damage'); assert.equal(event.source, source); assert.equal(event.absorbed, 20); });
  combat.on('headshot', () => sequence.push('headshot'));
  combat.on('kill', () => sequence.push('kill'));
  target.grantShield(20, 10); target.hp = 10;
  near(target.applyDamage(source, 100, { headshot: true }), 30);
  assert.deepEqual(sequence, ['damage', 'headshot', 'kill']); near(source.stats.damage, 30);
  near(source.koban, 30 / 25); assert.equal(target.stats.deaths, 1);
  target.die(source); assert.equal(target.stats.deaths, 1); off();
  target.respawn(new THREE.Vector3()); target.invulnUntil = 0; target.applyDamage(source, 10);
  assert.equal(sequence.length, 3);
});
test('heal and shield events carry effective amounts and reject invalid input', () => {
  const { source, target, combat } = players();
  let healed = 0, shield = 0;
  combat.on('heal', event => healed += event.amount); combat.on('shield', event => shield += event.amount);
  target.hp -= 10; target.applyHeal(source, 100); near(healed, 10); near(source.stats.healing, 10);
  target.grantShield(100, 2); target.grantShield(500, 2); near(shield, 300);
  target.applyDamage(source, NaN); target.applyHeal(source, -100); target.grantShield(Infinity, 2);
  near(target.hp, target.maxHp); near(target.shield, 300);
});
test('poison and burn tick with partial intervals, attribute damage and expire exactly once', () => {
  const { source, target } = players(); let expired = 0;
  for (const kind of ['poison', 'burn'] as const) target.status.add({ id: kind, kind, source, value: 10, duration: 1.25, interval: .5, onExpire: () => expired++ });
  const hp = target.hp;
  target.status.update(1.5); near(hp - target.hp, 25); near(source.stats.damage, 25);
  assert.equal(expired, 2); assert.equal(target.status.active.length, 0);
  target.status.update(10); assert.equal(expired, 2);
});
test('HoT does not burst, does not overheal and is cancelled by death/respawn', () => {
  const { source, target } = players(); target.hp = 100;
  target.healOverTime(source, 50, 4); near(target.hp, 100);
  target.status.update(.5); near(target.hp, 125);
  target.die(source); target.respawn(new THREE.Vector3()); target.hp = 100;
  target.status.update(10); near(target.hp, 100);
});
test('status stacking, refresh, replace, source identity and invalid duration', () => {
  const { source, target } = players();
  const effect = { id: 'speed', kind: 'speed' as const, source, value: .2, duration: 2 };
  target.status.add(effect); target.status.add(effect); near(target.stat('moveSpeed'), 1.2);
  target.status.add({ ...effect, stacking: 'stack' }); near(target.stat('moveSpeed'), 1.4);
  target.status.remove('speed'); near(target.stat('moveSpeed'), 1);
  target.status.add({ ...effect, stacking: 'strongest' }); target.status.add({ ...effect, value: .1, stacking: 'strongest' }); near(target.stat('moveSpeed'), 1.2);
  target.status.add({ ...effect, value: .1, stacking: 'replace' }); near(target.stat('moveSpeed'), 1.1);
  target.status.add({ ...effect, source: target }); near(target.stat('moveSpeed'), 1.3);
  assert.equal(target.status.add({ ...effect, duration: NaN }), false);
  assert.equal(target.status.add({ ...effect, interval: 0 }), false);
  advanceGameTime(2); near(target.stat('moveSpeed'), 1);
});
test('slow, vulnerability, invulnerability and lifesteal use final stats', () => {
  const { source, target } = players();
  target.status.add({ id: 'slow', kind: 'slow', source, value: .25, duration: 2 });
  near(target.speed, target.hero.moveSpeed * .75);
  source.status.add({ id: 'drain', kind: 'lifesteal', source, value: .5, duration: 2 }); source.hp = 100;
  target.status.add({ id: 'vulnerable', kind: 'vulnerability', source, value: .5, duration: 2 });
  near(target.applyDamage(source, 20), 30); near(source.hp, 115);
  target.status.add({ id: 'safe', kind: 'invulnerability', source, value: 1, duration: 2 });
  near(target.applyDamage(source, 20), 0);
  target.status.remove('safe'); target.debugInvincible = true; near(target.applyDamage(source, 20), 0);
  target.debugInvincible = false; target.headshotsOnly = true; near(target.applyDamage(source, 20), 0);
  assert.ok(target.applyDamage(source, 20, { headshot: true }) > 0);
});
test('stacked slows add to the strongest ordinary slow regardless of insertion order', () => {
  const { source, target } = players();
  const effects = [
    { id: 'ordinary', kind: 'slow' as const, source, value: .3, duration: 2 },
    { id: 'weak', kind: 'slow' as const, source, value: .1, duration: 2 },
    { id: 'stacked', kind: 'slow' as const, source, value: .2, duration: 2, stacking: 'stack' as const },
  ];
  for (const order of [effects, [...effects].reverse()]) {
    target.status.clear();
    for (const effect of order) target.status.add(effect);
    near(target.status.value('slow'), .5);
    near(target.speed, target.hero.moveSpeed * .5);
  }
});

test('weak slow after expiration does not inherit a previous stronger slow', () => {
  const { source, target } = players();
  target.applySlow(.8, 1, source); advanceGameTime(1); target.status.update(1);
  target.applySlow(.1, 1, source); near(target.speed, target.hero.moveSpeed * .9);
});
test('ability runtime covers casting, channel ticks, cooldown and interruption', () => {
  const runtime = new AbilityRuntime(); let activated = 0, ticked = 0, ended = 0;
  assert.equal(runtime.state, 'READY');
  runtime.start({ castTime: .5, duration: 1.25, channel: true, tickInterval: .5 }, { activate: () => activated++, tick: dt => ticked += dt, end: () => ended++ });
  assert.equal(runtime.state, 'CASTING'); assert.ok(runtime.blocksActions);
  runtime.update(.5, 3); assert.equal(runtime.state, 'ACTIVE'); assert.equal(activated, 1);
  runtime.update(1.25, 2); near(ticked, 1.25); assert.equal(ended, 1); assert.equal(runtime.state, 'COOLDOWN');
  runtime.update(2, 0); assert.equal(runtime.state, 'READY');
  runtime.start({ castTime: 1 }, { activate: () => activated++ }); runtime.interrupt(); runtime.update(1, 0);
  assert.equal(activated, 1);
  runtime.start({ duration: 2, interruptible: false }, { activate() {} });
  assert.equal(runtime.interrupt(), false); assert.equal(runtime.interrupt(true), true);
  runtime.reset();
  assert.equal(runtime.start({ duration: NaN }, { activate() {} }), false);
  runtime.start({ persistent: true }, { activate() {} }); runtime.update(100, 0);
  assert.equal(runtime.state, 'ACTIVE'); assert.equal(runtime.interrupt(), true);
});
test('real casting blocks weapons, interruption cancels persistent entities and cooldown reset preserves active spells', () => {
  const m = match(true), p = m.local;
  p.hero = { ...p.hero, abilities: p.hero.abilities.map((ab, i) => i ? ab : { ...ab, runtime: { castTime: .5 } }) };
  const ctx: GameCtx = m['ctx'];
  assert.ok(castAbility(p, 0, ctx)); assert.equal(ctx.entities.spirits.length, 0);
  const ammo = p.weaponAmmo; firePrimary(p, ctx); assert.equal(p.weaponAmmo, ammo);
  p.runtimes[0].update(.5, 5); assert.equal(ctx.entities.spirits.length, 1);
  p.resetCooldowns(); assert.equal(p.runtimes[0].state, 'ACTIVE');
  p.runtimes[0].interrupt(); ctx.entities.update(.01, ctx.world, ctx.players, ctx.effects); assert.equal(ctx.entities.spirits.length, 0);
});
test('reload clamps ammo and expires on simulation clock; buffs expose stat contribution', () => {
  const { source: p } = players(); const m = match(true);
  p.mods.reloadMult = -.4; p.weaponAmmo = 0; startReload(p);
  near(p.reloadEnd - gameNow(), p.weapon.reloadTime * .6);
  advanceGameTime(p.weapon.reloadTime * .6); p.update(0, m['ctx']);
  assert.equal(p.reloading, false); assert.equal(p.weaponAmmo, p.weapon.ammo);
  p.addBuff('damageMult', .25, 2); near(p.explainStat('damageMult').final, 1.25);
});
test('time scale zero freezes clocks and AI; hero swap preserves the arena and clears owner entities', () => {
  const m = match(true); m.trainingPaused = false; m.trainingFree = false;
  const world = m.world, player = m.local; player.resource = 100; castUltimate(player, m['ctx']);
  m.timeScale = 0; const now = gameNow(); m.update(.5); assert.equal(gameNow(), now);
  m.timeScale = .5; m.update(.2); near(gameNow() - now, .1);
  assert.ok(m.changeHero(player, 'raijin')); assert.equal(m.local, player); assert.equal(m.world, world);
  assert.equal(player.hero.id, 'raijin'); assert.equal(player.status.active.length, 0);
  assert.equal(m.changeHero(player, 'missing'), false);
  assert.equal(m.teleport(player, NaN, 1, 0), false); assert.ok(m.teleport(player, 2, 3, 4));
  assert.equal(m.changeTeam(player, 2), false); assert.ok(m.changeTeam(player, 1));
});
test('all six AI profiles resolve from definitions and frozen brains stop moving/firing', () => {
  assert.equal(new Set(HEROES.map(profileFor)).size, Object.keys(AI_PROFILES).length);
  const m = match(); m.state = 'running'; m.freezeAI = true;
  const bot = m.players.find(p => p.isBot)!; bot.invulnUntil = 0;
  bot.botInput = { move: new THREE.Vector3(1, 0, 0), yaw: 0, pitch: 0, shoot: true, altShoot: false, ability: 0, ult: false, melee: false, jump: false };
  const pos = bot.pos.clone(); m.update(.1); near(bot.pos.distanceTo(pos), 0); assert.equal(bot.botInput, null);
  assert.equal(new BotBrain().state, 'idle');
});
test('training free resources preserve weapon recovery and do not bypass fire rate', () => {
  const m = match(true), p = m.local;
  p.fireCd = .8; p.altCd = .7; p.meleeCd = .6; p.abilityCd.fill(4);
  m.refillTraining(false);
  near(p.fireCd, .8); near(p.altCd, .7); near(p.meleeCd, .6); assert.ok(p.abilityCd.every(cd => cd === 0));
  m.refillTraining(); near(p.fireCd, 0);
});
test('interrupting Yume nova cancels only its newly created healing and buffs', () => {
  const m = match(true), p = m.local;
  p.addBuff('moveSpeed', .1, 10); p.hp = 100; p.resource = 100;
  castUltimate(p, m['ctx']);
  assert.ok(p.status.active.some(effect => effect.kind === 'hot'));
  p.ultimateRuntime.interrupt();
  assert.equal(p.status.active.length, 1); near(p.stat('moveSpeed'), 1.1);
});
test('Lino molding has an active runtime and dead Lino does not recreate visual resources', () => {
  const m = match(true), p = m.local; m.changeHero(p, 'lino');
  assert.ok(m.matter.cast(p, 0)); assert.equal(p.runtimes[0].state, 'ACTIVE');
  p.runtimes[0].interrupt(); assert.equal(p.lino.molding, false);
  m.matter.update(.1); p.die(null); m.matter.update(.1); m.matter.update(.1);
  assert.equal(m.matter['visuals'].has(p.id), false);
});
test('registry rejects duplicate/unknown heroes without reordering definitions', () => {
  const registry = new HeroRegistry(HEROES); assert.equal(registry.get('yume'), HERO_MAP.yume);
  assert.throws(() => registry.get('missing')); assert.throws(() => new HeroRegistry([HERO_MAP.yume, HERO_MAP.yume]));
  assert.deepEqual(registry.all.map(h => h.id), HEROES.map(h => h.id));
});
test('mesh pool reuses geometry/material and disposes excess/retained resources exactly once', () => {
  const pool = new MeshPool(1), first = pool.acquire(1, 1), second = pool.acquire(2, 2);
  let firstDisposed = 0, secondDisposed = 0;
  first.geometry.addEventListener('dispose', () => firstDisposed++); second.geometry.addEventListener('dispose', () => secondDisposed++);
  pool.release(first); pool.release(second); assert.equal(secondDisposed, 1); assert.equal(firstDisposed, 0);
  const reused = pool.acquire(3, 3, .5); assert.equal(reused, first); near(reused.material.opacity, .5);
  pool.release(reused); pool.clear(); pool.clear(); assert.equal(firstDisposed, 1);
});
test('ResourceTracker disposes shared textures/materials once across roots', () => {
  const texture = new THREE.Texture(), mat = new THREE.MeshBasicMaterial({ map: texture }), geometry = new THREE.BoxGeometry();
  const a = new THREE.Mesh(geometry, mat), b = new THREE.Mesh(geometry, mat);
  let disposed = 0; for (const resource of [texture, mat, geometry]) resource.addEventListener('dispose', () => disposed++);
  ResourceTracker.dispose(a, b); assert.equal(disposed, 3);
});
