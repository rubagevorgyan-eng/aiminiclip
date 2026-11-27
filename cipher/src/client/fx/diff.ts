import type { PublicMatchState } from '../../shared/types.ts';

/**
 * What changed between two views of the same room, for presentation only. Nothing is animated on the
 * first view (page load, reconnect) or after a large jump (resync), so old moments never replay.
 */
export interface MatchFx {
  /** A new match appeared while watching (start or rematch); `from` = previous board's words. */
  init: { matchId: string; from: string[] | null } | null;
  reveals: number[];
  /** Duet: cards that just got a civilian marker. */
  civilians: number[];
  /** Key of a clue that just arrived. */
  clue: string | null;
  ended: boolean;
}

export const NO_FX: MatchFx = { init: null, reveals: [], civilians: [], clue: null, ended: false };
export const MAX_ANIMATED_JUMP = 3;

export function diffMatch(prev: PublicMatchState | null, next: PublicMatchState | null): MatchFx {
  if (!prev || !next) return NO_FX;
  if (prev.id !== next.id) {
    return { ...NO_FX, init: { matchId: next.id, from: prev.cards.length === next.cards.length ? prev.cards.map((c) => c.word) : null } };
  }
  if (next.revision - prev.revision > MAX_ANIMATED_JUMP || next.revision < prev.revision) return NO_FX;
  const reveals = next.cards.filter((c, i) => c.reveal && !prev.cards[i]?.reveal).map((c) => c.index);
  const civilians = next.cards.filter((c, i) => (c.civilianFor?.length ?? 0) > (prev.cards[i]?.civilianFor?.length ?? 0)).map((c) => c.index);
  const nc = next.turn?.clue;
  const pc = prev.turn?.clue;
  const clue = nc && (!pc || pc.turn !== nc.turn || pc.word !== nc.word) ? `${next.id}:${nc.turn}:${nc.word}` : null;
  return { init: null, reveals, civilians, clue, ended: prev.phase !== 'completed' && next.phase === 'completed' };
}
