import { GAME } from '../config/game.ts';
import { hashString, mulberry32, shuffle } from '../utils/random.ts';
import type { QuestionMeta } from '../engine/types.ts';

/**
 * Bump when the question bank changes in a way that should change daily picks.
 * Everyone on the same version gets the same Daily Dig for a given UTC date.
 */
export const BANK_VERSION = 2;
/** Daily Dig #1 was on this UTC date. */
export const DAILY_EPOCH = '2026-11-01';
const DAY = 86_400_000;

/** UTC calendar date as YYYY-MM-DD. */
export const utcDateKey = (now: number) => new Date(now).toISOString().slice(0, 10);
const dayIndex = (key: string) => Math.floor(Date.parse(`${key}T00:00:00Z`) / DAY);
export const dailyNumber = (key: string) => dayIndex(key) - dayIndex(DAILY_EPOCH) + 1;
export const previousDateKey = (key: string) => utcDateKey(Date.parse(`${key}T00:00:00Z`) - DAY);
export const msUntilNextDaily = (now: number) => DAY - (now % DAY);

/** Category groups used to make every game a mini general-knowledge quiz. */
export const GROUPS = {
  everyday: ['General Knowledge', 'Everyday Objects'],
  world: ['Geography', 'History & Civilizations'],
  nature: ['Animals & Nature', 'Science & Technology'],
  vocab: ['Words & Vocabulary'],
} as const;
const inGroup = (q: QuestionMeta, g: keyof typeof GROUPS) => (GROUPS[g] as readonly string[]).includes(q.category);

/**
 * Pick a varied game from a pool, deterministic for a given `rand`:
 * one everyday, one world (geography/history) and one nature/science question first; then fill
 * with no repeated template family, at most one vocabulary question, at most one question per
 * category until five categories are in, and at least one non-easy question.
 */
export function pickGame(pool: readonly QuestionMeta[], rand: () => number, n = GAME.roundsPerGame): QuestionMeta[] {
  const order = shuffle(pool, rand);
  const chosen: QuestionMeta[] = [];
  const ok = (q: QuestionMeta, strict: boolean) => {
    if (chosen.some((c) => c.id === q.id || c.family === q.family)) return false;
    if (inGroup(q, 'vocab') && chosen.some((c) => inGroup(c, 'vocab'))) return false;
    if (!strict) return true;
    const cats = new Set(chosen.map((c) => c.category));
    const sameCat = chosen.filter((c) => c.category === q.category).length;
    return cats.size < 5 ? sameCat === 0 : sameCat < 2;
  };
  for (const g of ['everyday', 'world', 'nature'] as const) {
    const q = order.find((x) => inGroup(x, g) && ok(x, true));
    if (q) chosen.push(q);
  }
  for (const strict of [true, false]) for (const q of order) if (chosen.length < n && ok(q, strict)) chosen.push(q);
  // Balance: at least one medium/hard question when the pool has one.
  if (chosen.every((c) => c.difficulty === 'easy')) {
    const harder = order.find((q) => q.difficulty !== 'easy' && ok(q, false));
    if (harder) chosen[chosen.length - 1] = harder;
  }
  return shuffle(chosen, rand);
}

/** Seven deterministic questions for a UTC date (same for everyone on this bank version). */
export function dailyPick(dateKey: string, index: readonly QuestionMeta[]): QuestionMeta[] {
  const pool = [...index].sort((a, b) => (a.id < b.id ? -1 : 1));
  return pickGame(pool, mulberry32(hashString(`deepcut/${BANK_VERSION}/${dateKey}`)));
}

/** Seven random questions avoiding recently played ones (recent = ids oldest first) where the bank allows. */
export function unlimitedPick(index: readonly QuestionMeta[], recent: readonly string[], rand: () => number = Math.random): QuestionMeta[] {
  const avoid = new Set(recent);
  const fresh = index.filter((q) => !avoid.has(q.id));
  return pickGame(fresh.length >= 60 ? fresh : index, rand);
}
