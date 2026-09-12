import * as THREE from 'three';
import type { World } from '../../maps/world';
import { rampHeight } from '../../maps/world';

const CELL = 1, CLEARANCE = .6;

/** Ground routes around solid buildings. Roofs remain optional mobility positions. */
export function groundClear(world: World, x: number, z: number): boolean {
  if (Math.abs(x) > world.size.w / 2 - CLEARANCE || Math.abs(z) > world.size.d / 2 - CLEARANCE) return false;
  for (const b of world.colliders) {
    if (b.min.y >= 2 || b.max.y <= .25) continue;
    if (x + CLEARANCE <= b.min.x || x - CLEARANCE >= b.max.x || z + CLEARANCE <= b.min.z || z - CLEARANCE >= b.max.z) continue;
    if (b.ramp && rampHeight(b, x, z) <= .2) continue;
    return false;
  }
  return true;
}

export function groundSegmentClear(world: World, a: THREE.Vector3, b: THREE.Vector3): boolean {
  const steps = Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / .4);
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0;
    if (!groundClear(world, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
  }
  return true;
}

/** A* with clearance and no diagonal corner cutting; includes temporary Lino walls. */
export function findGroundPath(world: World, from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
  if (groundSegmentClear(world, from, to)) return [to.clone()];
  const width = Math.floor(world.size.w / CELL) + 1, depth = Math.floor(world.size.d / CELL) + 1;
  const count = width * depth, cells = new Int8Array(count);
  const point = (id: number) => new THREE.Vector3((id % width) * CELL - world.size.w / 2, 0, Math.floor(id / width) * CELL - world.size.d / 2);
  const openCell = (id: number) => {
    if (id < 0 || id >= count) return false;
    if (!cells[id]) { const p = point(id); cells[id] = groundClear(world, p.x, p.z) ? 1 : -1; }
    return cells[id] === 1;
  };
  const nearest = (p: THREE.Vector3, start: boolean) => {
    const cx = Math.round((p.x + world.size.w / 2) / CELL), cz = Math.round((p.z + world.size.d / 2) / CELL);
    for (let radius = 0; radius <= 12; radius++) {
      const options: number[] = [];
      for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        const x = cx + dx, z = cz + dz;
        if (x < 0 || x >= width || z < 0 || z >= depth) continue;
        const id = z * width + x;
        if (openCell(id) && (!start || groundSegmentClear(world, p, point(id)))) options.push(id);
      }
      if (options.length) return options.sort((a, b) => point(a).distanceToSquared(p) - point(b).distanceToSquared(p))[0];
    }
    return -1;
  };
  const start = nearest(from, true), end = nearest(to, false);
  if (start < 0 || end < 0) return [];
  const scores = new Float64Array(count).fill(Infinity), parents = new Int32Array(count).fill(-1), closed = new Uint8Array(count);
  const priorities = new Float64Array(count).fill(Infinity);
  const heuristic = (id: number) => Math.hypot(id % width - end % width, Math.floor(id / width) - Math.floor(end / width));
  const frontier = [start]; scores[start] = 0;
  priorities[start] = heuristic(start);
  for (let iteration = 0; frontier.length && iteration < count; iteration++) {
    let best = 0;
    for (let i = 1; i < frontier.length; i++) if (priorities[frontier[i]] < priorities[frontier[best]]) best = i;
    const current = frontier.splice(best, 1)[0];
    if (current === end) {
      const path: THREE.Vector3[] = [];
      for (let id = end; id !== start; id = parents[id]) path.push(point(id));
      path.push(point(start)); path.reverse();
      if (groundSegmentClear(world, point(end), to)) path.push(to.clone());
      return path;
    }
    closed[current] = 1;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const x = current % width + dx, z = Math.floor(current / width) + dz;
      if (x < 0 || x >= width || z < 0 || z >= depth) continue;
      const next = z * width + x;
      if (closed[next] || !openCell(next)) continue;
      if (dx && dz && (!openCell(current + dx) || !openCell(current + dz * width))) continue;
      const score = scores[current] + Math.hypot(dx, dz);
      if (score >= scores[next]) continue;
      if (!Number.isFinite(scores[next])) frontier.push(next);
      parents[next] = current; scores[next] = score;
      priorities[next] = score + heuristic(next);
    }
  }
  return [];
}
