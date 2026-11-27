import { GAME } from '../config/game.ts';
import { hashString, mulberry32, shuffle } from '../utils/random.ts';
import type { QuestionMeta } from '../engine/types.ts';

/**
 * Bump when the question bank changes in a way that should change daily picks.
 * Everyone on the same version gets the same Daily Dig for a given UTC date.
 */
export const BANK_VERSION = 3;
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

/** Most questions per game from repeated templates ("Name a film starring {actor}"); the rest are broad questions. */
export const MAX_TEMPLATE = 2;
/** What a question asks for: "Name a river in Africa." -> "river". Two questions on the same subject never share a game. */
export const subjectOf = (q: QuestionMeta) =>
  q.text.toLowerCase().replace(/^name (an?|the|one|some)? ?/, '').replace(/^(famous|type of|kind of|species of|member of the) /, '').split(/[\s,.]/)[0];

/**
 * Pick a varied game from a pool, deterministic for a given `rand`:
 * one everyday, one world (geography/history) and one nature/science question first (broad ones
 * preferred); then fill with no repeated template family or subject, at most MAX_TEMPLATE template
 * questions, at most one vocabulary question, at most one question per category until five
 * categories are in, and at least one non-easy question. Rules relax only if the pool runs out.
 */
export function pickGame(pool: readonly QuestionMeta[], rand: () => number, n = GAME.roundsPerGame): QuestionMeta[] {
  const order = shuffle(pool, rand);
  const chosen: QuestionMeta[] = [];
  const ok = (q: QuestionMeta, strict: boolean) => {
    if (chosen.some((c) => c.id === q.id || c.family === q.family)) return false;
    if (inGroup(q, 'vocab') && chosen.some((c) => inGroup(c, 'vocab'))) return false;
    if (chosen.some((c) => subjectOf(c) === subjectOf(q))) return false;
    if (!strict) return true;
    if (!q.broad && chosen.filter((c) => !c.broad).length >= MAX_TEMPLATE) return false;
    const cats = new Set(chosen.map((c) => c.category));
    const sameCat = chosen.filter((c) => c.category === q.category).length;
    return cats.size < 5 ? sameCat === 0 : sameCat < 2;
  };
  for (const g of ['everyday', 'world', 'nature'] as const) {
    const q = order.find((x) => x.broad && inGroup(x, g) && ok(x, true)) ?? order.find((x) => inGroup(x, g) && ok(x, true));
    if (q) chosen.push(q);
  }
  for (const q of order) if (chosen.length < n && ok(q, true)) chosen.push(q);
  // Relaxed fill (small pools only): still broad questions before templates.
  const relaxed = [...order.filter((q) => q.broad), ...order.filter((q) => !q.broad)];
  for (const q of relaxed) if (chosen.length < n && ok(q, false)) chosen.push(q);
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
