/**
 * Sons 100 % originaux, synthétisés en temps réel avec la Web Audio API
 * (bruit filtré + oscillateurs) : aucun fichier à charger, aucun droit d'auteur.
 * Volume global piloté par les paramètres ; atténuation selon la distance
 * pour les sons positionnés (tirs adverses, constructions…).
 */
import { settings } from './Settings';

export type SoundId =
  | 'ar' | 'shotgun' | 'pistol' | 'sniper' | 'pickaxe' | 'empty'
  | 'reload' | 'build' | 'destroy' | 'structureHit' | 'jump' | 'land'
  | 'elim' | 'hit' | 'headshot' | 'hurt' | 'ui' | 'edit' | 'victory' | 'defeat';

interface Pos {
  x: number;
  y: number;
  z: number;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private listener: Pos = { x: 0, y: 0, z: 0 };
  private lastPlayed = new Map<SoundId, number>();

  constructor() {
    settings.subscribe((s) => this.master && (this.master.gain.value = s.volume));
    // Les navigateurs exigent un geste utilisateur avant de démarrer l'audio.
    const unlock = () => this.ensure();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
  }

  private ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = settings.data.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setListener(p: Pos) {
    this.listener = { x: p.x, y: p.y, z: p.z };
  }

  /** `at` : position monde du son (atténuation avec la distance). */
  play(id: SoundId, at?: Pos, volume = 1) {
    if (!this.ctx || this.ctx.state !== 'running' || settings.data.volume <= 0) return;
    // Anti-saturation : un même son au plus toutes les 25 ms.
    const now = performance.now();
    if (now - (this.lastPlayed.get(id) ?? 0) < 25) return;
    this.lastPlayed.set(id, now);

    let gain = volume;
    if (at) {
      const d = Math.hypot(at.x - this.listener.x, at.y - this.listener.y, at.z - this.listener.z);
      gain *= 1 / (1 + d / 12);
      if (gain < 0.02) return;
    }
    const out = this.ctx.createGain();
    out.gain.value = gain;
    out.connect(this.master!);
    SYNTHS[id](this, out, this.ctx.currentTime);
    // Les nœuds se déconnectent d'eux-mêmes à la fin des sources ; on libère le gain après coup.
    setTimeout(() => out.disconnect(), 2500);
  }

  // ---- Briques de synthèse ----

  /** Rafale de bruit filtré avec enveloppe exponentielle. */
  burst(out: AudioNode, t: number, o: { dur: number; vol: number; type: BiquadFilterType; freq: number; endFreq?: number; q?: number; attack?: number }) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = o.type;
    filter.Q.value = o.q ?? 0.8;
    filter.frequency.setValueAtTime(o.freq, t);
    if (o.endFreq) filter.frequency.exponentialRampToValueAtTime(o.endFreq, t + o.dur);
    const g = ctx.createGain();
    const a = o.attack ?? 0.002;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(filter).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + o.dur + 0.05);
  }

  /** Oscillateur avec glissement de fréquence. */
  tone(out: AudioNode, t: number, o: { dur: number; vol: number; type: OscillatorType; freq: number; endFreq?: number; delay?: number }) {
    const ctx = this.ctx!;
    const start = t + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.freq, start);
    if (o.endFreq) osc.frequency.exponentialRampToValueAtTime(o.endFreq, start + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(o.vol, start + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, start + o.dur);
    osc.connect(g).connect(out);
    osc.start(start);
    osc.stop(start + o.dur + 0.05);
  }
}

type Synth = (a: AudioEngine, out: AudioNode, t: number) => void;

const SYNTHS: Record<SoundId, Synth> = {
  ar: (a, o, t) => {
    a.burst(o, t, { dur: 0.12, vol: 0.55, type: 'lowpass', freq: 3500, endFreq: 600 });
    a.tone(o, t, { dur: 0.08, vol: 0.35, type: 'square', freq: 160, endFreq: 50 });
  },
  shotgun: (a, o, t) => {
    a.burst(o, t, { dur: 0.35, vol: 0.8, type: 'lowpass', freq: 2200, endFreq: 200 });
    a.tone(o, t, { dur: 0.22, vol: 0.5, type: 'sine', freq: 110, endFreq: 35 });
    a.burst(o, t + 0.38, { dur: 0.05, vol: 0.2, type: 'bandpass', freq: 1800, q: 3 });
    a.burst(o, t + 0.5, { dur: 0.05, vol: 0.2, type: 'bandpass', freq: 1300, q: 3 });
  },
  pistol: (a, o, t) => {
    a.burst(o, t, { dur: 0.09, vol: 0.45, type: 'highpass', freq: 1200 });
    a.tone(o, t, { dur: 0.06, vol: 0.3, type: 'triangle', freq: 420, endFreq: 90 });
  },
  sniper: (a, o, t) => {
    a.burst(o, t, { dur: 0.6, vol: 0.9, type: 'lowpass', freq: 4000, endFreq: 150 });
    a.tone(o, t, { dur: 0.4, vol: 0.5, type: 'sine', freq: 90, endFreq: 30 });
  },
  pickaxe: (a, o, t) => a.burst(o, t, { dur: 0.22, vol: 0.25, type: 'bandpass', freq: 400, endFreq: 2400, q: 2, attack: 0.08 }),
  empty: (a, o, t) => a.tone(o, t, { dur: 0.04, vol: 0.2, type: 'square', freq: 1500 }),
  reload: (a, o, t) => {
    a.burst(o, t, { dur: 0.05, vol: 0.3, type: 'bandpass', freq: 2500, q: 4 });
    a.tone(o, t + 0.25, { dur: 0.05, vol: 0.15, type: 'square', freq: 900, endFreq: 600 });
    a.burst(o, t + 0.45, { dur: 0.06, vol: 0.35, type: 'bandpass', freq: 1700, q: 4 });
  },
  build: (a, o, t) => {
    a.tone(o, t, { dur: 0.12, vol: 0.45, type: 'sine', freq: 220, endFreq: 120 });
    a.burst(o, t, { dur: 0.08, vol: 0.3, type: 'bandpass', freq: 900, q: 2 });
  },
  destroy: (a, o, t) => {
    a.burst(o, t, { dur: 0.45, vol: 0.6, type: 'lowpass', freq: 1800, endFreq: 150 });
    a.tone(o, t, { dur: 0.3, vol: 0.4, type: 'sine', freq: 140, endFreq: 40 });
    for (let i = 0; i < 4; i++) a.burst(o, t + 0.05 + i * 0.06, { dur: 0.05, vol: 0.2, type: 'bandpass', freq: 600 + i * 300, q: 3 });
  },
  structureHit: (a, o, t) => a.tone(o, t, { dur: 0.08, vol: 0.3, type: 'triangle', freq: 260, endFreq: 140 }),
  jump: (a, o, t) => a.burst(o, t, { dur: 0.15, vol: 0.12, type: 'bandpass', freq: 500, endFreq: 1200, q: 1.5, attack: 0.03 }),
  land: (a, o, t) => {
    a.burst(o, t, { dur: 0.12, vol: 0.3, type: 'lowpass', freq: 600, endFreq: 120 });
    a.tone(o, t, { dur: 0.1, vol: 0.25, type: 'sine', freq: 90, endFreq: 50 });
  },
  elim: (a, o, t) => {
    [523, 659, 784, 1047].forEach((f, i) => a.tone(o, t, { dur: 0.18, vol: 0.25, type: 'triangle', freq: f, delay: i * 0.07 }));
  },
  hit: (a, o, t) => a.tone(o, t, { dur: 0.05, vol: 0.25, type: 'square', freq: 1800, endFreq: 1200 }),
  headshot: (a, o, t) => {
    a.tone(o, t, { dur: 0.25, vol: 0.3, type: 'sine', freq: 2200 });
    a.tone(o, t, { dur: 0.25, vol: 0.15, type: 'sine', freq: 3300 });
  },
  hurt: (a, o, t) => {
    a.tone(o, t, { dur: 0.15, vol: 0.35, type: 'sawtooth', freq: 180, endFreq: 80 });
    a.burst(o, t, { dur: 0.1, vol: 0.2, type: 'lowpass', freq: 800 });
  },
  ui: (a, o, t) => a.tone(o, t, { dur: 0.06, vol: 0.2, type: 'triangle', freq: 880, endFreq: 1320 }),
  edit: (a, o, t) => a.tone(o, t, { dur: 0.05, vol: 0.18, type: 'sine', freq: 1200, endFreq: 900 }),
  victory: (a, o, t) => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => a.tone(o, t, { dur: 0.35, vol: 0.25, type: 'triangle', freq: f, delay: i * 0.12 }));
  },
  defeat: (a, o, t) => {
    [392, 330, 262, 196].forEach((f, i) => a.tone(o, t, { dur: 0.4, vol: 0.25, type: 'triangle', freq: f, delay: i * 0.18 }));
  },
};

export const audio = new AudioEngine();
