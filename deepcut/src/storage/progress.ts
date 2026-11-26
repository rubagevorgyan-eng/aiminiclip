import { RARITY, type RarityId } from '../config/game.ts';
import type { RoundRecord } from '../engine/machine.ts';
import { previousDateKey } from '../data/selection.ts';
import { browserKV, readJSON, writeJSON, type KV } from './storage.ts';

/** Local progress: lifetime stats, daily results and streak, recently played questions. Versioned. */
export interface DailyResult {
  ids: string[];
  records: RoundRecord[];
  score: number;
}
export interface Progress {
  v: 1;
  games: number;
  totalDepth: number;
  bestDepth: number;
  correct: number;
  rounds: number;
  tiers: Record<RarityId, number>;
  daily: { last: string | null; streak: number; longest: number; results: Record<string, DailyResult> };
  /** Recently played question ids, oldest first. */
  recent: string[];
  /** Ids of games already counted, so a finished game is never counted twice. */
  recorded: string[];
}

export const PROGRESS_KEY = 'deepcut.progress.v1';
const RECENT_MAX = 21;
const KEEP_DAILY_RESULTS = 120;
const KEEP_RECORDED = 60;

export const emptyProgress = (): Progress => ({
  v: 1,
  games: 0,
  totalDepth: 0,
  bestDepth: 0,
  correct: 0,
  rounds: 0,
  tiers: Object.fromEntries(RARITY.map((t) => [t.id, 0])) as Record<RarityId, number>,
  daily: { last: null, streak: 0, longest: 0, results: {} },
  recent: [],
  recorded: [],
});

function isProgress(v: unknown): v is Progress {
  const p = v as Progress;
  return (
    !!p && p.v === 1 && typeof p.games === 'number' && typeof p.bestDepth === 'number' &&
    !!p.tiers && !!p.daily && typeof p.daily.results === 'object' && Array.isArray(p.recent)
  );
}

export function loadProgress(kv: KV = browserKV): Progress {
  const p = readJSON(kv, PROGRESS_KEY, isProgress);
  if (!p) return emptyProgress();
  // Fill fields added by later versions of the same schema.
  const base = emptyProgress();
  return { ...base, ...p, tiers: { ...base.tiers, ...p.tiers }, daily: { ...base.daily, ...p.daily } };
}

export const saveProgress = (p: Progress, kv: KV = browserKV) => writeJSON(kv, PROGRESS_KEY, p);

/** Add a finished game to lifetime stats (once per game id). Pure. */
export function addGame(p: Progress, records: RoundRecord[], score: number, id?: string): Progress {
  if (id && p.recorded.includes(id)) return p;
  const tiers = { ...p.tiers };
  for (const r of records) if (r.rarity) tiers[r.rarity]++;
  return {
    ...p,
    games: p.games + 1,
    totalDepth: p.totalDepth + score,
    bestDepth: Math.max(p.bestDepth, score),
    correct: p.correct + records.filter((r) => r.outcome === 'correct').length,
    rounds: p.rounds + records.length,
    tiers,
    recorded: id ? [...p.recorded, id].slice(-KEEP_RECORDED) : p.recorded,
  };
}

/** Record a finished Daily Dig for a date (first completion only) and update the streak. Pure. */
export function addDaily(p: Progress, date: string, result: DailyResult): Progress {
  if (p.daily.results[date]) return p;
  const all = { ...p.daily.results, [date]: result };
  const keys = Object.keys(all).sort();
  const last = keys[keys.length - 1];
  // Streak = consecutive days ending at the latest completed date (order of recording doesn't matter).
  let streak = 0;
  for (let d = last; all[d]; d = previousDateKey(d)) streak++;
  const keep = keys.slice(-KEEP_DAILY_RESULTS);
  return {
    ...addGame(p, result.records, result.score, `daily:${date}`),
    daily: {
      last,
      streak,
      longest: Math.max(p.daily.longest, streak),
      results: Object.fromEntries(keep.map((k) => [k, all[k]])),
    },
  };
}

/** Streak to show today: alive if the last daily was today or yesterday. */
export function currentStreak(p: Progress, today: string): number {
  const last = p.daily.last;
  return last === today || last === previousDateKey(today) ? p.daily.streak : 0;
}

export function addRecent(p: Progress, ids: string[]): Progress {
  const recent = [...p.recent.filter((id) => !ids.includes(id)), ...ids].slice(-RECENT_MAX);
  return { ...p, recent };
}
