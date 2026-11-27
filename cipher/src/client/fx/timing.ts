/**
 * Decode animation timing (pure, unit-tested). A plan types characters left to right; each character
 * appears as scrambling glyphs and resolves `lead` ms after it was typed, one every `charMs`:
 *
 *   typed(i)    = delay + i × charMs
 *   resolved(i) = delay + lead + i × charMs
 *
 * Deliberately slow: 80–110 ms per character, ~0.8–1.2 s for a typical word. Long text adapts
 * (`maxTotal`) instead of becoming instant; large boards run in staggered parallel batches.
 */
export const FX = {
  charMs: 95,
  minCharMs: 80,
  maxCharMs: 110,
  /** Fastest per-character rate allowed when adapting long text to a time budget. */
  adaptiveFloorMs: 45,
  lead: 420,
  glyphMs: 55,
  glyphs: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*+=/<>?{}[]',
} as const;

export interface DecodePlan { length: number; delay: number; lead: number; charMs: number; total: number }

export function planDecode(length: number, opts: { delay?: number; lead?: number; charMs?: number; maxTotal?: number } = {}): DecodePlan {
  const delay = opts.delay ?? 0;
  const lead = opts.lead ?? FX.lead;
  let charMs = Math.min(FX.maxCharMs, Math.max(FX.minCharMs, opts.charMs ?? FX.charMs));
  if (opts.maxTotal && length > 1 && lead + (length - 1) * charMs > opts.maxTotal) {
    charMs = Math.max(FX.adaptiveFloorMs, (opts.maxTotal - lead) / (length - 1));
  }
  return { length, delay, lead, charMs, total: delay + lead + Math.max(0, length - 1) * charMs };
}

/** Moments used across the game (all within the target ranges). */
export const PLANS = {
  word: (len: number) => planDecode(len),
  clueWord: (len: number) => planDecode(len, { lead: 700, maxTotal: 1650 }),
  clueNumber: (afterWord: DecodePlan) => planDecode(1, { delay: afterWord.total, lead: 300 }),
  /** Label decodes after the scan starts; the whole reveal (scan, label, portrait) stays within ~1.1 s. */
  revealLabel: (len: number) => planDecode(len, { delay: 300, lead: 260, maxTotal: 800 }),
  roomCode: (len: number) => planDecode(len, { lead: 600, charMs: 110 }),
  banner: (len: number, delay = 0) => planDecode(len, { delay, lead: 500, maxTotal: 3000 }),
  logo: (len: number) => planDecode(len, { lead: 800, charMs: 110 }),
};

/** Board initialization: a diagonal wave in parallel batches; every card finishes within ~2.4 s. */
export const BOARD_WAVE_MS = 1100;
export const BOARD_CARD_MAX_MS = 1200;
export function boardDelay(index: number, size: number): number {
  if (size <= 1) return 0;
  const row = Math.floor(index / size);
  const col = index % size;
  return Math.round(((row + col) / (2 * (size - 1))) * BOARD_WAVE_MS);
}
export const boardPlan = (index: number, size: number, len: number) => planDecode(len, { delay: boardDelay(index, size), lead: 360, maxTotal: BOARD_CARD_MAX_MS });

/** Small deterministic hash for glyph choice. */
const hash = (a: number, b: number, c: number) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

export interface Frame { text: string; cursor: number | null; done: boolean }

/**
 * The text to show `t` ms into a plan. Spaces stay spaces. Before a character is typed it shows the
 * `from` text (rematch transitions) or nothing; while scrambling it cycles glyphs every `glyphMs`.
 * Restrained interference: a resolved character very rarely flickers for one glyph step.
 */
export function frameAt(target: string, plan: DecodePlan, t: number, seed = 0, from = ''): Frame {
  if (t >= plan.total) return { text: target, cursor: null, done: true };
  const step = Math.floor(t / FX.glyphMs);
  let out = '';
  let cursor: number | null = null;
  for (let i = 0; i < target.length; i++) {
    const ch = target[i];
    const typed = plan.delay + i * plan.charMs;
    const resolved = typed + plan.lead;
    if (t < typed) {
      out += from[i] ?? ' ';
      if (cursor === null) cursor = i;
    } else if (t < resolved || ch === ' ') {
      out += ch === ' ' ? ' ' : FX.glyphs[hash(seed, i, step) % FX.glyphs.length];
    } else {
      const flicker = hash(seed + 7, i, step) % 100 === 0;
      out += flicker ? FX.glyphs[hash(seed, i, step + 1) % FX.glyphs.length] : ch;
    }
  }
  return { text: out, cursor: cursor ?? target.length, done: false };
}
