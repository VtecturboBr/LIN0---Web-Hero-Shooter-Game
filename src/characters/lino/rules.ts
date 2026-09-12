/** Canonical Lino construction data, shared by definitions, gameplay and HUD. */
export const MATTER_SHAPES: { name: string; cost: number; hp: number; ramp?: boolean; windup?: number; parts: [number, number, number, number, number][] }[] = [
  { name: 'Parede', cost: 25, hp: 240, parts: [[0, 0, 5, 3, .5]] },
  { name: 'Rampa', cost: 25, hp: 240, ramp: true, parts: [[0, 0, 2.6, 3.6, 5]] },
  { name: 'Prisão', cost: 40, hp: 180, windup: 1, parts: [[0, -2.5, 5.5, 3, .45], [0, 2.5, 5.5, 3, .45], [-2.5, 0, .45, 3, 4.6], [2.5, 0, .45, 3, 4.6]] },
  { name: 'Pilar', cost: 20, hp: 240, parts: [[0, 0, 1.8, 5, 1.8]] },
  { name: 'Cobertura', cost: 20, hp: 240, parts: [[0, 0, 3.5, 1.25, .6]] },
  { name: 'Barreira', cost: 30, hp: 240, parts: [[0, 0, 8, 2.5, .45]] },
];
export const MATTER_RULES = {
  control: 100, regeneration: 12, tetherCost: 30, basicShapes: 3,
  limit: 3, fieldLimit: 8, lifetime: 30, fieldCooldown: .6, fieldCostMultiplier: .5,
  windup: .35, fieldWindup: .15, collapseDelay: 1.5,
  tether: { maxLength: 34, detachDistance: 1.5, minLength: 2, reelSpeed: 16, pull: 56, tension: 22, maxSpeed: 32, momentum: 2 },
};
export const MATTER_COSTS = MATTER_SHAPES.map(shape => shape.cost);
export const TETHER_COST = MATTER_RULES.tetherCost;

/** Field constructions reserve half the normal Control cost. */
export function matterCost(shape: number, inField: boolean): number {
  return (MATTER_COSTS[shape] ?? Infinity) * (inField ? MATTER_RULES.fieldCostMultiplier : 1);
}
