import * as THREE from 'three';
import type { MapDef } from '../types';

/** Visual dressing follows the solid level geometry. Repeated details are instanced. */
export function dressShoto(group: THREE.Group, map: MapDef) {
  type Part = { x: number; y: number; z: number; w: number; h: number; d: number; rot: number; tilt: number };
  const batches = new Map<string, { mat: THREE.Material; parts: Part[] }>();
  const box = (color: number, x: number, y: number, z: number, w: number, h: number, d: number, glow = false, rot = 0, tilt = 0) => {
    const key = `${color}/${glow}`;
    if (!batches.has(key)) batches.set(key, { mat: glow
      ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshStandardMaterial({ color, roughness: .86 }), parts: [] });
    batches.get(key)!.parts.push({ x, y, z, w, h, d, rot, tilt });
  };
  const paint = (color: number, x: number, z: number, w: number, d: number, y = .035, rot = 0) => box(color, x, y, z, w, .01, d, false, rot);
  const sign = (title: string, sub: string, x: number, y: number, z: number, w: number, h: number, rot = 0, color = '#f4d7a6') => {
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 192;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#202b30'; ctx.fillRect(0, 0, 768, 192);
    ctx.fillStyle = color; ctx.fillRect(18, 16, 5, 160);
    ctx.font = 'bold 68px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(title, 394, 92, 698);
    ctx.font = '27px sans-serif'; ctx.fillStyle = '#ced5ce'; ctx.fillText(sub, 394, 153, 698);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture }));
    mesh.position.set(x, y, z); mesh.rotation.y = rot; group.add(mesh);
  };

  // Broad sidewalks, quiet asphalt streets and pocket parks connected by gravel paths.
  for (const side of [-1, 1]) {
    paint(0x8c8d80, 0, side * 21.5, 90, 24);
    paint(0x3d5550, side * 37.5, 0, 13, 15);
    paint(0x778965, 0, side * 27, 60, 12, .05);
    paint(0xb0a58e, 0, side * 23, 62, 3.4, .06);
    paint(0xb0a58e, 0, side * 28, 7, 9, .065);
    for (const x of [-29, 29]) paint(0xb0a58e, x, side * 19, 3.4, 13, .07);
    // Residential lanes connect both base exits to the park route.
    paint(0x454f54, side * 34, side * 11.5, 6, 13, .085);
    paint(0x454f54, side * 34, -side * 11.5, 6, 13, .085);
    for (const lane of [-1, 1]) {
      paint(0x9fa293, side * 23, lane * 6.9, 17, 1.1, .05);
      paint(0xd5c69b, side * 23, lane * 6.4, 17, .13, .065);
    }
    // Zebra crossings provide a familiar, readable Japanese intersection.
    for (let i = -4; i <= 4; i++) paint(0xc9cdc2, side * 10.5, i * 1.18, 3.6, .62, .065);
    for (let i = -2; i <= 2; i++) paint(0xc9cdc2, i * 1.5, side * 9, .8, 3, .065);
    for (const x of [19, 23, 27]) paint(0xcbc5a4, side * x, 0, 1.9, .15, .07);
    // Parking bay beside a van; no traffic lanes through building footprints.
    paint(0xb8c0b4, side * 14, side * 4.05, 5.7, .1, .06);
    for (const x of [11.15, 16.85]) paint(0xb8c0b4, side * x, side * 2.7, .1, 2.8, .06);
  }
  // Ground-level point: no plinth, pillars or solid holograms interrupt combat.
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(7.2, 64), new THREE.MeshStandardMaterial({ color: 0xa3a394, roughness: .76 }));
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = .045; group.add(plaza);
  for (let i = -3; i <= 3; i++) {
    const span = Math.sqrt(7.1 ** 2 - (i * 2) ** 2) * 2;
    paint(0x7e8983, i * 2, 0, .035, span, .06);
    paint(0x7e8983, 0, i * 2, span, .035, .06);
  }

  for (const b of map.boxes) {
    if (b.detail === 'home') {
      const floors = b.h > 6 ? 3 : 2;
      for (const side of [-1, 1]) {
        for (let level = 0; level < floors; level++) {
          const y = 1.6 + level * 2.25;
          for (let col = -1; col <= 1; col++) {
            const x = b.x + col * b.w * .26;
            const z = b.z + side * (b.d / 2 + .026);
            box(0x303e45, x, y, z, b.w * .18, 1.4, .04);
            box((col + level) % 3 === 0 ? 0xc2b084 : 0x69818a, x, y, z + side * .025, b.w * .15, 1.12, .025, true);
            box(0x3d484b, x, y, z + side * .044, .065, 1.3, .04);
            box(0x3d484b, x, y, z + side * .044, b.w * .17, .075, .04);
            box(0x595f5c, x, y - .8, z, b.w * .2, .16, .1);
          }
          // Side windows also make roof approaches readable.
          for (const off of [-.25, .25]) {
            box(0x303e45, b.x + side * (b.w / 2 + .02), y, b.z + b.d * off, .04, 1.4, 1.6);
            box(0x778b8d, b.x + side * (b.w / 2 + .05), y, b.z + b.d * off, .025, 1.1, 1.35, true);
          }
          box(0x646b66, b.x, y + .95, b.z + side * (b.d / 2 + .03), b.w, .17, .08);
        }
        box(0x6c716c, b.x, .22, b.z + side * (b.d / 2 + .025), b.w, .44, .05);
      }
      // Roofs are solid, flat and usable by mobility heroes.
      paint(0x515e60, b.x, b.z, b.w - .1, b.d - .1, b.h + .015);
      for (let x = -b.w / 2 + .6; x < b.w / 2; x += 1.2) paint(0x737b76, b.x + x, b.z, .025, b.d - .2, b.h + .025);
      const front = b.z === 0 ? 1 : -Math.sign(b.z);
      const doorZ = b.z + front * (b.d / 2 + .085);
      box(0x3d403e, b.x, 1.1, doorZ, 1.3, 2.2, .07);
      box(0xa49a76, b.x + .44, 1.05, doorZ + front * .05, .055, .35, .03, true);
      if (b.w > 3) sign(Math.abs(b.x) < 30 ? '松濤  /  SHŌTŌ' : '住宅  /  RESIDÊNCIAS', Math.abs(b.x) < 30 ? 'BAIRRO RESIDENCIAL' : '02 — 住区', b.x, 3.05, doorZ + front * .06, 4.1, .8, front < 0 ? Math.PI : 0);
    } else if (b.detail === 'gateway') {
      for (const side of [-1, 1]) {
        const x = b.x + side * (b.w / 2 + .025);
        box(0x4d5858, x, 1.8, 0, .05, 2.8, 8.4);
        for (let z = -3.6; z <= 3.6; z += .55) box(0x7d8277, x + side * .03, 1.8, z, .04, 2.8, .035);
        sign('SHŌTŌ', '← PARQUE     PRAÇA A     PARQUE →', x + side * .08, 3.8, 0, 8, .85, side * Math.PI / 2);
      }
    } else if (b.detail === 'van') {
      for (const side of [-1, 1]) {
        box(0x33474f, b.x - .8, 1.55, b.z + side * 1.086, 1.1, .75, .03);
        box(0x75867f, b.x + 1, 1.3, b.z + side * 1.086, 1.8, 1.55, .025);
        box(0x33474f, b.x - 2.215, 1.6, b.z, .03, .7, 1.7);
        box(0xe1d7b2, b.x - 2.225, .72, b.z + side * .72, .035, .27, .35, true);
        for (const off of [-1.4, 1.4]) box(0x252d32, b.x + off, .38, b.z + side * 1.086, .64, .62, .035);
      }
      box(0x586861, b.x, 2.225, b.z, 3.9, .035, 1.9);
    } else if (b.detail === 'planter') {
      paint(0x3d5140, b.x, b.z, b.w - .18, b.d - .18, b.y + b.h / 2 + .02);
      for (const side of [-1, 1]) box(0xb3ad94, b.x, b.h - .08, b.z + side * b.d / 2, b.w + .07, .16, .12);
    } else if (b.detail === 'bench') {
      for (let i = -1; i <= 1; i++) box(0xae9268, b.x, b.h + .025, b.z + i * .25, b.w, .05, .21);
    } else if (b.detail === 'kiosk') {
      for (const side of [-1, 1]) sign('SHŌTŌ', '案内 / INFORMAÇÕES', b.x + side * .76, 1.45, b.z, 1.85, 1.1, side * Math.PI / 2, '#b7dcd7');
    } else if (b.detail === 'terrace') {
      const front = -Math.sign(b.z);
      box(0x4f6260, 0, 1.7, b.z + front * 3.515, 10, 2, .03);
      sign('松濤公園  /  PARQUE SHŌTŌ', 'TERRAÇO    ↗    ACESSO LATERAL', 0, 2.2, b.z + front * 3.55, 9, 1.05, front < 0 ? Math.PI : 0);
      paint(0xbab6a0, 0, b.z, 11.9, 6.9, 3.615);
      for (let x = -5; x <= 5; x += 1) paint(0x8a9488, x, b.z, .035, 6.8, 3.63);
    } else if (b.detail === 'ramp') {
      // Flush yellow edge paint follows the same continuous slope as the collider.
      const direction = b.ramp!.direction;
      for (const side of [-1, 1]) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(b.w, b.h), .018, .09), new THREE.MeshBasicMaterial({ color: 0xd6c596 }));
        line.rotation.z = direction * Math.atan2(b.h, b.w);
        line.position.set(b.x, b.h / 2 + .018, b.z + side * (b.d / 2 - .1)); group.add(line);
      }
    } else if (b.detail === 'roof') {
      const direction = b.ramp!.direction;
      for (let z = -b.d / 2 + .2; z < b.d / 2; z += .45) {
        box(0x687475, b.x, b.y + .015, b.z + z, Math.hypot(b.w, b.h), .025, .03, false, 0, direction * Math.atan2(b.h, b.w));
      }
    } else if (b.detail === 'light') {
      box(0x414e50, b.x, 4.58, b.z, .72, .12, .72);
      box(0xe7c58b, b.x, 4.5, b.z, .55, .055, .55, true);
      const light = new THREE.PointLight(0xffd79c, 28, 10, 2);
      light.position.set(b.x, 4.35, b.z); group.add(light);
    } else if (b.detail === 'shrine' || b.detail === 'pavilion') {
      const face = -Math.sign(b.z), traditional = b.detail === 'shrine';
      const z = b.z + face * 2.025;
      box(traditional ? 0x41312e : 0x526c74, 0, 1.6, z, 3.6, 2.65, .04);
      for (const x of [-1.7, -.85, 0, .85, 1.7]) box(traditional ? 0x937458 : 0x9fa69e, x, 1.6, z + face * .03, .09, 2.65, .04);
      box(0x3f4447, 0, 3.48, b.z, 5, .1, 4);
      sign(traditional ? '祈り  /  ORATÓRIO' : 'くらし  /  CASA DO BAIRRO', traditional ? 'MEMÓRIA • SILÊNCIO' : 'COMUNIDADE • CONVIVÊNCIA', 0, 2.9, z + face * .065, 4.3, .65, face < 0 ? Math.PI : 0);
      if (traditional) for (const x of [-1.3, -.7, 0, .7, 1.3]) {
        box(0xe0d0aa, x, 2.4, z + face * .06, .16, .38, .02);
        box(0x673a37, x, 2.4, z + face * .075, .035, .24, .01);
      }
    }
  }
  // Sakura canopies stay above eye level; their solid trunks/planters come from map data.
  const trees = map.boxes.filter(b => b.detail === 'tree');
  const canopy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xaa7d87, roughness: 1 }), trees.length * 5);
  const pose = new THREE.Object3D(); let index = 0;
  trees.forEach((b, ti) => {
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      pose.position.set(b.x + Math.cos(a) * 1.4, 5.5 + (i % 2) * .55, b.z + Math.sin(a) * 1.35);
      pose.scale.set(2.05, 1.5, 1.9); pose.rotation.set(i * .3, ti + i, .2); pose.updateMatrix(); canopy.setMatrixAt(index++, pose.matrix);
    }
    // Fallen petals, fixed deterministically so the scene does not churn between loads.
    for (let i = 0; i < 9; i++) paint(0xaa8b92, b.x + Math.sin(i * 4 + ti) * 2.2, b.z + Math.cos(i * 3.8 + ti) * 2.2, .07, .13, .09, i);
  });
  canopy.instanceMatrix.needsUpdate = true; canopy.castShadow = true; group.add(canopy);

  // Low skyline beyond the playable boundary suggests the rest of the neighborhood.
  // It is intentionally outside the world and never presented as a combat surface.
  for (let i = 0; i < 16; i++) for (const side of [-1, 1]) {
    const x = -64 + i * 8.5, z = side * (42 + (i % 3) * 7), h = 7 + (i * 7 % 11);
    box(0x677178, x, h / 2, z, 6.3, h, 6.5);
    for (let floor = 2; floor < h; floor += 2.4) box(0x96998f, x, floor, z - side * 3.26, 4.7, .5, .025, true);
  }
  // Brick seams and coping give the solid perimeter the role of a neighborhood wall.
  for (const side of [-1, 1]) {
    box(0x858b82, 0, 3.2, side * 34.5, 94, .13, 1.05);
    for (let x = -44; x <= 44; x += 4) box(0x596666, x, 1.6, side * 34.012, .12, 3.2, .02);
    for (let y = .6; y < 3.2; y += .6) box(0x5c6765, 0, y, side * 34.01, 92, .035, .02);
    box(0x858b82, side * 46.5, 3.2, 0, 1.05, .13, 68);
  }
  for (const { mat, parts } of batches.values()) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, parts.length);
    mesh.name = 'shoto-details';
    mesh.receiveShadow = true;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]; pose.position.set(p.x, p.y, p.z); pose.scale.set(p.w, p.h, p.d); pose.rotation.set(0, p.rot, p.tilt); pose.updateMatrix(); mesh.setMatrixAt(i, pose.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true; group.add(mesh);
  }

  // A familiar capture symbol remains visible without a solid column at eye level.
  const markerCanvas = document.createElement('canvas'); markerCanvas.width = 128; markerCanvas.height = 128;
  const c = markerCanvas.getContext('2d')!;
  c.fillStyle = '#202b30'; c.fillRect(28, 28, 72, 72);
  c.fillStyle = '#ffdfa0'; c.font = 'bold 68px sans-serif'; c.textAlign = 'center'; c.fillText('A', 64, 88);
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(markerCanvas), depthTest: true }));
  marker.position.set(0, 5.65, 0); marker.scale.set(1.65, 1.65, 1); group.add(marker);
}
