import assert from 'node:assert/strict';
import { test, beforeEach, afterEach } from 'node:test';
import * as THREE from 'three';
import { Player, type GameCtx } from '../../src/game/actors/Player';
import { EntityManager, type ProjectileSource } from '../../src/game/combat/projectiles';
import { Effects } from '../../src/game/effects/Effects';
import { firePrimary, fireAlt, weaponProjectileSpeed } from '../../src/game/combat/weapons';
import { castAbility, castUltimate } from '../../src/game/combat/abilities';
import { Match, type MatchResult } from '../../src/game/match/Match';
import { BotBrain } from '../../src/game/ai/BotBrain';
import { HEROES, HERO_MAP } from '../../src/characters/index';
import { MATTER_COSTS, TETHER_COST, matterCost } from '../../src/characters/lino/rules';
import { LinoMatter, SHAPES } from '../../src/characters/lino/LinoMatter';
import { SHOP_ITEMS, SHOP_RULES } from '../../src/progression/shop/items';
import { cardMods } from '../../src/progression/cards/catalog';
import { MAPS } from '../../src/maps/index';
import { Input } from '../../src/core/input';
import { gameNow, advanceGameTime, resetGameTime } from '../../src/core/time';

// Canvas drawing is irrelevant to simulation. Real Player/Match/Three.js objects run below.
beforeEach(() => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: Object.assign(new EventTarget(), {
    createElement: () => Object.assign(new EventTarget(), {
      getContext: () => ({ clearRect() {}, fillRect() {}, fillText() {} }),
    }),
  }) });
});
const cleanup: (() => void)[] = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); });
const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
function setup(hero = HERO_MAP.yume) {
  resetGameTime();
  const p = new Player(hero, 0, 'Source', false);
  const target = new Player(HERO_MAP.raijin, 1, 'Target', false);
  target.pos.set(0, 0, -4);
  const scene = new THREE.Scene();
  const ctx: GameCtx = {
    world: { map: MAPS.castle, colliders: [], group: new THREE.Group(), size: { w: 100, d: 100 },
      objectivePos: v(), objectiveRadius: 6, spawns: [[v(-30)], [v(30)]],
      objectiveBeacon: new THREE.Mesh(), beaconLight: new THREE.PointLight() },
    players: [p, target], entities: new EntityManager(scene), effects: new Effects(scene),
  };
  cleanup.push(() => { ctx.entities.clear(); ctx.effects.clear(); });
  return { p, target, ctx, scene };
}
function matchSetup(mode: 'conquista' | 'duelo' = 'conquista') {
  const announcements: string[] = [], feeds: unknown[][] = [], results: MatchResult[] = [];
  const input = new Input(document.createElement('canvas'));
  const scene = new THREE.Scene();
  const match = new Match(scene, { mode, heroId: 'yume', mapId: 'castle', cards: [] }, input, {
    onAnnounce: msg => announcements.push(msg), onKillFeed: (...args) => feeds.push(args),
    onEnd: result => results.push(result), onCapture() {}, onShopState() {},
    onLocalDeath() {}, onLocalRespawn() {}, onScore() {},
  });
  cleanup.push(() => match.cleanup());
  return { match, input, announcements, feeds, results, scene };
}

test('shield uses the final multiplier without bonuses and preserves expiry and cap', () => {
  const { p } = setup();
  p.grantShield(120, 4); close(p.shield, 120); close(p.shieldUntil, gameNow() + 4);
  p.grantShield(500, 1); close(p.shield, 300); close(p.shieldUntil, gameNow() + 4);
  p.die(null); p.grantShield(120, 4); assert.equal(p.shield, 0);
});
test('shield combines relative card and shop bonuses exactly once', () => {
  const { p } = setup();
  p.cards = [{ id: 'c_shield', level: 3 }];
  p.items = [{ def: SHOP_ITEMS.find(i => i.id === 'escudo')!, level: 2 }];
  p.recomputeMods(); p.grantShield(120, 4); close(p.shield, 144);
});
for (const [key, item, card, reduction] of [
  ['reloadMult', 'recarga', 'c_reload', .1], ['cooldownMult', 'fluxo', 'c_cooldown', .05],
  ['spreadMult', 'precisao', 'c_spread', .1],
] as const) {
  test(`${key}: neutral, positive bonus, card/shop reductions and recompute`, () => {
    const { p } = setup(); close(p.stat(key), 1);
    p.addBuff(key, .2, 1); close(p.stat(key), 1.2); advanceGameTime(1);
    const def = SHOP_ITEMS.find(i => i.id === item)!;
    for (let level = 1; level <= def.levels; level++) {
      p.items = [{ def, level }]; p.recomputeMods(); close(p.stat(key), 1 - reduction * level);
    }
    p.items = [{ def, level: 1 }]; p.cards = [{ id: card, level: 3 }];
    p.recomputeMods(); close(p.stat(key), 1 - reduction - .15);
    const before = p.stat(key); p.recomputeMods(); close(p.stat(key), before);
    close(cardMods({ id: card, level: 3 })[key]!, -.15);
  });
}
test('reload and ability cooldown use the reduced time in real actions', () => {
  const { p, ctx } = setup(HERO_MAP.shin);
  p.items = ['recarga', 'fluxo'].map(id => ({ def: SHOP_ITEMS.find(i => i.id === id)!, level: 1 }));
  p.recomputeMods(); p.weaponAmmo = 1; firePrimary(p, ctx);
  close(p.reloadEnd - gameNow(), p.weapon.reloadTime * .9);
  assert.ok(castAbility(p, 0, ctx)); close(p.abilityCd[0], p.hero.abilities[0].cooldown * .95);
  assert.equal(castAbility(p, -1, ctx), false);
});
test('positive damage shop bonus and neutral ability bonus remain relative', () => {
  const { p } = setup(); p.items = [{ def: SHOP_ITEMS.find(i => i.id === 'laminada')!, level: 4 }];
  p.recomputeMods(); close(p.stat('damageMult'), 1.16); close(p.stat('abilityDamageMult'), 1);
});

for (const [kind, expected] of [['weapon', 24], ['ability', 36], ['ultimate', 72]] as const) {
  test(`${kind} projectile applies only the appropriate damage bonuses`, () => {
    const { p, target, ctx } = setup();
    p.mods = { damageMult: .2, abilityDamageMult: .5, ultDamageMult: 1 };
    ctx.entities.spawnProjectile({ origin: v(0, 1), dir: v(0, 0, -1), speed: 100,
      radius: .1, damage: 20, team: p.team, owner: p, color: p.hero.color, sourceKind: kind });
    ctx.entities.update(.1, ctx.world, ctx.players, ctx.effects);
    close(target.maxHp - target.hp, expected);
    target.hp = target.maxHp;
    close(target.applyDamage(p, 20, { ability: kind !== 'weapon', ult: kind === 'ultimate' }), expected);
  });
}
for (const hero of [HERO_MAP.yume, HERO_MAP.kitsune]) {
  for (const headshot of [false, true]) {
    test(`${hero.id} real primary ${headshot ? 'headshot' : 'bodyshot'} uses its weapon multiplier`, () => {
      const { p, target, ctx } = setup({ ...hero, weapon: { ...hero.weapon, spread: 0 } });
      p.mods = { abilityDamageMult: 2, headshotMult: .2 };
      p.pos.y = headshot ? .4 : -.6;
      firePrimary(p, ctx);
      assert.equal(ctx.entities.projectiles[0].sourceKind, 'weapon');
      ctx.entities.update(.15, ctx.world, ctx.players, ctx.effects);
      close(target.maxHp - target.hp, hero.weapon.damage * (headshot ? hero.weapon.headshotMult! + .2 : 1));
    });
  }
}
test('hitscan and beam primary attacks do not receive ability damage', () => {
  for (const kind of ['hitscan', 'beam'] as const) {
    const { p, target, ctx } = setup({ ...HERO_MAP.shin, weapon: { ...HERO_MAP.shin.weapon, kind, spread: 0 } });
    p.mods = { abilityDamageMult: 2 }; p.pos.y = -.6; firePrimary(p, ctx);
    close(target.maxHp - target.hp, p.weapon.damage);
  }
});
test('Kenji alternate is a weapon projectile with headshots disabled', () => {
  const { p, target, ctx } = setup(HERO_MAP.kenji); p.mods = { abilityDamageMult: 2 };
  fireAlt(p, ctx);
  const pr = ctx.entities.projectiles[0];
  assert.equal(pr.sourceKind, 'weapon'); assert.equal(pr.canHeadshot, false);
  pr.pos.set(0, 2.1, 0); pr.vel.set(0, 0, -42); pr.gravity = 0;
  ctx.entities.update(.15, ctx.world, ctx.players, ctx.effects);
  close(target.maxHp - target.hp, p.weapon.alt!.damage);
});
test('ability projectiles cannot headshot; Kenji ultimate and illusion shots keep ultimate origin', () => {
  const { p, target, ctx } = setup(HERO_MAP.shin);
  assert.ok(castAbility(p, 0, ctx));
  assert.ok(ctx.entities.projectiles.every(pr => pr.sourceKind === 'ability' && !pr.canHeadshot));
  ctx.entities.clear(); p.hero = HERO_MAP.kenji; p.resource = 100; castUltimate(p, ctx);
  assert.equal(ctx.entities.projectiles[0].sourceKind, 'ultimate');
  assert.equal(ctx.entities.projectiles[0].canHeadshot, false);
  ctx.entities.clear(); p.hero = HERO_MAP.kitsune; p.resource = 100; castUltimate(p, ctx);
  ctx.entities.update(.6, ctx.world, ctx.players, ctx.effects);
  assert.equal(ctx.entities.projectiles.length, 3);
  for (const pr of ctx.entities.projectiles) {
    assert.equal(pr.sourceKind, 'ultimate');
    assert.ok(pr.vel.length() > 0);
    assert.ok(pr.vel.clone().normalize().dot(target.center.sub(pr.pos).normalize()) > .99);
  }
});
test('weapon, ability and ultimate structure damage uses the same origin contract', () => {
  for (const kind of ['weapon', 'ability', 'ultimate'] satisfies ProjectileSource[]) {
    const { p, ctx } = setup(); p.mods = { abilityDamageMult: .5, ultDamageMult: 1 };
    let damage = 0;
    ctx.world.colliders.push({ min: v(-1, 0, -2), max: v(1, 3, -1), onDamage: (_owner, amount) => { damage += amount; } });
    ctx.entities.spawnProjectile({ origin: v(0, 1), dir: v(0, 0, -1), speed: 100, radius: .1,
      damage: 20, team: 0, owner: p, color: 0xffffff, sourceKind: kind });
    ctx.entities.update(.1, ctx.world, ctx.players, ctx.effects);
    close(damage, kind === 'weapon' ? 20 : kind === 'ability' ? 30 : 60);
  }
});

test('Yume nova heals 50 HP/s for four seconds, never 200 HP immediately', () => {
  for (const step of [.1, .25, .7]) {
    const { p, target, ctx } = setup(); target.team = 0; target.hp = 100;
    p.resource = 100; assert.ok(castUltimate(p, ctx)); close(target.hp, 100);
    advanceGameTime(1); target.update(1, ctx); close(target.hp, 150);
    let elapsed = 1;
    while (elapsed < 5) { advanceGameTime(step); target.update(step, ctx); elapsed += step; }
    close(target.hp, 300); close(p.stats.healing, 200);
  }
});
test('Yume HoT preserves heal/spirit bonuses, team/range selection, buff duration and death cleanup', () => {
  const { p, target, ctx } = setup(); target.team = 0; target.hp = 100;
  const outside = new Player(HERO_MAP.raijin, 0, 'Outside', false); outside.pos.x = 50; outside.hp = 100;
  const enemy = new Player(HERO_MAP.raijin, 1, 'Enemy', false); enemy.hp = 100;
  ctx.players.push(outside, enemy); p.mods = { healMult: .2, spiritHealMult: .5 }; p.resource = 100;
  castUltimate(p, ctx); close(target.stat('damageMult'), 1.2);
  target.pos.x = 40; advanceGameTime(1);
  for (const t of [target, outside, enemy]) t.update(1, ctx);
  close(target.hp, 190); close(outside.hp, 100); close(enemy.hp, 100);
  target.die(null); target.respawn(v()); target.hp = 100;
  advanceGameTime(1); target.update(1, ctx); close(target.hp, 100);
  close(p.stats.healing, 90);
});
test('Raijin storm moves its visual and damage/slow area with the owner in all axes', () => {
  const { p, target, ctx } = setup(HERO_MAP.raijin);
  target.pos.set(0, 0, -2); p.resource = 100; castUltimate(p, ctx);
  p.pos.set(25, 3, 10);
  const victim = new Player(HERO_MAP.yume, 1, 'New position', false); victim.pos.set(26, 3, 10); ctx.players.push(victim);
  ctx.entities.update(.1, ctx.world, ctx.players, ctx.effects);
  const storm = ctx.entities.storms[0];
  assert.deepEqual(storm.pos.toArray(), p.pos.toArray());
  close(storm.mesh.position.x, 25); close(storm.mesh.position.z, 10); assert.ok(storm.mesh.position.y > 4);
  close(target.hp, target.maxHp); close(victim.hp, victim.maxHp - 30); assert.ok(victim.slowUntil > gameNow());
});

test('Koban requires uninterrupted objective occupancy, preserves leftover time and resets on death', () => {
  const { match } = matchSetup(); const p = match.local;
  p.pos.set(40, 0, 40); match['updateKobanTicks'](10); close(p.koban, 0);
  p.pos.copy(match.world.objectivePos); match['updateKobanTicks'](1); close(p.koban, 0);
  p.pos.x += match.world.objectiveRadius + 1; match['updateKobanTicks'](.1);
  p.pos.copy(match.world.objectivePos); match['updateKobanTicks'](1); close(p.koban, 0);
  match['updateKobanTicks'](1); close(p.koban, SHOP_RULES.koban.objTick);
  match['updateKobanTicks'](4.5); close(p.koban, 3 * SHOP_RULES.koban.objTick);
  p.alive = false; match['updateKobanTicks'](.1); p.alive = true;
  match['updateKobanTicks'](1.5); close(p.koban, 3 * SHOP_RULES.koban.objTick);
  match['updateKobanTicks'](.5); close(p.koban, 4 * SHOP_RULES.koban.objTick);
  close(p.stats.kobanEarned, p.koban);
});
test('shop opening and its public availability rule agree at spawn and objective', () => {
  const { match } = matchSetup();
  assert.ok(match.canOpenShop()); match['toggleShop'](); assert.equal(match.shopOpen, true);
  match.closeShop(); match.local.pos.copy(match.world.objectivePos); assert.equal(match.canOpenShop(), false);
  match['toggleShop'](); assert.equal(match.shopOpen, false);
});
test('announcer notifies HUD once on expiration and respects paused game time', () => {
  const { match, announcements } = matchSetup(); match.state = 'running';
  match.players.forEach(p => p.isBot = false); match.announce('MESSAGE');
  match.paused = true; match.update(4); assert.equal(match.announcer, 'MESSAGE');
  match.paused = false; match.update(2); assert.equal(match.announcer, 'MESSAGE');
  match.update(1); assert.equal(match.announcer, ''); assert.equal(announcements.at(-1), '');
  const count = announcements.length; match.update(.1); assert.equal(announcements.length, count);
});
test('environmental killfeed preserves victim name and card/item kill speed lasts two seconds', () => {
  const { match, feeds } = matchSetup(); const p = match.local, victim = match.players[5];
  match['handleDie'](victim, null); assert.deepEqual(feeds[0], ['O ABISMO', victim.name, -1, victim.team]);
  p.cards = [{ id: 'c_onkillspeed', level: 3 }]; p.items = [{ def: SHOP_ITEMS.find(i => i.id === 'tengu')!, level: 1 }];
  p.recomputeMods(); match['handleDie'](victim, p);
  close(p.speedBoostMult, .3); close(p.speedBoostUntil - gameNow(), 2); close(p.stat('onKillSpeedDur'), 2);
});
for (const [score, kills, win, draw] of [
  [[20, 10], [0, 10], true, false], [[10, 20], [10, 0], false, false],
  [[20, 20], [4, 3], true, false], [[20, 20], [3, 4], false, false], [[20, 20], [3, 3], false, true],
] as const) {
  test(`match result scores ${score} kills ${kills}: win=${win} draw=${draw}`, () => {
    const { match, results } = matchSetup(); match.scores = [...score];
    match.local.stats.kills = kills[0]; match.players[5].stats.kills = kills[1];
    match['endMatch'](); assert.equal(results[0].win, win); assert.equal(results[0].draw, draw);
    match['endMatch'](); assert.equal(results.length, 1);
  });
}
test('duelo total tie is a draw', () => {
  const { match, results } = matchSetup('duelo'); match['endMatch'](); assert.equal(results[0].draw, true);
});
test('bot selection includes a newly appended official hero and all bot names exist', t => {
  const extra = { ...HERO_MAP.yume, id: 'regression-hero' }; HEROES.push(extra);
  try {
    t.mock.method(Math, 'random', () => .99999);
    const { match } = matchSetup();
    assert.ok(match.players.filter(p => p.team === 1).every(p => p.hero === extra));
    assert.ok(match.players.every(p => typeof p.name === 'string' && p.name.length > 0));
  } finally { HEROES.pop(); }
});
test('bot prediction uses Yume/Kitsune/Kenji speed and projSpeed bonuses; hitscan has no lead', t => {
  t.mock.method(Math, 'random', () => .5);
  for (const hero of [HERO_MAP.yume, HERO_MAP.kitsune, HERO_MAP.kenji, HERO_MAP.shin]) {
    const { p, target, ctx } = setup(hero); target.pos.set(0, 0, -10); target.vel.set(4, 2, 0);
    p.mods = { projSpeed: .2 };
    new BotBrain().think(p, .016, ctx, { mode: 'duelo', objectivePos: v(), objectiveRadius: 6 });
    const base = hero.weapon.projectileSpeed ?? hero.weapon.alt?.projectileSpeed;
    const leadTime = base ? 10 / (base * 1.2) : 0;
    close(p.botInput!.yaw, Math.atan2(-4 * leadTime, 10));
    close(p.botInput!.pitch, Math.atan2(1 + 2 * leadTime - 1.6, Math.hypot(4 * leadTime, 10)));
    if (base) close(weaponProjectileSpeed(p, !!hero.weapon.alt), base * 1.2);
  }
});
test('missing projectile speed has the same launch and bot fallback', () => {
  const { p, ctx } = setup({ ...HERO_MAP.yume, weapon: { ...HERO_MAP.yume.weapon, projectileSpeed: undefined } });
  firePrimary(p, ctx); close(ctx.entities.projectiles[0].vel.length(), weaponProjectileSpeed(p));
  close(weaponProjectileSpeed(p), 40);
});
test('every Lino shape reserves its centralized normal/field cost and tether uses the shared cost', () => {
  assert.equal(MATTER_COSTS.length, SHAPES.length); assert.equal(matterCost(99, false), Infinity);
  for (let shape = 0; shape < MATTER_COSTS.length; shape++) for (const field of [false, true]) {
    if (!field && shape > 2) continue;
    const { p, ctx } = setup(HERO_MAP.lino); ctx.players[1].pos.set(30, 0, 30);
    const matter = new LinoMatter(ctx); p.lino.molding = true; p.lino.shape = shape;
    if (field) p.lino.field = p.pos.clone();
    assert.ok(matter.build(p)); close(p.lino.reserved, matterCost(shape, field));
    close(p.lino.control, 100 - MATTER_COSTS[shape] * (field ? .5 : 1));
    matter.reset();
  }
  const { p, target, ctx } = setup(HERO_MAP.lino); const matter = new LinoMatter(ctx);
  target.pos.set(0, 0, -10); assert.ok(matter.cast(p, 1)); close(p.lino.reserved, TETHER_COST);
  matter.detach(p); close(p.lino.reserved, 0); close(p.abilityCd[1], p.hero.abilities[1].cooldown);
});

test('all temporary entity kinds dispose geometry/material once on expiry or repeated clear', () => {
  for (const expire of [false, true]) {
    const { p, target, ctx } = setup();
    ctx.entities.spawnProjectile({ origin: v(), dir: v(1), speed: 1, radius: .1, damage: 1, team: 0, owner: p, color: 1 });
    ctx.entities.spawnHealSpirit(p, { duration: 1, healPerSec: 1 });
    ctx.entities.spawnAttackSpirit(p, { duration: 1, damage: 1 });
    ctx.entities.spawnClone(p, v(), { duration: 1, damage: 1 });
    ctx.entities.spawnStorm(p, { radius: 1, dps: 1, duration: 1, slow: .1 });
    ctx.entities.spawnSmoke(0, v(), { radius: 1, duration: 1, slow: .1 });
    ctx.entities.spawnMark(p, target, { damage: 1, duration: 1 });
    const meshes = [ctx.entities.projectiles, ctx.entities.spirits, ctx.entities.clones, ctx.entities.storms, ctx.entities.smokes, ctx.entities.marks].flatMap(list => list.map(e => e.mesh));
    const counts: number[] = [];
    for (const mesh of meshes) for (const resource of [mesh.geometry, ...Array.isArray(mesh.material) ? mesh.material : [mesh.material]]) {
      const i = counts.push(0) - 1; resource.addEventListener('dispose', () => counts[i]++);
    }
    if (expire) ctx.entities.update(10, ctx.world, ctx.players, ctx.effects);
    ctx.entities.clear(); ctx.entities.clear(); assert.ok(counts.every(count => count === 1));
  }
});
test('fading particles have independent materials; pooled resources live until owner cleanup', () => {
  const scene = new THREE.Scene(), effects = new Effects(scene);
  effects.healSpark(v()); effects.tracer(v(), v(1), 0x7ee0b0);
  effects.update(.2); effects.healSpark(v()); effects.tracer(v(), v(1), 0x7ee0b0); effects.update(.1);
  const particles = effects['particles'];
  assert.notEqual(particles[0].mesh.material, particles.at(-1)!.mesh.material);
  assert.ok(particles[0].mesh.material.opacity < particles.at(-1)!.mesh.material.opacity);
  const material = particles[0].mesh.material; let disposed = 0;
  material.addEventListener('dispose', () => disposed++);
  effects.update(10); assert.equal(disposed, 0);
  effects.clear(); effects.clear(); assert.equal(disposed, 1);
});
test('effects clear releases beams, rings, clouds, particles, lines and muzzle lights exactly once', () => {
  const scene = new THREE.Scene(), effects = new Effects(scene);
  effects.beam(v(), v(1), 1); effects.ring(v(), 1, 2); effects.smokeCloud(v(), 1, 2);
  effects.muzzle(v(), v(1), 1); effects.tracer(v(), v(1), 1);
  const counts: number[] = [];
  scene.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      for (const resource of [object.geometry, ...Array.isArray(object.material) ? object.material : [object.material]]) {
        const i = counts.push(0) - 1; resource.addEventListener('dispose', () => counts[i]++);
      }
    }
  });
  effects.clear(); effects.update(10); effects.clear(); assert.ok(counts.every(count => count === 1));
  assert.equal(effects['lights'].length, 0); assert.equal(scene.children[0].children.length, 0);
});
test('match cleanup releases shared resources once and leaves unrelated scene resources alive', () => {
  const { match, scene } = matchSetup();
  const external = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); scene.add(external);
  let outsideDisposed = false; external.material.addEventListener('dispose', () => outsideDisposed = true);
  const materials = new Set<THREE.Material>();
  match.local.model.traverse(object => { if (object instanceof THREE.Mesh) {
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  } });
  const counts = [...materials].map(material => { const count = { n: 0 }; material.addEventListener('dispose', () => count.n++); return count; });
  match.effects.healSpark(v()); match.cleanup(); match.cleanup();
  assert.ok(counts.every(count => count.n === 1)); assert.equal(outsideDisposed, false); assert.ok(scene.children.includes(external));
});
test('wasPressed and mouse presses are non-consuming frame queries', () => {
  const input = new Input(document.createElement('canvas')); input.blocked = false;
  const event = Object.assign(new Event('keydown'), { code: 'KeyQ' });
  window.dispatchEvent(event);
  assert.equal(input.wasPressed('KeyQ'), true); assert.equal(input.wasPressed('KeyQ'), true);
  window.dispatchEvent(Object.assign(new Event('mousedown'), { button: 0 }));
  assert.equal(input.wasMousePressed(0), true); assert.equal(input.wasMousePressed(0), true);
  input.endFrame(); assert.equal(input.wasPressed('KeyQ'), false); assert.equal(input.wasMousePressed(0), false);
  assert.equal(input.down('KeyQ'), true);
});
