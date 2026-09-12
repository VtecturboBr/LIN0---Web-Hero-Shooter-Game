/** Tiny WebAudio synth for all prototype SFX. No external assets needed. */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq = 1200, delay = 0) {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
  }

  shoot(kind: string) {
    this.ensure();
    switch (kind) {
      case "hitscan": this.tone(880, 0.09, "sawtooth", 0.12, 240); this.noise(0.05, 0.08, 3000); break;
      case "rifle": this.tone(920, 0.07, "square", 0.08, 300); break;
      case "projectile": this.tone(520, 0.14, "sine", 0.14, 220); break;
      case "bow": this.tone(300, 0.1, "triangle", 0.12, 150); break;
      case "melee": this.tone(180, 0.08, "square", 0.14, 60); this.noise(0.06, 0.1, 800); break;
      case "kunai": this.tone(700, 0.06, "triangle", 0.1, 500); break;
    }
  }

  alt() { this.tone(560, 0.12, "sine", 0.1, 300); this.noise(0.08, 0.06, 2000); }
  reload() { this.tone(300, 0.05, "square", 0.06, 400); setTimeout(() => this.tone(400, 0.05, "square", 0.06, 500), 180); }
  dry() { this.tone(200, 0.04, "square", 0.05, 120); }

  hit(crit: boolean) {
    if (crit) { this.tone(1200, 0.06, "triangle", 0.16, 900); this.tone(1800, 0.05, "sine", 0.08, 1400, 0.02); }
    else this.tone(800, 0.05, "triangle", 0.1, 600);
  }
  kill() { this.tone(660, 0.12, "triangle", 0.16, 990); this.tone(990, 0.18, "triangle", 0.14, 1320, 0.08); }
  death() { this.tone(300, 0.25, "sawtooth", 0.14, 60); this.noise(0.2, 0.1, 500); }
  hurt() { this.tone(160, 0.12, "sawtooth", 0.12, 80); }

  ability(kind: string) {
    switch (kind) {
      case "dash": this.tone(200, 0.18, "sawtooth", 0.1, 800); this.noise(0.1, 0.06, 1500); break;
      case "projectile": this.tone(440, 0.2, "sawtooth", 0.12, 880); break;
      case "aoe": case "slam": this.tone(120, 0.3, "square", 0.16, 40); this.noise(0.25, 0.12, 300); break;
      case "beam": this.tone(1400, 0.15, "sawtooth", 0.12, 200); this.noise(0.12, 0.06, 4000); break;
      case "buff": this.tone(400, 0.2, "sine", 0.12, 800); break;
      case "shield": this.tone(600, 0.12, "sine", 0.12, 900); this.tone(900, 0.1, "sine", 0.08, 1200, 0.05); break;
      case "smoke": this.noise(0.5, 0.1, 400); break;
      case "clone": this.tone(500, 0.15, "sine", 0.1, 1000); this.noise(0.08, 0.05, 3000); break;
      case "teleport": this.tone(800, 0.14, "sine", 0.12, 400); this.noise(0.1, 0.05, 2000); break;
      case "summon": this.tone(700, 0.2, "sine", 0.12, 1400); this.tone(1050, 0.16, "sine", 0.08, 1600, 0.06); break;
      default: this.tone(500, 0.15, "sine", 0.1, 700);
    }
  }

  ult() {
    this.tone(200, 0.5, "sawtooth", 0.18, 900);
    this.tone(150, 0.5, "square", 0.14, 600, 0.1);
    this.noise(0.4, 0.1, 2500);
  }
  ultReady() { this.tone(880, 0.12, "sine", 0.12, 1320); this.tone(1320, 0.14, "sine", 0.1, 1760, 0.1); }

  capture() { this.tone(523, 0.12, "triangle", 0.14); this.tone(659, 0.12, "triangle", 0.14, undefined, 0.1); this.tone(784, 0.2, "triangle", 0.14, undefined, 0.2); }
  tick() { this.tone(440, 0.06, "sine", 0.06, 660); }

  buy() { this.tone(880, 0.08, "square", 0.1, 1200); this.tone(1320, 0.12, "square", 0.08, 1600, 0.06); }
  deny() { this.tone(200, 0.12, "square", 0.1, 120); }
  sell() { this.tone(900, 0.1, "sine", 0.1, 600); }

  respawn() { this.tone(330, 0.15, "sine", 0.12, 440); this.tone(440, 0.2, "sine", 0.1, 660, 0.12); }
  ui() { this.tone(600, 0.05, "triangle", 0.08, 800); }
  announce() { this.tone(392, 0.2, "triangle", 0.12, 392); this.tone(523, 0.3, "triangle", 0.1, 523, 0.18); }
  victory() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, "triangle", 0.14, undefined, i * 0.15)); }
  defeat() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3, "triangle", 0.12, undefined, i * 0.18)); }
}

export const audio = new AudioEngine();