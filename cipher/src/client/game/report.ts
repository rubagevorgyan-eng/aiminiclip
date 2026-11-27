/**
 * Mission report figures, computed only from the recorded public match (history, reveals, result and
 * the board declassified at the end). Nothing is estimated or invented.
 */
import type { DuetSide, GuessRecord, PublicMatchState, TeamId, TurnOwner } from '../../shared/types.ts';
import { groupHistory } from './history.ts';

const correct = (g: GuessRecord) => (g.owner.kind === 'team' ? g.result.identity === g.owner.team : g.result.identity === 'agent');

export interface ReportData {
  durationMs: number;
  clues: number;
  guesses: number;
  correctGuesses: number;
  /** 0..1, null when nobody guessed. */
  accuracy: number | null;
  /** Competitive: agents found / total per team. Cooperative: shared agents. */
  agents: { label: TeamId | 'shared'; found: number; total: number }[];
  /** The clue whose turn produced the most correct guesses (earliest on ties). */
  best: { word: string; count: number | null; owner: TurnOwner; correct: number; turn: number } | null;
  /** Set when the match ended on an assassin. */
  assassin: { word: string; loser: TeamId | 'cooperative'; by: string } | null;
}

export function reportData(m: PublicMatchState): ReportData | null {
  const r = m.result;
  if (!r) return null;
  const guesses = m.history.flatMap((e) => (e.type === 'guess' ? [e.guess] : []));
  const good = guesses.filter(correct).length;
  let best: ReportData['best'] = null;
  for (const t of groupHistory(m.history)) {
    if (!t.clue) continue;
    const n = t.guesses.filter(correct).length;
    if (n > 0 && (!best || n > best.correct)) best = { word: t.clue.word, count: t.clue.count, owner: t.clue.owner, correct: n, turn: t.turn };
  }
  const agents: ReportData['agents'] =
    r.stats.cooperative
      ? [{ label: 'shared', found: r.stats.cooperative?.agentsFound ?? 0, total: r.stats.cooperative?.agentsTotal ?? 0 }]
      : (['crimson', 'cobalt'] as const).map((team) => {
          const found = m.cards.filter((c) => c.reveal?.identity.identity === team).length;
          return { label: team, found, total: found + (m.remaining[team] ?? 0) };
        });
  const moleGuess = r.reason === 'mole_revealed' ? guesses.find((g) => g.result.identity === 'mole') : undefined;
  const assassin = moleGuess
    ? { word: m.cards[moleGuess.card]?.word ?? '', loser: moleGuess.owner.kind === 'team' ? moleGuess.owner.team : ('cooperative' as const), by: moleGuess.by }
    : null;
  return { durationMs: r.completedAt - r.startedAt, clues: m.history.filter((e) => e.type === 'clue').length, guesses: guesses.length, correctGuesses: good, accuracy: guesses.length ? good / guesses.length : null, agents, best, assassin };
}

/** Declassified identity of every card for the post-match board (null before the end). */
export function declassifiedBoard(m: PublicMatchState): { word: string; identity: string; revealed: boolean; side?: Record<DuetSide, string> }[] | null {
  const k = m.declassified;
  if (!k) return null;
  return m.cards.map((c, i) =>
    k.kind === 'competitive'
      ? { word: c.word, identity: k.identities[i], revealed: !!c.reveal }
      : { word: c.word, identity: k.sides.north[i] === 'agent' || k.sides.south[i] === 'agent' ? 'agent' : k.sides.north[i] === 'mole' || k.sides.south[i] === 'mole' ? 'mole' : 'civilian', revealed: !!c.reveal, side: { north: k.sides.north[i], south: k.sides.south[i] } },
  );
}
