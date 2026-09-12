export interface BoxDef {
  x: number; y: number; z: number;  // center
  w: number; h: number; d: number;  // size
  kind: "wall" | "crate" | "platform" | "tower" | "pillar" | "step";
  detail?: 'home' | 'gateway' | 'van' | 'kiosk' | 'planter' | 'terrace' | 'ramp' | 'tree' | 'bench' | 'shrine' | 'pavilion' | 'roof' | 'light' | 'plain';
  ramp?: { axis: 'x' | 'z'; direction: 1 | -1 };
  color?: number;
  emissive?: number;
  emissiveIntensity?: number;
}

export interface MapDef {
  id: string;
  theme?: 'residential';
  name: string;
  environment: string;
  size: { w: number; d: number };
  wallHeight: number;
  groundColor: number;
  skyColor: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  ambient: number;
  accent: number;
  boxes: BoxDef[];
  torii: { x: number; z: number; rot?: number }[];
  lanterns: { x: number; z: number; y?: number; color?: number }[];
  spawns: { x: number; z: number }[][];
  objective: { x: number; z: number; radius: number; name: string };
}
