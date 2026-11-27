/**
 * Chat permissions, shared by the server (which enforces them) and the UI (which explains them).
 * During live play, chat must not become a second clue channel:
 * - competitive: handlers cannot chat; operatives use their team channel or global; observers talk
 *   only to observers;
 * - Duet: only the guessing partner may talk in global; the clue-giving side keeps quiet there
 *   (its private side channel stays open); no global talk during sudden death.
 * Outside a match (lobby, finished match) every channel a player can read is open.
 */
import type { ChatChannel, MatchPhase, Player, RoomSettings, TurnState } from '../shared/types.ts';
import { kindOf } from './settings.ts';

export interface ChatContext {
  settings: RoomSettings;
  match: { phase: MatchPhase; turn: TurnState | null } | null;
}

/** Channels a player can read (system and global for everyone). */
export function canRead(channel: ChatChannel, p: Player | null): boolean {
  if (channel === 'global' || channel === 'system') return true;
  if (!p) return false;
  if (channel === 'spectators') return p.role === 'spectator';
  if (channel.startsWith('team:')) return p.role !== 'spectator' && p.team === channel.slice(5);
  if (channel.startsWith('side:')) return p.role !== 'spectator' && p.side === channel.slice(5);
  return false;
}

/** The channels shown to a player, in tab order. */
export function channelsFor(p: Player | null): ChatChannel[] {
  if (!p) return ['global'];
  if (p.role === 'spectator') return ['global', 'spectators'];
  if (p.team) return [`team:${p.team}` as ChatChannel, 'global'];
  if (p.side) return [`side:${p.side}` as ChatChannel, 'global'];
  return ['global'];
}

/** Why `p` may not post to `channel` right now, or null when allowed. */
export function writeBlock(ctx: ChatContext, p: Player | null, channel: ChatChannel): string | null {
  if (!p) return 'You are not in this room.';
  if (p.muted) return 'The host has muted you.';
  if (channel === 'system') return 'The system log is read-only.';
  if (!canRead(channel, p)) return 'You are not in that channel.';
  const m = ctx.match;
  if (!m || m.phase === 'completed' || m.phase === 'lobby') return null;
  if (p.role === 'spectator') return channel === 'spectators' ? null : 'Observers can only talk to other observers during a match.';
  if (kindOf(ctx.settings) === 'competitive') {
    return p.role === 'handler' ? 'Handlers cannot chat during play: the clue is your only signal.' : null;
  }
  if (channel.startsWith('side:')) return null; // only players holding the same key read it
  if (m.phase === 'sudden_death') return 'No discussion during sudden death.';
  const giver = m.turn?.owner.kind === 'side' ? m.turn.owner.side : null;
  if (m.phase !== 'guessing') return 'Global chat opens while your partner is guessing.';
  return p.side === giver ? 'You gave the clue: let your partner guess without extra hints.' : null;
}
