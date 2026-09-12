import type { BoxDef } from '../types';
import type { MapDef } from '../types';

// Original arena inspired by Shoto, Shibuya. Coordinates are gameplay space,
// not a recreation of a real street or an addition to LIN0's established canon.
const boxes: BoxDef[] = [];
const add = (x: number, z: number, w: number, d: number, h: number, detail: BoxDef['detail'], color: number, base = 0) => {
  boxes.push({ x, y: base + h / 2, z, w, d, h, kind: detail === 'home' ? 'tower' : 'wall', detail, color });
};

// Equal distances and a 180-degree symmetric collision layout for both teams.
for (const side of [-1, 1]) {
  // A solid frontage shields all five spawn positions; exits lead around either end.
  add(side * 33, 0, 2, 10, 4.8, 'gateway', 0x65716e);
  add(side * 44, 0, 2, 14, 6, 'home', 0x9c9687);
  for (const lane of [-1, 1]) {
    add(side * 24, lane * 12, 12, 9, 7.2, 'home', side * lane > 0 ? 0xb2a18b : 0x717e82);
    add(side * 37, lane * 24, 10, 10, 5.8, 'home', side * lane > 0 ? 0x99998e : 0xa79483);
    // Traditional pitched roofs contrast with the flat apartment roofs.
    for (const half of [-1, 1]) boxes.push({ x: side * 37 + half * 2.5, y: 6.45, z: lane * 24,
      w: 5, h: 1.3, d: 10, kind: 'platform', detail: 'roof', color: 0x434e54,
      ramp: { axis: 'x', direction: half === -1 ? 1 : -1 } });
    // Rooftop ledges have real collision, including for Lino's tether.
    add(side * 24, lane * 16.3, 12, .35, .8, 'plain', 0x585f5f, 7.2);
  }
  // Street parking and service kiosks are full-height cover, not floating crates.
  add(side * 14, side * 2.6, 4.4, 2.15, 2.2, 'van', 0xa5b1a7);
  add(side * 8.2, -side * 6.7, 1.5, 2.4, 2.35, 'kiosk', 0x444e57);
  add(side * 6.9, side * 4.3, 2.6, 1.5, 1.05, 'planter', 0x939083);
  add(side * 27.4, -side * 3.7, 2.7, 1.3, 1.05, 'planter', 0x939083);

  // Two public terraces at 3.6m: two continuous ramps per terrace, no hero ability required.
  add(0, side * 15, 12, 7, 3.6, 'terrace', 0x8e8f85);
  for (const approach of [-1, 1]) {
    boxes.push({ x: approach * 11, y: 1.8, z: side * 15, w: 10, h: 3.6, d: 3.2,
      kind: 'platform', detail: 'ramp', color: 0xa7a18e, ramp: { axis: 'x', direction: approach === -1 ? 1 : -1 } });
    add(approach * 4.35, side * 11.7, 3.1, .4, 1, 'plain', 0x535e60, 3.6);
  }
  add(0, side * 18.3, 12, .4, 1, 'plain', 0x535e60, 3.6);
  add(side * 12, side * 25.1, .18, .18, 4.6, 'light', 0x424c4e);
  // Lower park route stays open around both ends of the terrace.
  for (const x of [-23, -11, 11, 23]) {
    add(x, side * 27.7, 3.6, 2.2, .85, 'planter', 0x797f72);
    add(x, side * 27.7, .48, .48, 4, 'tree', 0x534b45, .85);
  }
  for (const x of [-8, 8]) add(x, side * 23.5, 2.4, .8, .65, 'bench', 0x615347);
  // Small traditional shrine and a modern community pavilion share a footprint.
  add(0, side * 30, 5, 4, 3.5, side < 0 ? 'shrine' : 'pavilion', 0x635953);
}

for (const side of [-1, 1]) for (const half of [-1, 1]) boxes.push({ x: half * 1.25, y: 4.05, z: side * 30,
  w: 2.5, h: 1.1, d: 4, kind: 'platform', detail: 'roof', color: side < 0 ? 0x43454c : 0x5b6868,
  ramp: { axis: 'x', direction: half === -1 ? 1 : -1 } });

export const SHOTO: MapDef = {
  // Retained for existing map selections; the old Kyoto arena is fully replaced.
  id: 'kyoto', theme: 'residential', name: 'DISTRITO SHŌTŌ',
  environment: 'Bairro residencial de Shibuya. Dispute a praça entre parques, casas e terraços elevados.',
  size: { w: 92, d: 68 }, wallHeight: 3.2,
  groundColor: 0x555e61, skyColor: 0x555b72, fogColor: 0x697381,
  fogNear: 65, fogFar: 180, ambient: 1.7, accent: 0xffd58a,
  boxes, torii: [], lanterns: [],
  spawns: [-1, 1].map(side => [0, -2, 2, -4, 4].map(z => ({ x: side * 40, z: side * z }))),
  objective: { x: 0, z: 0, radius: 6.25, name: 'PRAÇA SHŌTŌ' },
};
