import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { Player, type GameCtx } from '../../src/game/actors/Player';
import { HERO_MAP } from '../../src/characters/index';
import { LinoMatter } from '../../src/characters/lino/LinoMatter';
import { EntityManager } from '../../src/game/combat/projectiles';
import { Effects } from '../../src/game/effects/Effects';
import { raycastWorld, moveWithCollision, type World } from '../../src/maps/world';
import { advanceGameTime, resetGameTime, gameNow } from '../../src/core/time';
import { firePrimary, fireMelee } from '../../src/game/combat/weapons';
import { migrateLoadoutLibrary } from '../../src/progression/loadouts/migration';
import { validDeck } from '../../src/progression/loadouts/library';

(globalThis as any).window = {};
(globalThis as any).document = { createElement: () => ({ getContext: () => ({ clearRect() {}, fillText() {}, fillRect() {} }) }) };
function setup() {
  resetGameTime();
  const p = new Player(HERO_MAP.lino, 0, 'Lino', false);
  const enemy = new Player(HERO_MAP.yume, 1, 'Enemy', false); enemy.pos.set(20, 0, -20);
  const scene = new THREE.Scene();
  const world = { colliders: [], group: new THREE.Group(), size: { w: 100, d: 100 } } as unknown as World;
  const ctx: GameCtx = { world, players: [p, enemy], entities: new EntityManager(scene), effects: new Effects(scene) };
  const matter = new LinoMatter(ctx); ctx.matter = matter;
  const tick = (dt: number) => { advanceGameTime(dt); matter.update(dt); };
  const build = (shape: number) => { p.lino.molding = true; p.lino.shape = shape; p.abilityCd[0] = 0; return matter.build(p); };
  return { p, enemy, ctx, matter, tick, build };
}
test('Molding toggles without armor, reservation or frontal resistance', () => {
  const {p,enemy,matter}=setup();
  assert.deepEqual(p.hero.abilities.map(a=>a.key),['Q','SHIFT','M2']);
  assert.ok(matter.cast(p,0)); assert.ok(p.lino.molding); assert.equal(p.lino.reserved,0);
  enemy.pos.set(0,0,-5); assert.equal(p.applyDamage(enemy,100),100);
  assert.ok(matter.cast(p,0)); assert.equal(p.lino.molding,false);
  assert.equal(matter.cast(p,3),false);
});
test('Wall windup becomes solid, blocks LOS and shots; friendly damage does not destroy it', () => {
  const { p, enemy, ctx, matter, tick, build } = setup();
  assert.ok(build(0)); assert.equal(ctx.world.colliders.length, 0);
  tick(.36); const hit = raycastWorld(ctx.world, p.eyePos, p.aimDir(), 15)!;
  assert.ok(hit); hit.box.onDamage!(p, 500); assert.equal(matter.structures.length, 1);
  hit.box.onDamage!(enemy, 500);
  assert.equal(ctx.world.colliders.length, 0); assert.equal(matter.structures.length, 0);
  assert.equal(p.lino.control, 75); assert.equal(p.lino.reserved, 0);
  tick(1); assert.equal(p.lino.control, 87);
});
test('Prison has a full second to escape and breaking a single section opens a passage', () => {
  const { enemy, ctx, matter, tick, build } = setup();
  assert.ok(build(2)); tick(.9); assert.equal(ctx.world.colliders.length, 0);
  tick(.11); assert.equal(ctx.world.colliders.length, 4);
  const side = ctx.world.colliders[0]; side.onDamage!(enemy, 200);
  assert.equal(ctx.world.colliders.length, 3); assert.equal(matter.structures[0].parts.length, 3);
});
test('Aiming into an own wall builds an overlapping wall at ground level; each keeps its own health and cost', () => {
  const { p, enemy, ctx, matter, tick, build } = setup();
  assert.ok(build(0)); tick(.36);
  const first = matter.structures[0].parts[0].box;
  assert.ok(build(0));
  // Changing selection during windup must not change the new wall's permission.
  p.lino.shape = 1; tick(.36);
  assert.equal(matter.structures.length, 2);
  const second = matter.structures[1].parts[0].box;
  assert.deepEqual(second.min.toArray(), first.min.toArray());
  assert.deepEqual(second.max.toArray(), first.max.toArray());
  assert.equal(p.lino.reserved, 50);
  first.onDamage!(enemy, 500);
  assert.equal(ctx.world.colliders.length, 1);
  assert.equal(ctx.world.colliders[0], second);
  assert.equal(p.lino.reserved, 25);
});
test('Overlap permission is restricted to the same owner and wall shape; map geometry and actors still block', () => {
  const { p, enemy, ctx, matter, tick, build } = setup();
  assert.ok(build(0)); tick(.36);
  const box = matter.structures[0].parts[0].box;
  const candidate = { min: box.min.clone(), max: box.max.clone() };
  const valid = (owner: Player, shape = 0) => (matter as any).valid([candidate], owner, shape);
  assert.equal(valid(p), true);
  assert.equal(valid(enemy), false);
  enemy.team = p.team;
  assert.equal(valid(enemy), false);
  assert.equal(valid(p, 1), false);
  ctx.world.colliders.push(candidate);
  assert.equal(valid(p), false);
  ctx.world.colliders.pop();
  enemy.pos.set(0, 0, -8);
  assert.equal(valid(p), false);
});
test('Real hitscan and melee attacks damage the covering structure before the player behind it', () => {
  const { p, enemy, ctx, matter, tick, build } = setup();
  assert.ok(build(0)); tick(.36);
  enemy.hero = HERO_MAP.shin; enemy.weaponAmmo = 36; enemy.pos.set(0,0,-12); enemy.yaw = Math.PI;
  firePrimary(enemy,ctx);
  assert.equal(matter.structures[0].parts[0].hp,226); assert.equal(p.hp,p.maxHp);
  enemy.pos.z=-9; fireMelee(enemy,ctx);
  assert.ok(matter.structures[0].parts[0].hp < 226); assert.equal(p.hp,p.maxHp);
});
test('Swept projectiles damage and eventually break a wall while its collider shields the player', () => {
  const { p, enemy, ctx, matter, tick, build } = setup();
  assert.ok(build(0)); tick(.36); enemy.pos.set(0,0,-12);
  for(let i=0;i<4;i++) {
    ctx.entities.spawnProjectile({ origin: enemy.eyePos, dir: new THREE.Vector3(0,0,1), speed:200, radius:.1, damage:65, team:1, owner:enemy, color:0xff2449 });
    ctx.entities.update(.05,ctx.world,ctx.players,ctx.effects);
  }
  assert.equal(matter.structures.length,0); assert.equal(ctx.world.colliders.length,0); assert.equal(p.hp,p.maxHp);
});
test('Solidification cannot trap an actor inside a wall collider', () => {
  const { enemy, ctx, tick, build } = setup();
  assert.ok(build(0)); enemy.pos.set(0, 0, -8); tick(.36);
  assert.equal(ctx.world.colliders.length, 0);
});
test('Ramps are traversable by allies in both world axes and directions', () => {
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const { p, ctx, tick, build } = setup(); p.yaw = yaw;
    assert.ok(build(1)); tick(.36);
    const pos = new THREE.Vector3(), forward = p.aimDir();
    for (let i = 0; i < 150; i++) {
      const vel = forward.clone().multiplyScalar(5); vel.y = -.2;
      moveWithCollision(ctx.world, pos, vel, .016, .42, 1.8);
      if (pos.y > 3.4) break;
    }
    assert.ok(pos.y > 3.4, `ramp yaw ${yaw}: ${pos.toArray()}`);
  }
});
test('Ceifar deals a three-hit combo, final knockback, and V cannot bypass its recovery', () => {
  const { p, enemy, ctx } = setup(); enemy.pos.set(0, 0, -2.5); enemy.hp = 1000;
  const damages: number[] = [];
  for (let i = 0; i < 3; i++) {
    const hp = enemy.hp; p.fireCd = 0; firePrimary(p, ctx); damages.push(hp - enemy.hp);
    fireMelee(p, ctx); assert.equal(enemy.hp, hp - damages[i]);
    advanceGameTime(.4);
  }
  assert.deepEqual(damages, [45,45,60]); assert.ok(enemy.vel.z < 0); assert.equal(p.fireCd, .65);
});
test('Basic scythe reaches 7.5 meters, respects its limit and cannot hit through cover', () => {
  for(const [distance,cover,hit] of [[7.2,false,true],[8.5,false,false],[7.2,true,false]] as const) {
    const {p,enemy,ctx}=setup(); enemy.pos.set(0,0,-distance);
    if(cover) ctx.world.colliders.push({min:new THREE.Vector3(-2,0,-3),max:new THREE.Vector3(2,3,-2.5)});
    const hp=enemy.hp; firePrimary(p,ctx); assert.equal(enemy.hp<hp,hit);
  }
});
test('Fast tether momentum cannot cross a thin wall between simulation frames', () => {
  const {p,ctx}=setup();
  ctx.world.colliders.push({min:new THREE.Vector3(-2,0,-.85),max:new THREE.Vector3(2,4,-.75)});
  p.vel.set(0,0,-32); p.onGround=false; p.lino.momentumUntil=gameNow()+2;
  p.update(.05,ctx);
  assert.ok(p.pos.z>=-.34, `crossed wall at ${p.pos.z}`);
});
test('Tether accelerates instead of teleporting and retains velocity on release; anchor destruction detaches', () => {
  const { p, ctx, matter } = setup();
  const box = { min: new THREE.Vector3(-2,0,-12), max: new THREE.Vector3(2,10,-11) }; ctx.world.colliders.push(box);
  assert.ok(matter.cast(p,1)); const pos = p.pos.clone(); matter.physics(p,.1);
  assert.deepEqual(p.pos.toArray(),pos.toArray()); assert.ok(p.vel.z < -8);
  const vel = p.vel.clone(); matter.detach(p);
  assert.deepEqual(p.vel.toArray(),vel.toArray()); assert.equal(p.lino.reserved,0);
  assert.ok(p.lino.momentumUntil > gameNow());
  p.abilityCd[1]=0; assert.ok(matter.cast(p,1)); ctx.world.colliders.length=0; matter.physics(p,.1);
  assert.equal(p.lino.anchor,null); assert.equal(p.lino.reserved,0);
});
test('Ultimate unlocks extra shapes with half cost, stays unique, collapses after leaving, and preserves old structures', () => {
  const { p, matter, tick, build } = setup(); assert.ok(build(0)); tick(.36);
  p.pos.x=8; p.resource=100; assert.ok(matter.ultimate(p)); p.resource=100; assert.equal(matter.ultimate(p),false);
  assert.ok(build(3)); assert.equal(p.lino.reserved,35); assert.equal(p.abilityCd[0],.6);
  tick(.2); p.pos.x=40; tick(.1); tick(1.4); assert.ok(p.lino.field);
  tick(.11); assert.equal(p.lino.field,null); assert.equal(matter.structures.length,1); assert.equal(p.lino.reserved,25);
});
test('Death/reset releases matter and removes colliders, previews and construction reservations', () => {
  const { p, matter, ctx, tick, build } = setup(); assert.ok(build(0)); tick(.36);
  p.alive=false; tick(.1); assert.equal(matter.structures.length,0); assert.equal(ctx.world.colliders.length,0); assert.equal(p.lino.reserved,0);
});
test('Legacy ranged Lino decks keep their names, levels and slots with useful replacement cards', () => {
  const cards = ['c_headshot','c_reload','c_ammo','c_ultdmg','c_lino_energia'].map(id => ({ id,level:3 }));
  const library = migrateLoadoutLibrary({ lino: [null,{name:'Meu deck',cards}] });
  assert.ok(validDeck('lino',(library.lino as any[])[1]));
  assert.deepEqual((library.lino as any[])[1].cards.map((c:any)=>c.id), ['c_lino_alcance','c_lino_regresso','c_jump','c_radius','c_lino_energia']);
});
test('Tether reserves 30 Control, follows a moving enemy and releases when the target dies', () => {
  const {p,enemy,matter}=setup(); enemy.pos.set(0,0,-10);
  p.lino.control=29; assert.equal(matter.cast(p,1),false); assert.equal(p.lino.reserved,0);
  p.lino.control=100; assert.ok(matter.cast(p,1));
  assert.equal(p.lino.control,70); assert.equal(p.lino.reserved,30); assert.equal(p.lino.anchorTarget,enemy);
  enemy.pos.x=2; matter.physics(p,.016);
  assert.deepEqual(p.lino.anchor!.toArray(),enemy.center.toArray()); assert.ok(p.vel.x>0);
  enemy.alive=false; matter.physics(p,.016);
  assert.equal(p.lino.anchor,null); assert.equal(p.lino.anchorTarget,null); assert.equal(p.lino.reserved,0);
});
test('Enemy tether respects cover and range, cannot target allies and breaks when cover intervenes', () => {
  const {p,enemy,ctx,matter}=setup(); enemy.pos.set(0,0,-10);
  enemy.team=0; assert.equal(matter.cast(p,1),false);
  enemy.team=1; enemy.pos.z=-30; assert.equal(matter.cast(p,1),false);
  enemy.pos.z=-10;
  const cover={min:new THREE.Vector3(-2,0,-6),max:new THREE.Vector3(2,3,-5)};
  ctx.world.colliders.push(cover);
  assert.ok(matter.cast(p,1)); assert.equal(p.lino.anchorTarget,null); assert.equal(p.lino.anchorBox,cover);
  matter.detach(p); p.abilityCd[1]=0; ctx.world.colliders.length=0;
  assert.ok(matter.cast(p,1)); ctx.world.colliders.push(cover); matter.physics(p,.016);
  assert.equal(p.lino.anchor,null); assert.equal(p.lino.reserved,0);
});
test('Dash travels a short distance, damages multiple enemies once, respects cover and grants brief invulnerability', () => {
  const {p,enemy,ctx,matter}=setup(); enemy.pos.set(0,0,-1.5);
  const second=new Player(HERO_MAP.yume,1,'Second',false); second.pos.set(1,0,-1.5); ctx.players.push(second);
  const blocked=new Player(HERO_MAP.yume,1,'Covered',false); blocked.pos.set(-1.8,0,-1); ctx.players.push(blocked);
  ctx.world.colliders.push({min:new THREE.Vector3(-1.1,0,-2),max:new THREE.Vector3(-.9,3,0)});
  p.lino.molding=true; assert.ok(matter.cast(p,2)); assert.equal(p.lino.molding,false);
  assert.equal(p.applyDamage(enemy,100),0); assert.equal(matter.cast(p,2),false);
  for(let i=0;i<13;i++){advanceGameTime(.016);p.update(.016,ctx);}
  assert.equal(enemy.hp,enemy.maxHp-55); assert.equal(second.hp,second.maxHp-55); assert.equal(blocked.hp,blocked.maxHp);
  assert.ok(-p.pos.z>4 && -p.pos.z<5.1);
  advanceGameTime(.1); assert.equal(p.applyDamage(enemy,100),100);
});
test('Air steering accelerates from rest, changes direction after a launch and preserves momentum without input', () => {
  const {p,ctx}=setup(); p.pos.y=20;p.onGround=false;
  for(let i=0;i<15;i++){p.localMove.set(1,0,0);advanceGameTime(.016);p.update(.016,ctx);}
  assert.ok(p.vel.x>8); assert.ok(p.pos.x>1);
  p.vel.set(0,0,-24);p.lino.momentumUntil=gameNow()+2;
  for(let i=0;i<15;i++){p.localMove.set(1,0,0);advanceGameTime(.016);p.update(.016,ctx);}
  assert.ok(p.vel.x>8);assert.ok(p.vel.z<-18);
  const horizontal=[p.vel.x,p.vel.z];advanceGameTime(.016);p.update(.016,ctx);
  assert.deepEqual([p.vel.x,p.vel.z],horizontal);
});
test('Ramp is a single continuous wedge with matching sloped ray hits, landing and empty space above it', () => {
  const {p,ctx,matter,tick,build}=setup();assert.ok(build(1));tick(.36);
  assert.equal(matter.structures[0].parts.length,1);
  const box=matter.structures[0].parts[0].box;assert.ok(box.ramp);
  assert.equal(box.max.y,3.6);
  for(const z of [-6,-7,-8,-9,-10]) {
    const hit=raycastWorld(ctx.world,new THREE.Vector3(0,6,z),new THREE.Vector3(0,-1,0),10)!;
    const expected=(-z-5.5)*3.6/5;
    assert.ok(Math.abs(hit.point.y-expected)<.0001);assert.ok(hit.normal.y<1);
  }
  assert.equal(raycastWorld(ctx.world,new THREE.Vector3(-4,3,-7),new THREE.Vector3(1,0,0),8),null);
  assert.ok(raycastWorld(ctx.world,new THREE.Vector3(-4,.5,-7),new THREE.Vector3(1,0,0),8));
  ctx.entities.spawnProjectile({origin:new THREE.Vector3(-4,3,-7),dir:new THREE.Vector3(1,0,0),speed:100,radius:.1,damage:10,team:0,owner:p,color:0xffffff});
  ctx.entities.update(.05,ctx.world,ctx.players,ctx.effects);assert.equal(ctx.entities.projectiles.length,1);
  p.pos.set(0,5,-7);p.onGround=false;
  for(let i=0;i<60;i++){advanceGameTime(.016);p.update(.016,ctx);}
  assert.ok(Math.abs(p.pos.y-1.08)<.001);assert.ok(p.onGround);
});
