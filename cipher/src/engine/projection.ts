import { canRead } from './chatRules.ts';
import type {
  ClientView,
  KeyView,
  Player,
  PlayerId,
  PrivateMatchState,
  PublicMatchState,
  PublicRoom,
  ServerRoom,
  Suggestion,
} from '../shared/types.ts';

/**
 * The only path from server state to anything a client receives.
 * Built field by field (never by spreading private objects) so new private fields can't leak by accident.
 */
export function projectView(room: ServerRoom, viewerId: PlayerId, now?: number): ClientView {
  const viewer = room.players.find((p) => p.id === viewerId) ?? null;
  return {
    you: viewerId,
    ...(now !== undefined ? { serverNow: now } : {}),
    room: publicRoom(room, viewer),
    match: room.match ? publicMatch(room.match, viewer) : null,
    key: room.match ? keyFor(room.match, viewer) : null,
  };
}

/** Room data for one viewer: chat is filtered to the channels that viewer may read. */
export function publicRoom(room: ServerRoom, viewer: Player | null = null): PublicRoom {
  return {
    code: room.code,
    settings: room.settings,
    host: room.host,
    players: room.players.map((p) => ({ ...p })),
    chat: room.chat.filter((c) => canRead(c.channel, viewer)),
    matchCount: room.matchCount,
    pauseReason: room.pauseReason,
    keyHolders: [...room.keyHolders],
  };
}

export function publicMatch(m: PrivateMatchState, viewer: Player | null): PublicMatchState {
  const completed = m.phase === 'completed';
  return {
    id: m.id,
    revision: m.revision,
    rules: { ...m.rules },
    mode: m.mode,
    dimensions: m.dimensions,
    phase: m.phase,
    resumePhase: m.resumePhase,
    turn: m.turn,
    history: m.history,
    suggestions: m.suggestions.filter((s) => canSeeSuggestion(s, viewer)),
    startingTeam: m.startingTeam,
    ...(m.sidesDone ? { sidesDone: [...m.sidesDone] } : {}),
    remaining: m.remaining,
    result: m.result,
    startedAt: m.startedAt,
    cards: m.words.map((word, index) => ({
      index,
      word,
      reveal: m.reveals[index] ?? null,
      ...(m.key.kind === 'cooperative' ? { civilianFor: m.civilianFor[index] ?? [] } : {}),
    })),
    declassified: completed ? m.key : null,
  };
}

/** Handlers see the competitive key; each Duet player sees only their own side. Nobody else sees any. */
export function keyFor(m: PrivateMatchState, viewer: Player | null): KeyView | null {
  if (!viewer || viewer.role === 'spectator') return null;
  if (m.key.kind === 'competitive') {
    return viewer.role === 'handler' && viewer.team ? { kind: 'competitive', identities: m.key.identities.slice() } : null;
  }
  return viewer.side ? { kind: 'cooperative', side: viewer.side, identities: m.key.sides[viewer.side].slice() } : null;
}

/** Suggestions are visible to the suggesting team/side's members and to spectators, never to the other team. */
function canSeeSuggestion(s: Suggestion, viewer: Player | null): boolean {
  if (!viewer) return false;
  if (viewer.role === 'spectator') return true;
  if (s.owner.kind === 'side') return true; // Duet is cooperative
  return viewer.team === s.owner.team;
}
