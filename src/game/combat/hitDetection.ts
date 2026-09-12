import * as THREE from "three";
import { rayAABB } from '../../maps/world';

/** Shared weapon hit volumes, in the same coordinates as the visible model. */
export function tracePlayer(origin: THREE.Vector3, dir: THREE.Vector3, pos: THREE.Vector3, radius = 0): { t: number; headshot: boolean } | null {
  const body = rayAABB(origin, dir, {
    min: pos.clone().add(new THREE.Vector3(-0.42 - radius, 0.3 - radius, -0.42 - radius)),
    max: pos.clone().add(new THREE.Vector3(0.42 + radius, 1.6 + radius, 0.42 + radius)),
  });
  const offset = origin.clone().sub(pos).sub(new THREE.Vector3(0, 1.72, 0));
  const b = offset.dot(dir);
  const c = offset.lengthSq() - (0.26 + radius) ** 2;
  const discriminant = b * b - c;
  const head = c <= 0 ? 0 : discriminant >= 0 && -b - Math.sqrt(discriminant) >= 0 ? -b - Math.sqrt(discriminant) : Infinity;
  const t = Math.min(body, head);
  return Number.isFinite(t) ? { t, headshot: head < body } : null;
}
