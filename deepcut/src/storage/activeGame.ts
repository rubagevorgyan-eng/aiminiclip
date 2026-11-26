import { GAME } from '../config/game.ts';
import { questionById } from '../data/selection.ts';
import type { GameState, Phase, RoundRecord } from '../engine/machine.ts';
import { browserKV, readJSON, writeJSON, type KV } from './storage.ts';

/** A Daily Dig in progress, saved after every state change so refresh/reopen resumes it. */
interface Snapshot {
  v: 1;
  date: string;
  ids: string[];
  phase: Phase;
  round: number;
  phaseEndsAt: number | null;
  records: RoundRecord[];
  score: number;
  wrong: string[];
}
export const ACTIVE_KEY = 'deepcut.activeDaily.v1';

const isSnapshot = (v: unknown): v is Snapshot => {
  const s = v as Snapshot;
  return !!s && s.v === 1 && typeof s.date === 'string' && Array.isArray(s.ids) && Array.isArray(s.records) && typeof s.round === 'number';
};

export function saveActiveDaily(date: string, s: GameState, kv: KV = browserKV) {
  const snap: Snapshot = {
    v: 1, date, ids: s.questions.map((q) => q.id), phase: s.phase, round: s.round,
    phaseEndsAt: s.phaseEndsAt, records: s.records, score: s.score, wrong: s.wrong,
  };
  writeJSON(kv, ACTIVE_KEY, snap);
}

/** Saved daily game, or null if none/corrupt/from a different question bank. */
export function loadActiveDaily(kv: KV = browserKV): { date: string; state: GameState } | null {
  const snap = readJSON(kv, ACTIVE_KEY, isSnapshot);
  if (!snap) return null;
  const questions = snap.ids.map(questionById);
  if (questions.length !== GAME.roundsPerGame || questions.some((q) => !q)) return null;
  return {
    date: snap.date,
    state: {
      phase: snap.phase, questions: questions as GameState['questions'], round: snap.round,
      phaseEndsAt: snap.phaseEndsAt, records: snap.records, score: snap.score, wrong: snap.wrong ?? [],
    },
  };
}

export const clearActiveDaily = (kv: KV = browserKV) => kv.removeItem(ACTIVE_KEY);
