import { SIDE_LABEL, TEAM_LABEL } from '../../shared/config.ts';
import type { ClientView, Player, PlayerId, TurnOwner } from '../../shared/types.ts';
import type { Tone } from './identity.ts';

/** What the local viewer may do right now. Presentation only: the server re-checks every action. */
export interface Seat {
  me: Player | null;
  isHost: boolean;
  canClue: boolean;
  canGuess: boolean;
  holdsKey: boolean;
}

export function deriveSeat(view: ClientView): Seat {
  const me = view.room.players.find((p) => p.id === view.you) ?? null;
  const m = view.match;
  const base = { me, isHost: view.room.host.hostId === view.you, holdsKey: view.key !== null };
  if (!me || !m || !m.turn) return { ...base, canClue: false, canGuess: false };
  const owner = m.turn.owner;
  if (owner.kind === 'team') {
    const mine = me.team === owner.team;
    return { ...base, canClue: m.phase === 'awaiting_clue' && mine && me.role === 'handler', canGuess: m.phase === 'guessing' && mine && me.role === 'operative' };
  }
  // Duet: the clue giver's station gives the clue, the other station guesses; in sudden death both guess.
  const seated = me.side !== null && me.role !== 'spectator';
  return {
    ...base,
    canClue: m.phase === 'awaiting_clue' && seated && me.side === owner.side,
    canGuess: seated && ((m.phase === 'guessing' && me.side !== owner.side) || m.phase === 'sudden_death'),
  };
}

export const ownerTone = (o: TurnOwner): Tone => (o.kind === 'team' ? o.team : 'agent');
export const ownerLabel = (o: TurnOwner) => (o.kind === 'team' ? TEAM_LABEL[o.team] : SIDE_LABEL[o.side]);

export function nameOf(players: readonly Player[], id: PlayerId | null): string {
  if (!id) return 'System';
  return players.find((p) => p.id === id)?.name ?? 'Former operative';
}
