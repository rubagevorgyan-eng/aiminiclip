/**
 * Optional sound effects, synthesized with Web Audio (original, no sample files, nothing to license).
 * Subtle one-shots only, never background noise. Nothing plays until the player has interacted with
 * the page (browser autoplay rules) or when Sound is off. Volume and mute persist in device settings.
 */
import { loadSettings, onSettingsChange } from './storage.ts';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
const lastPlayed: Record<string, number> = {};

function audio(): AudioContext | null {
  const s = loadSettings();
  if (!s.sound || s.volume <= 0) return null;
  const nav = navigator as Navigator & { userActivation?: { hasBeenActive: boolean } };
  if (nav.userActivation && !nav.userActivation.hasBeenActive) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  master!.gain.value = 0.55 * s.volume * s.volume;
  return ctx;
}
onSettingsChange(() => {
  const s = loadSettings();
  if (master) master.gain.value = s.sound ? 0.55 * s.volume * s.volume : 0;
});

function env(c: AudioContext, start: number, peak: number, attack: number, release: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(peak, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + attack + release);
  g.connect(master!);
  return g;
}
function tone(c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, peak: number) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  o.connect(env(c, start, peak, 0.005, dur));
  o.start(start);
  o.stop(start + dur + 0.05);
  return o;
}
function hiss(c: AudioContext, start: number, dur: number, filter: BiquadFilterType, freq: number, peak: number, sweepTo?: number) {
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, start);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, start + dur);
  src.connect(f);
  f.connect(env(c, start, peak, 0.004, dur));
  src.start(start);
  src.stop(start + dur + 0.05);
}
/** At most one of each sound per `gap` ms (keeps 100-card moments quiet). */
const throttled = (name: string, gap: number) => {
  const now = performance.now();
  if (now - (lastPlayed[name] ?? 0) < gap) return true;
  lastPlayed[name] = now;
  return false;
};

export const sfx = {
  /** Mechanical type key: a tiny filtered click. */
  type() {
    const c = audio();
    if (!c || throttled('type', 70)) return;
    hiss(c, c.currentTime, 0.018, 'highpass', 2200 + Math.random() * 800, 0.18);
  },
  /** Paper shuffle: a brief swept rustle. */
  paper() {
    const c = audio();
    if (!c || throttled('paper', 150)) return;
    hiss(c, c.currentTime, 0.22, 'bandpass', 700, 0.22, 2600);
  },
  /** Radio click: squelch blip. */
  radio() {
    const c = audio();
    if (!c || throttled('radio', 120)) return;
    tone(c, 1250, c.currentTime, 0.03, 'square', 0.05);
    hiss(c, c.currentTime + 0.01, 0.05, 'bandpass', 1800, 0.12);
  },
  /** Identification stamp: low thump with paper impact. */
  stamp() {
    const c = audio();
    if (!c || throttled('stamp', 200)) return;
    tone(c, 92, c.currentTime, 0.16, 'sine', 0.5);
    hiss(c, c.currentTime, 0.07, 'lowpass', 900, 0.3);
  },
  /** Terminal confirmation: two short rising beeps. */
  beep() {
    const c = audio();
    if (!c || throttled('beep', 150)) return;
    tone(c, 880, c.currentTime, 0.07, 'sine', 0.12);
    tone(c, 1320, c.currentTime + 0.09, 0.09, 'sine', 0.12);
  },
  victory() {
    const c = audio();
    if (!c || throttled('end', 1500)) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, f, c.currentTime + i * 0.14, 0.5, 'triangle', 0.16));
  },
  defeat() {
    const c = audio();
    if (!c || throttled('end', 1500)) return;
    const o = tone(c, 330, c.currentTime, 0.7, 'sine', 0.18);
    o.frequency.exponentialRampToValueAtTime(196, c.currentTime + 0.6);
    hiss(c, c.currentTime, 0.3, 'lowpass', 400, 0.15);
  },
};
export type SoundName = keyof typeof sfx;
