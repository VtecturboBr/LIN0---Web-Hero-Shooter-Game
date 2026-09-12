import { dressTrainingBuilding } from './training/scene';
import type { Player } from '../game/actors/Player';
import * as THREE from "three";
import { dressShoto } from './shoto/scene';
import type { BoxDef } from './types';
import type { MapDef } from './types';

export interface AABB { min: THREE.Vector3; max: THREE.Vector3; step?: boolean; ramp?: { axis: 'x' | 'z'; direction: 1 | -1 }; ownerId?: number; onDamage?: (source: Player, amount: number) => void; }

/** Continuous top plane of a solid wedge, shared by movement, rays and rendering. */
export function rampHeight(box: AABB, x: number, z: number, clamp = true): number {
  if (!box.ramp) return box.max.y;
  const {axis, direction} = box.ramp;
  let progress = ((axis === 'x' ? x : z) - box.min[axis]) / (box.max[axis] - box.min[axis]);
  if (direction < 0) progress = 1 - progress;
  if (clamp) progress = Math.max(0, Math.min(1, progress));
  return box.min.y + progress * (box.max.y - box.min.y);
}
export function colliderGeometry(box: AABB): THREE.BoxGeometry {
  const size = box.max.clone().sub(box.min), center = box.min.clone().addScaledVector(size, .5);
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  if (box.ramp) {
    const vertices = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < vertices.count; i++) if (vertices.getY(i) > 0) {
      vertices.setY(i, rampHeight(box, center.x + vertices.getX(i), center.z + vertices.getZ(i)) - center.y);
    }
    vertices.needsUpdate = true; geometry.computeVertexNormals();
  }
  return geometry;
}

export interface World {
  map: MapDef;
  colliders: AABB[];
  group: THREE.Group;
  objectivePos: THREE.Vector3;
  objectiveRadius: number;
  spawns: THREE.Vector3[][];
  size: { w: number; d: number };
  objectiveBeacon: THREE.Mesh;
  beaconLight: THREE.PointLight;
}

const tmpV = new THREE.Vector3();

function boxAABB(b: Pick<BoxDef, 'x' | 'y' | 'z' | 'w' | 'h' | 'd' | 'ramp'>): AABB {
  return {
    ramp: b.ramp,
    min: new THREE.Vector3(b.x - b.w / 2, b.y - b.h / 2, b.z - b.d / 2),
    max: new THREE.Vector3(b.x + b.w / 2, b.y + b.h / 2, b.z + b.d / 2),
  };
}

export function buildWorld(mapDef: MapDef, scene: THREE.Scene): World {
  const group = new THREE.Group();
  scene.add(group);
  const { w, d } = mapDef.size;
  const wallH = mapDef.wallHeight;

  // ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color: mapDef.groundColor, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = mapDef.theme === 'residential';
  group.add(ground);

  const colliders: AABB[] = [];

  // boundary walls
  const wallT = 1;
  const wallBoxes = [
    { x: 0, y: wallH / 2, z: -d / 2 - wallT / 2, w: w + wallT * 2, h: wallH, d: wallT },
    { x: 0, y: wallH / 2, z: d / 2 + wallT / 2, w: w + wallT * 2, h: wallH, d: wallT },
    { x: -w / 2 - wallT / 2, y: wallH / 2, z: 0, w: wallT, h: wallH, d: d },
    { x: w / 2 + wallT / 2, y: wallH / 2, z: 0, w: wallT, h: wallH, d: d },
  ];
  for (const b of wallBoxes) {
    colliders.push(boxAABB(b));
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, b.h, b.d),
      new THREE.MeshStandardMaterial({ color: mapDef.theme === 'residential' ? 0x717b73 : 0x1c1a24, roughness: 0.9 })
    );
    mesh.position.set(b.x, b.y, b.z);
    group.add(mesh);
  }

  // decorative neon strip around the arena floor
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ color: 0x0a0812, transparent: true, opacity: 0.4 })
  );
  strip.rotation.x = -Math.PI / 2;
  strip.position.y = 0.02;
  if (mapDef.theme !== 'residential') group.add(strip);
  else { strip.geometry.dispose(); (strip.material as THREE.Material).dispose(); }

  // map boxes
  for (const b of mapDef.boxes) {
    const collider = boxAABB(b);
    // Allow the final fraction of a ramp ascent to join its landing smoothly.
    collider.step = b.detail === 'terrace';
    colliders.push(collider);
    let mat: THREE.MeshStandardMaterial;
    if (b.emissive !== undefined) {
      mat = new THREE.MeshStandardMaterial({
        color: b.color ?? 0x888888,
        emissive: b.emissive,
        emissiveIntensity: b.emissiveIntensity ?? 0.4,
        roughness: 0.6,
      });
    } else {
      mat = new THREE.MeshStandardMaterial({ color: b.color ?? 0x3a3f4a, roughness: 0.8 });
    }
    const mesh = new THREE.Mesh(colliderGeometry(collider), mat);
    mesh.name = b.detail ? `shoto-${b.detail}` : b.kind;
    mesh.castShadow = mesh.receiveShadow = mapDef.theme === 'residential';
    mesh.position.set(b.x, b.y, b.z);
    group.add(mesh);
    if (mapDef.id === 'training' && b.kind === 'tower') { dressTrainingBuilding(mesh, b); }
  }

  if (mapDef.theme === 'residential') dressShoto(group, mapDef);

  // torii gates
  for (const t of mapDef.torii) {
    const gate = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: 0xc2242f, roughness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x8a1a22, roughness: 0.6 });
    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 4, 10), dark);
    p1.position.set(-2.2, 2, 0);
    const p2 = p1.clone();
    p2.position.x = 2.2;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(5, 0.35, 0.35), red);
    beam.position.y = 4.1;
    const beam2 = new THREE.Mesh(new THREE.BoxGeometry(5, 0.55, 0.45), red);
    beam2.position.y = 4.7;
    beam2.position.z = -0.1;
    gate.add(p1, p2, beam, beam2);
    gate.position.set(t.x, 0, t.z);
    if (t.rot) gate.rotation.y = t.rot;
    group.add(gate);
  }

  // lanterns
  const lanternGeo = new THREE.SphereGeometry(0.35, 10, 10);
  for (const l of mapDef.lanterns) {
    const color = l.color ?? mapDef.accent;
    const lantern = new THREE.Mesh(
      lanternGeo,
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6 })
    );
    lantern.position.set(l.x, l.y ?? 2.2, l.z);
    group.add(lantern);
  }

  // spawn discs
  const spawnMat = (c: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.35 });
  const spawns = mapDef.spawns.map((teamSpawns, ti) =>
    teamSpawns.map((s, i) => {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.8, 20), spawnMat(ti === 0 ? 0x3f9fff : 0xff3b5c));
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(s.x, 0.05 + i * 0.002, s.z);
      group.add(disc);
      return new THREE.Vector3(s.x, 0, s.z);
    })
  );

  // objective beacon
  const residential = mapDef.theme === 'residential';
  const beaconGeo = residential ? new THREE.OctahedronGeometry(.6) : new THREE.CylinderGeometry(0.9, 1.4, 2.2, 16, 1, true);
  const beaconMat = new THREE.MeshBasicMaterial({
    color: mapDef.accent, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
  });
  const beacon = new THREE.Mesh(beaconGeo, beaconMat);
  beacon.position.set(mapDef.objective.x, residential ? 4.5 : 1.1, mapDef.objective.z);
  group.add(beacon);

  const beaconLight = new THREE.PointLight(mapDef.accent, 60, 26, 2);
  beaconLight.position.set(mapDef.objective.x, 3.4, mapDef.objective.z);
  group.add(beaconLight);

  // ring on the ground marking the zone
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(mapDef.objective.radius - 0.3, mapDef.objective.radius + 0.3, 40),
    new THREE.MeshBasicMaterial({ color: mapDef.accent, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(mapDef.objective.x, 0.06, mapDef.objective.z);
  group.add(ring);

  return {
    map: mapDef,
    colliders,
    group,
    objectivePos: new THREE.Vector3(mapDef.objective.x, 0, mapDef.objective.z),
    objectiveRadius: mapDef.objective.radius,
    spawns,
    size: { w, d },
    objectiveBeacon: beacon,
    beaconLight,
  };
}

/** Ray vs AABB (slab method). Returns t or Infinity. */
export function rayAABB(origin: THREE.Vector3, dir: THREE.Vector3, box: AABB): number {
  let tmin = -Infinity, tmax = Infinity;
  for (let axis = 0; axis < 3; axis++) {
    const o = origin.getComponent(axis);
    const d = dir.getComponent(axis);
    const min = box.min.getComponent(axis);
    const max = box.max.getComponent(axis);
    if (Math.abs(d) < 1e-8) {
      if (o < min || o > max) return Infinity;
    } else {
      let t1 = (min - o) / d;
      let t2 = (max - o) / d;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  if (box.ramp) {
    const {axis, direction} = box.ramp;
    const slope = direction * (box.max.y - box.min.y) / (box.max[axis] - box.min[axis]);
    const distance = origin.y - rampHeight(box, origin.x, origin.z, false);
    const velocity = dir.y - slope * dir[axis];
    if (Math.abs(velocity) < 1e-8) { if (distance > 0) return Infinity; }
    else if (velocity > 0) tmax = Math.min(tmax, -distance / velocity);
    else tmin = Math.max(tmin, -distance / velocity);
    if (tmin > tmax) return Infinity;
  }
  return tmax < 0 ? Infinity : Math.max(0, tmin);
}

export interface RayHit { box: AABB; t: number; point: THREE.Vector3; normal: THREE.Vector3; }

/** First collision of a ray with world geometry within maxDist. */
export function raycastWorld(world: World, origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): RayHit | null {
  let bestT = maxDist;
  let hit: RayHit | null = null;
  for (const box of world.colliders) {
    const t = rayAABB(origin, dir, box);
    if (t < bestT) {
      bestT = t;
      const point = origin.clone().addScaledVector(dir, t);
      // approximate normal from the penetrated face
      const c = box.min.clone().add(box.max).multiplyScalar(0.5);
      const p = point.clone().sub(c);
      const nx = box.max.x - box.min.x, ny = box.max.y - box.min.y, nz = box.max.z - box.min.z;
      const dx = Math.abs(p.x) - nx / 2, dy = Math.abs(p.y) - ny / 2, dz = Math.abs(p.z) - nz / 2;
      let normal = new THREE.Vector3(0, 1, 0);
      if (dx >= dy && dx >= dz) normal = new THREE.Vector3(Math.sign(p.x), 0, 0);
      else if (dy >= dz) normal = new THREE.Vector3(0, Math.sign(p.y), 0);
      else normal = new THREE.Vector3(0, 0, Math.sign(p.z));
      if (box.ramp && Math.abs(point.y - rampHeight(box, point.x, point.z)) < .001) {
        const {axis, direction} = box.ramp;
        normal.set(0, 1, 0); normal[axis] = -direction * (box.max.y - box.min.y) / (box.max[axis] - box.min[axis]); normal.normalize();
      }
      hit = { box, t, point, normal };
    }
  }
  return hit;
}

/** Simple line of sight check (world geometry only). */
export function hasLOS(world: World, from: THREE.Vector3, to: THREE.Vector3): boolean {
  const dir = tmpV.copy(to).sub(from);
  const dist = dir.length();
  if (dist < 1e-4) return true;
  dir.normalize();
  const hit = raycastWorld(world, from, dir, dist - 0.2);
  return hit === null;
}

/** Move a player-shaped AABB (radius r, height h, feet pos) through the world, axis by axis. */
export function moveWithCollision(
  world: World, pos: THREE.Vector3, vel: THREE.Vector3, dt: number, r: number, h: number
): { onGround: boolean } {
  let onGround = false;

  const tryMove = (axis: 0 | 1 | 2) => {
    pos.setComponent(axis, pos.getComponent(axis) + vel.getComponent(axis) * dt);
    for (const box of world.colliders) {
      const overlaps =
        pos.x + r > box.min.x && pos.x - r < box.max.x &&
        pos.y + h > box.min.y && pos.y < box.max.y &&
        pos.z + r > box.min.z && pos.z - r < box.max.z;
      if (!overlaps) continue;
      if (box.ramp && axis !== 1) {
        const surface = rampHeight(box, pos.x, pos.z);
        if (pos.y >= surface - .3 && vel.y <= 0) {
          const ceiling = world.colliders.some(other => other !== box && pos.x + r > other.min.x && pos.x - r < other.max.x && pos.z + r > other.min.z && pos.z - r < other.max.z && other.min.y < surface + h && other.max.y > surface + .01);
          if (pos.y <= surface + .3 && !ceiling) { pos.y = surface; onGround = true; continue; }
        }
        if (pos.y >= surface - .001) continue;
      }
      if (axis !== 1 && box.step && box.max.y - pos.y <= .3 && vel.y <= 0) {
        const ceiling = world.colliders.some(other => other !== box && pos.x + r > other.min.x && pos.x - r < other.max.x && pos.z + r > other.min.z && pos.z - r < other.max.z && other.min.y < box.max.y + h && other.max.y > box.max.y + .01);
        if (!ceiling) { pos.y = box.max.y; onGround = true; continue; }
      }
      if (axis === 0) pos.x = vel.x > 0 ? box.min.x - r : box.max.x + r;
      else if (axis === 2) pos.z = vel.z > 0 ? box.min.z - r : box.max.z + r;
      else {
        if (vel.y > 0) { pos.y = box.min.y - h; vel.y = 0; }
        else { pos.y = box.max.y; vel.y = 0; onGround = true; }
      }
      vel.setComponent(axis, 0);
    }
  };

  tryMove(0);
  tryMove(2);

  // vertical (gravity + ground)
  const previousY = pos.y;
  pos.y += vel.y * dt;
  if (pos.y <= 0) {
    pos.y = 0; vel.y = 0; onGround = true;
  }
  for (const box of world.colliders) {
    if (pos.x + r <= box.min.x || pos.x - r >= box.max.x || pos.z + r <= box.min.z || pos.z - r >= box.max.z) continue;
    const surface = box.ramp ? rampHeight(box, pos.x, pos.z) : box.max.y;
    if (vel.y <= 0 && previousY >= surface - .001 && pos.y <= surface) {
      pos.y = surface; vel.y = 0; onGround = true;
    } else if (vel.y > 0 && previousY + h <= box.min.y + .001 && pos.y + h >= box.min.y) {
      pos.y = box.min.y - h; vel.y = 0;
    }
  }
  pos.x = THREE.MathUtils.clamp(pos.x, -world.size.w / 2 + r, world.size.w / 2 - r);
  pos.z = THREE.MathUtils.clamp(pos.z, -world.size.d / 2 + r, world.size.d / 2 - r);
  return { onGround };
}
