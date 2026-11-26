import { GAME, RARITY, type RarityId } from '../config/game.ts';
import { matchAnswer } from './match.ts';
import type { Question } from './types.ts';

/**
 * Game flow: HOME -> COUNTDOWN -> QUESTION -> ROUND_RESULT -> (next question) ... -> FINAL_RESULTS.
 * "Next question" is the transition out of ROUND_RESULT, not a resting phase.
 * The reducer is pure: time comes in on events, deadlines are stored as timestamps,
 * and any event that is not valid for the current phase returns the same state object.
 */
export type Phase = 'HOME' | 'COUNTDOWN' | 'QUESTION' | 'ROUND_RESULT' | 'FINAL_RESULTS';
export type Outcome = 'correct' | 'timeout' | 'skipped';

export interface RoundRecord {
  questionId: string;
  outcome: Outcome;
  guess?: string;
  answer?: string;
  rarity?: RarityId;
  points: number;
}

export interface GameState {
  phase: Phase;
  questions: Question[];
  round: number; // index into questions
  phaseEndsAt: number | null; // countdown end, question deadline, or result end
  records: RoundRecord[];
  score: number;
  wrong: string[]; // rejected guesses this round
}

export type GameEvent =
  | { type: 'START'; questions: Question[]; now: number }
  | { type: 'TICK'; now: number }
  | { type: 'SUBMIT'; text: string; now: number }
  | { type: 'SKIP'; now: number }
  | { type: 'QUIT' }
  /** Restore a saved game (from HOME only). Follow with catchUp() for elapsed time. */
  | { type: 'LOAD'; state: GameState }
  /** End the game now; unplayed rounds count as timeouts (used when a Daily Dig is abandoned). */
  | { type: 'FORFEIT' };

export const initialState: GameState = {
  phase: 'HOME',
  questions: [],
  round: 0,
  phaseEndsAt: null,
  records: [],
  score: 0,
  wrong: [],
};

export const pointsFor = (r: RarityId) => RARITY.find((t) => t.id === r)!.points;

function endRound(s: GameState, rec: RoundRecord, now: number): GameState {
  return {
    ...s,
    phase: 'ROUND_RESULT',
    phaseEndsAt: now + GAME.roundResultMs,
    records: [...s.records, rec],
    score: Math.min(GAME.maxScore, s.score + rec.points),
  };
}

function startQuestion(s: GameState, round: number, now: number): GameState {
  return { ...s, phase: 'QUESTION', round, phaseEndsAt: now + GAME.secondsPerQuestion * 1000, wrong: [] };
}

export function reduce(s: GameState, e: GameEvent): GameState {
  switch (e.type) {
    case 'START': {
      if (s.phase !== 'HOME' && s.phase !== 'FINAL_RESULTS') return s;
      const questions = e.questions.slice(0, GAME.roundsPerGame);
      if (questions.length !== GAME.roundsPerGame) throw new Error(`Need ${GAME.roundsPerGame} questions`);
      return { ...initialState, phase: 'COUNTDOWN', questions, phaseEndsAt: e.now + GAME.countdownMs };
    }
    case 'QUIT':
      return s.phase === 'HOME' ? s : initialState;
    case 'LOAD':
      return s.phase === 'HOME' && e.state.questions.length === GAME.roundsPerGame ? e.state : s;
    case 'FORFEIT': {
      if (s.phase === 'HOME' || s.phase === 'FINAL_RESULTS') return s;
      const from = s.phase === 'ROUND_RESULT' ? s.round + 1 : s.phase === 'COUNTDOWN' ? 0 : s.round;
      const rest: RoundRecord[] = s.questions.slice(from).map((q) => ({ questionId: q.id, outcome: 'timeout', points: 0 }));
      return { ...s, phase: 'FINAL_RESULTS', phaseEndsAt: null, records: [...s.records.slice(0, from), ...rest] };
    }
    case 'TICK': {
      if (s.phaseEndsAt === null || e.now < s.phaseEndsAt) return s;
      if (s.phase === 'COUNTDOWN') return startQuestion(s, 0, e.now);
      if (s.phase === 'QUESTION')
        return endRound(s, { questionId: s.questions[s.round].id, outcome: 'timeout', points: 0 }, e.now);
      if (s.phase === 'ROUND_RESULT') {
        const next = s.round + 1;
        return next < s.questions.length
          ? startQuestion(s, next, e.now)
          : { ...s, phase: 'FINAL_RESULTS', phaseEndsAt: null };
      }
      return s;
    }
    case 'SKIP': {
      if (s.phase !== 'QUESTION') return s;
      if (e.now >= s.phaseEndsAt!) return reduce(s, { type: 'TICK', now: e.now });
      return endRound(s, { questionId: s.questions[s.round].id, outcome: 'skipped', points: 0 }, e.now);
    }
    case 'SUBMIT': {
      if (s.phase !== 'QUESTION') return s;
      if (e.now >= s.phaseEndsAt!) return reduce(s, { type: 'TICK', now: e.now });
      const guess = e.text.trim();
      if (!guess) return s;
      const q = s.questions[s.round];
      const a = matchAnswer(q, guess);
      if (!a) return { ...s, wrong: [...s.wrong, guess] };
      return endRound(
        s,
        { questionId: q.id, outcome: 'correct', guess, answer: a.name, rarity: a.rarity, points: pointsFor(a.rarity) },
        e.now,
      );
    }
  }
}

/**
 * Apply all deadlines that passed while the game was closed. A question whose deadline passed
 * times out; the next question then starts fresh at `now` (the player was not there to see it).
 */
export function catchUp(s: GameState, now: number): GameState {
  let cur = s;
  for (let i = 0; i < 4 * GAME.roundsPerGame; i++) {
    const next = reduce(cur, { type: 'TICK', now });
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

/** Milliseconds left in the current timed phase (0 when not timed). */
export const timeLeft = (s: GameState, now: number) => (s.phaseEndsAt === null ? 0 : Math.max(0, s.phaseEndsAt - now));
export const depth = (s: GameState) => s.score; // 1 point = 1 meter
