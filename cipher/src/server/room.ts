import { DEFAULT_SETTINGS } from '../shared/config.ts';
import { newPlayerId } from '../shared/ids.ts';
import { randomToken } from '../shared/random.ts';
import { cleanName } from '../shared/text.ts';
import type { GuestSession, ModeId, Player, RoomCode, ServerRoom, Timestamp } from '../shared/types.ts';

/**
 * Server-side room state. Runs inside the room server (one Cloudflare Durable Object per room,
 * added in the multiplayer stage). Nothing in this folder is imported by client code.
 */
export function createRoom(code: RoomCode, mode: ModeId, now: Timestamp): ServerRoom {
  return {
    code,
    createdAt: now,
    settings: { ...DEFAULT_SETTINGS[mode] },
    host: { hostId: '', hostSince: now },
    players: [],
    sessions: [],
    chat: [],
    match: null,
    matchCount: 0,
    recentWordIds: [],
    keyHolders: [],
    pauseReason: null,
    lastActiveAt: now,
  };
}

/** Seats a new guest as a spectator-by-default player; the first guest becomes host. */
export function addGuest(room: ServerRoom, name: string, now: Timestamp): { player: Player; session: GuestSession } {
  const player: Player = { id: newPlayerId(), name: cleanName(name) || 'Agent', team: null, side: null, role: 'spectator', connected: true, joinedAt: now, lastSeenAt: now };
  const session: GuestSession = { playerId: player.id, token: randomToken(), roomCode: room.code, createdAt: now, disconnectedAt: null };
  room.players.push(player);
  room.sessions.push(session);
  if (!room.host.hostId) room.host = { hostId: player.id, hostSince: now };
  return { player, session };
}
