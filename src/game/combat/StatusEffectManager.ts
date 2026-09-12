import type { Player } from '../actors/Player';
import type { StatKey } from '../../core/types';
import { gameNow } from '../../core/time';

export type StatusKind = 'slow' | 'poison' | 'burn' | 'hot' | 'speed' | 'vulnerability' | 'invulnerability' | 'lifesteal' | 'buff';
export interface StatusEffect {
  id: string;
  source: Player;
  duration: number;
  kind: StatusKind;
  stat?: StatKey;
  value: number;
  stacking?: 'stack' | 'refresh' | 'replace' | 'strongest';
  interval?: number;
  spirit?: boolean;
  onTick?: (target: Player, seconds: number) => void;
  onExpire?: (target: Player) => void;
}
export interface ActiveStatus extends StatusEffect { remaining: number; elapsed: number; expiresAt: number }

/** Durations and ticks use simulation delta, including the final partial tick. */
export class StatusEffectManager {
  readonly active: ActiveStatus[] = [];
  constructor(private target: Player) {}
  add(effect: StatusEffect): boolean {
    if (!effect.id || !Number.isFinite(effect.duration) || effect.duration <= 0 || !Number.isFinite(effect.value) ||
        (effect.interval !== undefined && (!Number.isFinite(effect.interval) || effect.interval <= 0))) return false;
    for (const e of [...this.active]) if (e.expiresAt <= gameNow()) this.expire(e);
    const previous = this.active.find(e => e.id === effect.id && e.source === effect.source);
    const policy = effect.stacking ?? 'refresh';
    if (previous && policy !== 'stack') {
      const value = policy === 'strongest' ? Math.max(previous.value, effect.value) : effect.value;
      const remaining = policy === 'strongest' ? Math.max(Math.min(previous.remaining, previous.expiresAt - gameNow()), effect.duration) : effect.duration;
      Object.assign(previous, effect, { value, remaining, expiresAt: gameNow() + remaining, elapsed: policy === 'replace' ? 0 : previous.elapsed });
    } else this.active.push({ ...effect, remaining: effect.duration, elapsed: 0, expiresAt: gameNow() + effect.duration });
    return true;
  }
  value(kind: StatusKind): number {
    let sum = 0, strongest = 0;
    for (const effect of this.active) {
      if (effect.kind !== kind || effect.expiresAt <= gameNow()) continue;
      if (kind === 'slow' && effect.stacking !== 'stack') strongest = Math.max(strongest, effect.value);
      else sum += effect.value;
    }
    return sum + strongest;
  }
  modifier(stat: StatKey): number {
    return this.active.reduce((sum, e) => sum + (e.expiresAt > gameNow() && (e.stat === stat || (e.kind === 'speed' && stat === 'moveSpeed') ||
      (e.kind === 'lifesteal' && stat === 'lifesteal')) ? e.value : 0), 0);
  }
  remove(id: string) {
    for (const e of [...this.active]) if (e.id === id) this.expire(e);
  }
  cancel(effect: ActiveStatus) { this.expire(effect); }
  private expire(effect: ActiveStatus) {
    const index = this.active.indexOf(effect);
    if (index < 0) return;
    this.active.splice(index, 1); effect.onExpire?.(this.target);
  }
  update(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (const effect of [...this.active]) {
      if (!this.active.includes(effect) || !this.target.alive) continue;
      const step = Math.min(dt, effect.remaining);
      effect.remaining = Math.max(0, effect.remaining - step); effect.elapsed += step;
      const interval = effect.interval ?? 0;
      const tick = (seconds: number) => {
        if (effect.kind === 'hot') this.target.applyHeal(effect.source, effect.value * seconds, { spirit: effect.spirit });
        if (effect.kind === 'poison' || effect.kind === 'burn') this.target.applyDamage(effect.source, effect.value * seconds, { ability: true, status: effect.id });
        effect.onTick?.(this.target, seconds);
      };
      if (!interval) { tick(effect.elapsed); effect.elapsed = 0; }
      else {
        while (effect.elapsed + 1e-9 >= interval && this.target.alive && this.active.includes(effect)) {
          effect.elapsed = Math.max(0, effect.elapsed - interval); tick(interval);
        }
        if (effect.remaining === 0 && effect.elapsed > 0 && this.target.alive && this.active.includes(effect)) tick(effect.elapsed);
      }
      if (effect.remaining === 0) this.expire(effect);
    }
  }
  clear() { for (const effect of [...this.active]) this.expire(effect); }
}
