import { GAME } from '../config/game.ts';
import { hashString, mulberry32, shuffle } from '../utils/random.ts';
import { QUESTIONS } from './questions.ts';
import type { Question } from '../engine/types.ts';

/**
 * Bump when the question bank changes in a way that should change daily picks.
 * Everyone on the same version gets the same Daily Dig for a given UTC date.
 */
export const BANK_VERSION = 1;
/** Daily Dig #1 was on this UTC date. */
export const DAILY_EPOCH = '2026-11-01';
const DAY = 86_400_000;

/** UTC calendar date as YYYY-MM-DD. */
export const utcDateKey = (now: number) => new Date(now).toISOString().slice(0, 10);
const dayIndex = (key: string) => Math.floor(Date.parse(`${key}T00:00:00Z`) / DAY);
export const dailyNumber = (key: string) => dayIndex(key) - dayIndex(DAILY_EPOCH) + 1;
export const previousDateKey = (key: string) => utcDateKey(Date.parse(`${key}T00:00:00Z`) - DAY);
export const msUntilNextDaily = (now: number) => DAY - (now % DAY);

const byId = new Map(QUESTIONS.map((q) => [q.id, q]));
export const questionById = (id: string) => byId.get(id);
const sortedIds = () => QUESTIONS.map((q) => q.id).sort();

/** Seven deterministic questions for a UTC date. */
export function dailyQuestions(dateKey: string, pool: readonly string[] = sortedIds()): Question[] {
  const rand = mulberry32(hashString(`deepcut/${BANK_VERSION}/${dateKey}`));
  return shuffle(pool, rand).slice(0, GAME.roundsPerGame).map((id) => byId.get(id)!);
}

/** Seven random questions (recent = ids oldest first), no duplicates, avoiding recently played ones where the bank allows. */
export function unlimitedQuestions(recent: readonly string[], rand: () => number = Math.random): Question[] {
  const avoid = new Set(recent);
  const fresh = shuffle(QUESTIONS.filter((q) => !avoid.has(q.id)), rand);
  if (fresh.length >= GAME.roundsPerGame) return fresh.slice(0, GAME.roundsPerGame);
  // Not enough fresh ones: top up with the least recently played.
  // `recent` is oldest first, so the front holds the least recently played.
  const older = recent.map((id) => byId.get(id)).filter((q): q is Question => !!q);
  return [...fresh, ...older].slice(0, GAME.roundsPerGame);
}
