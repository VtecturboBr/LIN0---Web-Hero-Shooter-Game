export type AbilityState = 'READY' | 'CASTING' | 'ACTIVE' | 'COOLDOWN';
export interface RuntimeConfig {
  castTime?: number;
  duration?: number;
  channel?: boolean;
  tickInterval?: number;
  interruptible?: boolean;
  persistent?: boolean;
}

/** One runtime per ability slot. Existing cooldown arrays remain the public clock. */
export class AbilityRuntime {
  state: AbilityState = 'READY';
  remaining = 0;
  private elapsed = 0;
  private config: RuntimeConfig = {};
  private callbacks: { activate: () => void; tick?: (dt: number) => void; end?: (interrupted: boolean) => void } | null = null;
  start(config: RuntimeConfig, callbacks: NonNullable<AbilityRuntime['callbacks']>): boolean {
    if (this.state === 'CASTING' || this.state === 'ACTIVE') return false;
    if ([config.castTime, config.duration, config.tickInterval].some(value => value !== undefined && (!Number.isFinite(value) || value < 0))) return false;
    this.config = config; this.callbacks = callbacks; this.elapsed = 0;
    this.state = 'CASTING'; this.remaining = Math.max(0, config.castTime ?? 0);
    if (this.remaining === 0) this.activate();
    return true;
  }
  private activate() {
    this.state = 'ACTIVE'; this.remaining = this.config.persistent ? Infinity : Math.max(0, this.config.duration ?? 0);
    this.callbacks?.activate();
    if (this.state === 'ACTIVE' && this.remaining === 0) this.finish(false);
  }
  private finish(interrupted: boolean) {
    const callbacks = this.callbacks; this.callbacks = null;
    this.state = 'COOLDOWN'; this.remaining = 0; callbacks?.end?.(interrupted);
  }
  interrupt(force = false): boolean {
    if ((this.state !== 'CASTING' && this.state !== 'ACTIVE') || (!force && this.config.interruptible === false)) return false;
    this.finish(true); return true;
  }
  update(dt: number, cooldown: number) {
    if (!Number.isFinite(dt) || dt < 0) return;
    if (this.state === 'CASTING') {
      const step = Math.min(dt, this.remaining); this.remaining -= step; dt -= step;
      if (this.remaining <= 0) this.activate();
    }
    if (this.state === 'ACTIVE') {
      const step = Math.min(dt, this.remaining); this.remaining = Math.max(0, this.remaining - step); this.elapsed += step;
      const interval = this.config.tickInterval ?? 0;
      if (interval > 0) {
        while (this.elapsed + 1e-9 >= interval && this.state === 'ACTIVE') { this.elapsed = Math.max(0, this.elapsed - interval); this.callbacks?.tick?.(interval); }
      } else { this.callbacks?.tick?.(step); this.elapsed = 0; }
      if (this.state === 'ACTIVE' && this.remaining === 0) {
        if (this.elapsed > 0) this.callbacks?.tick?.(this.elapsed);
        this.finish(false);
      }
    }
    if (this.state === 'COOLDOWN' && cooldown <= 0) this.state = 'READY';
  }
  get blocksActions() { return this.state === 'CASTING' || (this.state === 'ACTIVE' && !!this.config.channel); }
  reset() { this.interrupt(true); this.state = 'READY'; this.remaining = this.elapsed = 0; }
}
