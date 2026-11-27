import type { MatchPhase } from '../shared/types.ts';

/**
 * Allowed phase transitions. `paused` can be entered from any live phase and returns to the
 * phase stored in `resumePhase`. `sudden_death` is Duet only (out of clue turns).
 */
export const PHASE_TRANSITIONS: Record<MatchPhase, readonly MatchPhase[]> = {
  lobby: ['awaiting_clue'],
  awaiting_clue: ['guessing', 'sudden_death', 'paused', 'completed'],
  guessing: ['awaiting_clue', 'sudden_death', 'paused', 'completed'],
  sudden_death: ['paused', 'completed'],
  paused: ['awaiting_clue', 'guessing', 'sudden_death', 'completed'],
  completed: ['lobby'], // rematch returns the room to the lobby with a new match id
};

export const canTransition = (from: MatchPhase, to: MatchPhase) => PHASE_TRANSITIONS[from].includes(to);

export const LIVE_PHASES: readonly MatchPhase[] = ['awaiting_clue', 'guessing', 'sudden_death'];
export const isLive = (phase: MatchPhase) => LIVE_PHASES.includes(phase);
