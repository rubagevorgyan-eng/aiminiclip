import type { CardIndex, Clue, GuessRecord, HistoryEntry, MatchResult } from '../../shared/types.ts';

/** One turn of public intelligence: the clue (if any), the guesses made on it, and how it ended. */
export interface TurnRecord {
  turn: number;
  clue: Clue | null;
  guesses: GuessRecord[];
  ended: Extract<HistoryEntry, { type: 'end_turn' }> | null;
}

/**
 * Groups the public history by turn. Uses only public entries (clues, confirmed guesses and their
 * revealed results, turn ends): never which cards a clue was meant for.
 */
export function groupHistory(history: readonly HistoryEntry[]): TurnRecord[] {
  const turns = new Map<number, TurnRecord>();
  const get = (n: number) => turns.get(n) ?? (turns.set(n, { turn: n, clue: null, guesses: [], ended: null }), turns.get(n)!);
  for (const e of history) {
    if (e.type === 'clue') get(e.clue.turn).clue = e.clue;
    else if (e.type === 'guess') get(e.guess.turn).guesses.push(e.guess);
    else get(e.turn).ended = e;
  }
  return [...turns.values()].sort((a, b) => a.turn - b.turn);
}

/** Cards guessed on a turn (revealed or marked civilian): what highlighting a past clue may show. */
export const cardsOfTurn = (t: TurnRecord): Set<CardIndex> => new Set(t.guesses.map((g) => g.card));

export const resultLine = (r: MatchResult) =>
  r.outcome.kind === 'team_win' ? `${r.outcome.team} wins · ${r.reason.replace(/_/g, ' ')}` : `${r.outcome.kind === 'cooperative_win' ? 'Joint operation succeeds' : 'Joint operation fails'} · ${r.reason.replace(/_/g, ' ')}`;
