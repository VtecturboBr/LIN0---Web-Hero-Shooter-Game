import type { HeroDef } from '../../core/types';

export const AI_PROFILES = {
  aggressive: { distance: 8, retreat: .2, woundedPriority: .5, objectivePriority: 0, ultTargets: 1 },
  flanker: { distance: 12, retreat: .3, woundedPriority: .8, objectivePriority: 0, ultTargets: 1 },
  support: { distance: 20, retreat: .45, woundedPriority: .2, objectivePriority: .3, ultTargets: 2 },
  sniper: { distance: 30, retreat: .4, woundedPriority: .6, objectivePriority: 0, ultTargets: 1 },
  tank: { distance: 8, retreat: .2, woundedPriority: .1, objectivePriority: .7, ultTargets: 2 },
  objective: { distance: 16, retreat: .28, woundedPriority: .2, objectivePriority: 1, ultTargets: 2 },
};
export type AIProfileName = keyof typeof AI_PROFILES;
export function profileFor(hero: HeroDef): AIProfileName {
  return hero.ai ?? (hero.role === 'Support' ? 'support' : hero.role === 'Tank' ? 'tank' : hero.role === 'Controller' ? 'objective' : 'aggressive');
}
