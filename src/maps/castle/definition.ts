import type { MapDef } from '../types';

export const CASTLE: MapDef = {
    id: "castle",
    name: "CASTELO DO SHOGUN",
    environment: "Pátio fortificado do castelo do Shogun com tecnologia futurista.",
    size: { w: 64, d: 44 },
    wallHeight: 6,
    groundColor: 0x171310,
    skyColor: 0x100b08,
    fogColor: 0x120d0a,
    fogNear: 28,
    fogFar: 120,
    ambient: 0.5,
    accent: 0xffcf3f,
    boxes: [
      // central castle keep (block with the courtyard objective in front)
      { x: 6, y: 4, z: 0, w: 16, h: 8, d: 14, kind: "wall", color: 0x2a2018, emissive: 0xffcf3f, emissiveIntensity: 0.18 },
      // objective platform in the courtyard
      { x: -4, y: 0.55, z: 0, w: 7, h: 1.1, d: 7, kind: "platform", color: 0x2c2418, emissive: 0xffcf3f, emissiveIntensity: 0.4 },
      // courtyard flanking walls
      { x: -14, y: 2.5, z: -12, w: 1.5, h: 5, d: 10, kind: "wall", color: 0x2a2018 },
      { x: -14, y: 2.5, z: 12, w: 1.5, h: 5, d: 10, kind: "wall", color: 0x2a2018 },
      // side lanes cover
      { x: -22, y: 0.6, z: -6, w: 2.8, h: 1.2, d: 2.8, kind: "crate", color: 0x3a2f24 },
      { x: -22, y: 0.6, z: 6, w: 2.8, h: 1.2, d: 2.8, kind: "crate", color: 0x3a2f24 },
      { x: -8, y: 0.6, z: -18, w: 2.6, h: 1.2, d: 2.6, kind: "crate", color: 0x2c2418 },
      { x: -8, y: 0.6, z: 18, w: 2.6, h: 1.2, d: 2.6, kind: "crate", color: 0x2c2418 },
      { x: 14, y: 0.6, z: -10, w: 2.4, h: 1.2, d: 2.4, kind: "crate", color: 0x3a2f24 },
      { x: 14, y: 0.6, z: 10, w: 2.4, h: 1.2, d: 2.4, kind: "crate", color: 0x3a2f24 },
      { x: 20, y: 0.6, z: -4, w: 2.4, h: 1.2, d: 2.4, kind: "crate", color: 0x2c2418 },
      { x: 20, y: 0.6, z: 4, w: 2.4, h: 1.2, d: 2.4, kind: "crate", color: 0x2c2418 },
      // corner guard towers
      { x: -28, y: 5, z: -17, w: 3.5, h: 10, d: 3.5, kind: "tower", color: 0x241c14, emissive: 0xffcf3f, emissiveIntensity: 0.4 },
      { x: 28, y: 5, z: -17, w: 3.5, h: 10, d: 3.5, kind: "tower", color: 0x241c14, emissive: 0xffcf3f, emissiveIntensity: 0.4 },
      { x: -28, y: 5, z: 17, w: 3.5, h: 10, d: 3.5, kind: "tower", color: 0x241c14, emissive: 0xffcf3f, emissiveIntensity: 0.4 },
      { x: 28, y: 5, z: 17, w: 3.5, h: 10, d: 3.5, kind: "tower", color: 0x241c14, emissive: 0xffcf3f, emissiveIntensity: 0.4 },
      // front gate pillars
      { x: -9, y: 2.5, z: 0, w: 1.4, h: 5, d: 1.4, kind: "pillar", color: 0x2a2018, emissive: 0xffcf3f, emissiveIntensity: 0.3 },
      { x: 0, y: 2.5, z: 0, w: 1.4, h: 5, d: 1.4, kind: "pillar", color: 0x2a2018, emissive: 0xffcf3f, emissiveIntensity: 0.3 },
    ],
    torii: [
      { x: -26, z: 0, rot: 1.57 },
      { x: 26, z: 0, rot: 1.57 },
      { x: -18, z: -16, rot: 0.4 },
      { x: -18, z: 16, rot: -0.4 },
    ],
    lanterns: [
      { x: -4, z: -4 }, { x: -4, z: 4 }, { x: -16, z: 0 }, { x: 12, z: -14 },
      { x: 12, z: 14 }, { x: -24, z: -10 }, { x: -24, z: 10 }, { x: 22, z: 0 },
    ],
    spawns: [
      [{ x: -26, z: -6 }, { x: -26, z: 6 }, { x: -24, z: -10 }, { x: -24, z: 10 }, { x: -22, z: 0 }],
      [{ x: 26, z: -6 }, { x: 26, z: 6 }, { x: 24, z: -10 }, { x: 24, z: 10 }, { x: 22, z: 0 }],
    ],
    objective: { x: -4, z: 0, radius: 4, name: "PÁTIO DO CASTELO" },
  };
