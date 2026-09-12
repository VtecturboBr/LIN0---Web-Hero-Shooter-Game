import type { Player, DamageOpts } from '../actors/Player';
import type { AbilityDef } from '../../core/types';
import type { Vector3 } from 'three';
import { SHOP_RULES } from '../../progression/shop/items';

export interface CombatEvents {
  damage: { source: Player; target: Player; amount: number; absorbed: number; opts: DamageOpts; sourceKind: 'weapon' | 'ability' | 'ultimate' | 'status'; killed: boolean };
  heal: { source: Player; target: Player; amount: number; rewards: boolean };
  shield: { source: Player; target: Player; amount: number; duration: number };
  kill: { source: Player | null; target: Player };
  headshot: { source: Player; target: Player; amount: number };
  ability_cast: { source: Player; ability: AbilityDef; ultimate: boolean };
  objective_capture: { team: number };
  projectile_hit: { source: Player; target: Player | null; point: Vector3; sourceKind: string; headshot: boolean };
}

/** Synchronous match-local events. Rules run before presentation subscribers. */
export class CombatEventSystem {
  private listeners = new Map<keyof CombatEvents, Set<(event: never) => void>>();
  presentation = false;
  constructor() {
    this.on('damage', ({ source, target, amount }) => {
      source.stats.damage += amount;
      const earned = amount / SHOP_RULES.koban.dmgPerKoban;
      source.koban += earned; source.stats.kobanEarned += earned;
      if (source.hero.resource.gainDamage) source.addResource(amount / source.hero.resource.gainDamage);
      if (target.hero.resource.gainTaken) target.addResource(amount / target.hero.resource.gainTaken);
      const lifesteal = source.stat('lifesteal');
      if (lifesteal > 0) source.healRaw(amount * lifesteal);
    });
    this.on('heal', ({ source, amount, rewards }) => {
      if (!rewards) return;
      source.stats.healing += amount;
      if (source.hero.resource.gainHeal) source.addResource(amount / source.hero.resource.gainHeal);
      const earned = amount / SHOP_RULES.koban.healPerKoban;
      source.koban += earned; source.stats.kobanEarned += earned;
    });
  }
  on<K extends keyof CombatEvents>(type: K, listener: (event: CombatEvents[K]) => void): () => void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, set = new Set());
    set.add(listener as (event: never) => void);
    return () => { set.delete(listener as (event: never) => void); };
  }
  emit<K extends keyof CombatEvents>(type: K, event: CombatEvents[K]) {
    for (const listener of this.listeners.get(type) ?? []) listener(event as never);
  }
  clear() { this.listeners.clear(); }
}
