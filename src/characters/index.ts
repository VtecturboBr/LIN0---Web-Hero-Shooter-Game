import type { HeroDef } from '../core/types';
import { lino } from './lino/definition';
import { yume } from './yume/definition';
import { raijin } from './raijin/definition';
import { kitsune } from './kitsune/definition';
import { shin } from './shin/definition';
import { kenji } from './kenji/definition';

/** Ordem de exibição da galeria e seleção de personagens. */
export class HeroRegistry {
  readonly all: HeroDef[];
  readonly byId: Record<string, HeroDef>;
  constructor(definitions: HeroDef[]) {
    this.all = [...definitions]; this.byId = {};
    for (const hero of definitions) {
      if (!hero.id || this.byId[hero.id]) throw new Error(`Duplicate hero: ${hero.id}`);
      this.byId[hero.id] = hero;
    }
  }
  get(id: string): HeroDef {
    const hero = this.byId[id];
    if (!hero) throw new Error(`Unknown hero: ${id}`);
    return hero;
  }
}
export const heroRegistry = new HeroRegistry([lino, yume, raijin, kitsune, shin, kenji]);
export const HEROES = heroRegistry.all;
export const HERO_MAP = heroRegistry.byId;
