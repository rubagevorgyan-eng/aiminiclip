import { getSettings } from '../storage/settings.ts';

/**
 * Synthesized sound effects (Web Audio, no files). Everything goes through one master gain and a
 * compressor so layers stay balanced. Silent when sound is off, before the first user gesture
 * (no autoplay), or when Web Audio is unavailable.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

/** Seconds from the "correct" moment to the pickaxe strike in the mine renderer (windup + strike). */
const STRIKE = 0.26;

function audio(): AudioContext | null {
  const { sound, volume } = getSettings();
  if (!sound || volume <= 0 || typeof window === 'undefined') return null;
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (ua && !ua.hasBeenActive) return null; // never start audio before the player interacts
  try {
    if (!ctx) {
      ctx = new AudioContext();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(comp).connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    // Player volume on a perceptual curve (squared) times the mix level.
    master!.gain.setTargetAtTime(0.8 * volume * volume, ctx.currentTime, 0.01);
    return ctx;
  } catch {
    return null;
  }
}

if (typeof window !== 'undefined') {
  const unlock = () => ctx?.state === 'suspended' && void ctx.resume();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}

interface ToneOpts { type?: OscillatorType; delay?: number; vol?: number; slide?: number; attack?: number; detune?: number }

function tone(freq: number, dur: number, o: ToneOpts = {}) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + (o.delay ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = o.type ?? 'triangle';
  osc.frequency.setValueAtTime(freq, t);
  if (o.detune) osc.detune.value = o.detune;
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(freq * o.slide, t + dur);
  const peak = o.vol ?? 0.05, atk = o.attack ?? 0.006;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** Filtered white noise burst (rock, impacts). */
function noise(dur: number, o: { delay?: number; vol?: number; freq?: number; q?: number; type?: BiquadFilterType } = {}) {
  const a = audio();
  if (!a || !master) return;
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = a.currentTime + (o.delay ?? 0);
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  const f = a.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.frequency.value = o.freq ?? 1200;
  f.Q.value = o.q ?? 0.8;
  const g = a.createGain();
  g.gain.setValueAtTime(o.vol ?? 0.08, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

// ------------------------------------------------------------------ public sounds

/** Soft UI tap. */
export const playClick = () => tone(880, 0.04, { vol: 0.022 });

/** Wrong answer: short low buzz, two layers. */
export function playWrong() {
  tone(160, 0.13, { type: 'sawtooth', vol: 0.03, slide: 0.75 });
  tone(120, 0.15, { type: 'square', vol: 0.018, delay: 0.04, slide: 0.8 });
}

/** Skip / timeout: a gentle falling pair. */
export function playMiss() {
  tone(392, 0.14, { vol: 0.035 });
  tone(294, 0.22, { vol: 0.035, delay: 0.12 });
}

/** Final-seconds warning, rising in pitch as time runs out (secs = 5..1). */
export function playTick(secs = 5) {
  const f = 900 + (5 - Math.max(1, Math.min(5, secs))) * 140;
  tone(f, 0.05, { type: 'square', vol: secs === 1 ? 0.035 : 0.022 });
}

const PICK = () => {
  // pickaxe impact: low thump + bright transient
  tone(120, 0.12, { type: 'sine', vol: 0.16, slide: 0.45, delay: STRIKE });
  noise(0.04, { delay: STRIKE, vol: 0.1, freq: 3200, q: 0.7 });
};
const ROCK = (tier: number) => noise(0.16 + tier * 0.05, { delay: STRIKE + 0.02, vol: 0.05 + tier * 0.012, freq: 700 + tier * 80, q: 0.6 });

/**
 * Correct answer, scaled by rarity tier (0 coal .. 5 diamond):
 * instant confirm chime, pickaxe impact and rock break at the strike, then a discovery
 * arpeggio that gets longer and higher with rarity. Emerald and diamond add their own signatures.
 */
export function playFind(tier: number) {
  tone(660, 0.07, { vol: 0.035 });
  tone(990, 0.09, { vol: 0.03, delay: 0.05 });
  PICK();
  ROCK(tier);
  const scale = [523, 659, 784, 988, 1175, 1319, 1568, 1976];
  const n = 2 + tier;
  const start = STRIKE + 0.08;
  for (let i = 0; i < n; i++) tone(scale[i], 0.14, { type: i % 2 ? 'triangle' : 'square', vol: 0.028, delay: start + i * 0.055 });
  const after = start + n * 0.055;
  if (tier === 4) legendary(after);
  if (tier === 5) mythic(after);
}

/** Emerald: warm shimmering bell chord. */
function legendary(at: number) {
  for (const [i, f] of [659, 831, 988, 1319].entries()) {
    tone(f, 1.1, { delay: at + i * 0.03, vol: 0.03, attack: 0.02 });
    tone(f, 1.1, { delay: at + i * 0.03, vol: 0.015, attack: 0.02, detune: 7 });
  }
}

/** Diamond: rising glissando, scattered sparkle pings, bright chord. */
function mythic(at: number) {
  tone(600, 0.45, { type: 'sine', vol: 0.03, slide: 4, delay: at, attack: 0.05 });
  const pent = [1568, 1760, 2093, 2349, 2637, 3136];
  for (let i = 0; i < 7; i++) tone(pent[(i * 3) % pent.length], 0.12, { type: 'sine', vol: 0.02, delay: at + 0.2 + i * 0.07 });
  for (const [i, f] of [784, 988, 1175, 1568, 2093].entries()) tone(f, 1.4, { delay: at + 0.35 + i * 0.02, vol: 0.026, attack: 0.03 });
}

/** Game over fanfare; grows with the zone reached (0..5). */
export function playComplete(zone: number) {
  const notes = [392, 523, 659, 784, 988, 1175];
  const n = 3 + Math.min(3, Math.floor(zone / 2));
  for (let i = 0; i < n; i++) tone(notes[i], 0.16, { type: 'square', vol: 0.03, delay: i * 0.1 });
  const end = n * 0.1;
  for (const f of [notes[n - 1], notes[n - 1] * 1.25, notes[n - 1] * 1.5]) tone(f, 0.9, { vol: 0.025, delay: end, attack: 0.02 });
  if (zone >= 4) noise(0.6, { delay: end, vol: 0.02, freq: 6000, q: 0.5, type: 'highpass' });
}
