import type { MapDef } from '../types';

export const TRAINING: MapDef = {
    id: "training", name: "DOJO DE TREINAMENTO", environment: "Teste armas, habilidades e o Fio do Abismo entre prédios de 8 a 18 metros.",
    size: { w: 48, d: 60 }, wallHeight: 5, groundColor: 0x15202a, skyColor: 0x101a29,
    fogColor: 0x101a29, fogNear: 45, fogFar: 110, ambient: 0.85, accent: 0x7ee0b0,
    boxes: [
      { x: -15, y: 0.6, z: 3, w: 5, h: 1.2, d: 3, kind: "platform" },
      { x: -15, y: 1.4, z: -3, w: 5, h: 2.8, d: 3, kind: "platform" },
      { x: 14, y: 1.5, z: -7, w: 5, h: 3, d: 1, kind: "wall" },
      // Rooftop circuit: staggered heights, with reachable gaps for the 28m tether.
      { x: -17, y: 4, z: 16, w: 8, h: 8, d: 7, kind: "tower", color: 0x202c3e },
      { x: 17, y: 5, z: 16, w: 8, h: 10, d: 7, kind: "tower", color: 0x273044 },
      { x: -17, y: 6, z: -17, w: 8, h: 12, d: 7, kind: "tower", color: 0x283349 },
      { x: 17, y: 7, z: -17, w: 8, h: 14, d: 7, kind: "tower", color: 0x202d40 },
      { x: -10, y: 8, z: -25, w: 6, h: 16, d: 6, kind: "tower", color: 0x263447 },
      { x: 10, y: 9, z: -25, w: 6, h: 18, d: 6, kind: "tower", color: 0x202c3e },
    ],
    torii: [{ x: 0, z: 24 }],
    lanterns: [{ x: -21, z: 12 }, { x: 21, z: 12 }, { x: -21, z: -18 }, { x: 21, z: -18 }],
    spawns: [[{ x: 0, z: 16 }], [{ x: 0, z: 8 }, { x: -5, z: 0 }, { x: 3, z: -10 }, { x: -7, z: -18 }]],
    objective: { x: 0, z: 26, radius: 2, name: "DOJO" },
  };
