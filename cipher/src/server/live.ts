/**
 * Live room logic used by the room server (one Durable Object per room). Pure over `ServerRoom` so it
 * can be unit-tested without Cloudflare: authentication, message routing, mid-match seating,
 * disconnect grace, host migration, auto-pause, timers and expiry. The Durable Object only adds
 * sockets, storage and alarms around these functions.
 */
import { applyMatchAction } from '../engine/match.ts';
import { kindOf } from '../engine/settings.ts';
import { PROTOCOL_VERSION, type ClientMessage, type ErrorCode } from '../net/protocol.ts';
import { DUET_SIDES, LIMITS, RECONNECT_GRACE_MS, ROOM_IDLE_MS, SIDE_LABEL, TEAMS, TEAM_LABEL } from '../shared/config.ts';
import { randomId, type Rng } from '../shared/random.ts';
import { cleanName } from '../shared/text.ts';
import type { Player, PlayerId, ServerRoom, SessionToken, TeamId, Timestamp } from '../shared/types.ts';
import type { VocabularyBank } from '../vocab/types.ts';
import { applyLobby, inLobby, systemMessage } from './lobby.ts';
import { applyGameMessage, isGameMessage, startMatch, tickMatch } from './match.ts';
import { addGuest } from './room.ts';

/** A required role must be missing this long before play pauses (covers page refreshes). */
export const AUTO_PAUSE_GRACE_MS = 20_000;

export interface LiveDeps {
  bank: VocabularyBank;
  /** Production: cryptoRng(). Tests: seededRng(). */
  rng: () => Rng;
  now: Timestamp;
}

export type Outcome = { ok: true; changed: boolean } | { ok: false; code: ErrorCode; message: string; close?: boolean };
const done = (changed = true): Outcome => ({ ok: true, changed });
const fail = (code: ErrorCode, message: string, close = false): Outcome => ({ ok: false, code, message, close });

const matchLive = (room: ServerRoom) => !!room.match && room.match.phase !== 'completed';

/** Constant-time string comparison for session tokens. */
export function sameToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------- Join / authenticate ----------
export type HelloResult = { ok: true; playerId: PlayerId; token: SessionToken; resumed: boolean } | { ok: false; code: ErrorCode; message: string };

/**
 * Resumes a seat only with the matching secret token; otherwise joins as a new guest. A room code or
 * display name alone never grants an existing seat. Newcomers sit as observers; mid-match that needs
 * spectators to be allowed.
 */
export function hello(room: ServerRoom, m: Extract<ClientMessage, { t: 'hello' }>, now: Timestamp): HelloResult {
  if (m.v !== PROTOCOL_VERSION) return { ok: false, code: 'bad_version', message: 'This page is out of date. Reload to continue.' };
  if (m.session) {
    const s = room.sessions.find((x) => x.playerId === m.session!.playerId);
    if (s && sameToken(s.token, m.session.token)) {
      const p = room.players.find((x) => x.id === s.playerId);
      if (p) {
        const wasAway = !p.connected;
        p.connected = true;
        p.lastSeenAt = now;
        s.disconnectedAt = null;
        room.lastActiveAt = now;
        if (wasAway) systemMessage(room, `${p.name} reconnected.`, now);
        return { ok: true, playerId: p.id, token: s.token, resumed: true };
      }
    }
  }
  const observers = room.players.filter((p) => p.role === 'spectator').length;
  const seated = room.players.length - observers;
  if (matchLive(room) && !room.settings.spectatorsAllowed) return { ok: false, code: 'spectators_off', message: 'A match is running and the host has turned spectators off.' };
  if (seated + observers >= LIMITS.playersPerRoom + LIMITS.spectatorsPerRoom || observers >= LIMITS.spectatorsPerRoom) return { ok: false, code: 'room_full', message: 'This room is full.' };
  const { player, session } = addGuest(room, uniqueName(room, m.name), now);
  room.lastActiveAt = now;
  systemMessage(room, matchLive(room) ? `${player.name} joined as an observer.` : `${player.name} joined.`, now);
  return { ok: true, playerId: player.id, token: session.token, resumed: false };
}

function uniqueName(room: ServerRoom, raw: string): string {
  const base = cleanName(raw) || 'Agent';
  const taken = new Set(room.players.map((p) => p.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const n = `${base.slice(0, LIMITS.nameLength - String(i).length - 1)} ${i}`;
    if (!taken.has(n.toLowerCase())) return n;
  }
}

// ---------- Messages ----------
export function handle(room: ServerRoom, by: PlayerId, m: ClientMessage, deps: LiveDeps): Outcome {
  const p = room.players.find((x) => x.id === by);
  if (!p) return fail('kicked', 'You are no longer in this room.', true);
  p.lastSeenAt = deps.now;
  room.lastActiveAt = deps.now;

  switch (m.t) {
    case 'hello':
    case 'ping':
      return done(false);
    case 'start':
    case 'rematch': {
      if (room.host.hostId !== by) return fail('not_allowed', 'Only the host can start.');
      if (m.t === 'rematch' && room.match?.phase !== 'completed') return fail('wrong_phase', 'Finish the current match first.');
      if (m.t === 'rematch' && m.rotate) rotateRoles(room, deps.now);
      if (m.t === 'start' && matchLive(room)) return fail('wrong_phase', 'A match is already running.');
      return start(room, deps);
    }
    case 'to_lobby':
      if (room.host.hostId !== by) return fail('not_allowed', 'Only the host can return the room to the lobby.');
      if (matchLive(room)) return fail('wrong_phase', 'Finish the current match first.');
      room.match = null;
      room.keyHolders = [];
      room.pauseReason = null;
      systemMessage(room, 'Back in the lobby.', deps.now);
      return done();
    case 'seat':
      if (matchLive(room)) return seatMidMatch(room, p, m, deps.now);
      break;
    case 'leave':
      break;
  }

  if (isGameMessage(m)) {
    if ((m.t === 'pause' || m.t === 'resume') && room.pauseReason) {
      if (m.t === 'resume') return fail('not_allowed', `Waiting for a replacement: ${room.pauseReason}`);
    }
    const r = applyGameMessage(room, by, m, deps.now);
    if (!r.ok) return fail(r.code === 'no_match' ? 'wrong_phase' : r.code, r.message);
    if (room.match?.phase === 'completed') room.pauseReason = null;
    return done();
  }

  const r = applyLobby(room, by, m, deps.now, deps.rng());
  if (!r.ok) return fail(r.code, r.message);
  if (r.start) return start(room, deps);
  if (m.t === 'leave') afterDeparture(room, by, deps.now);
  return done();
}

/**
 * Optional role rotation before a new operation. Competitive: in each bureau the handler role passes to
 * the next player (by seat order). Duet: partners swap sides. Observers are unaffected. Safe because
 * the previous match (and its keys) is over: the new match draws new keys.
 */
export function rotateRoles(room: ServerRoom, now: Timestamp) {
  if (kindOf(room.settings) === 'cooperative') {
    for (const p of room.players) if (p.role !== 'spectator' && p.side) p.side = p.side === 'north' ? 'south' : 'north';
    systemMessage(room, 'Partners swapped sides for the new operation.', now);
    return;
  }
  for (const team of TEAMS) {
    const members = room.players.filter((p) => p.team === team && p.role !== 'spectator').sort((a, b) => a.joinedAt - b.joinedAt);
    if (members.length < 2) continue;
    const h = members.findIndex((p) => p.role === 'handler');
    const next = members[(h + 1) % members.length];
    for (const p of members) p.role = p.id === next.id ? 'handler' : 'operative';
  }
  systemMessage(room, 'Handlers rotated for the new operation.', now);
}

function start(room: ServerRoom, deps: LiveDeps): Outcome {
  room.match = null;
  const seed = `crypto:${randomId(16)}`; // audit id only: live keys come from a CSPRNG, not a replayable seed
  const r = startMatch(room, deps.bank, deps.rng(), seed, deps.now);
  if (!r.ok) return fail('not_allowed', r.message);
  // Key holders: competitive handlers; in Duet every seated partner holds their side's key.
  room.keyHolders = room.players.filter((x) => x.role === 'handler' || (x.side && x.role !== 'spectator')).map((x) => x.id);
  room.pauseReason = null;
  return done();
}

/**
 * Seat changes during a match may never hand anyone hidden information they should not have:
 * - anyone may step out to observe;
 * - a vacant handler seat may be taken by an operative of that bureau or an observer (they gain the
 *   key but can no longer guess);
 * - an observer may join a bureau as operative only when it has no connected operative;
 * - anyone who has held a key this match can never become an operative; nobody switches bureaus.
 */
function seatMidMatch(room: ServerRoom, p: Player, m: Extract<ClientMessage, { t: 'seat' }>, now: Timestamp): Outcome {
  if (m.role !== 'spectator' && kindOf(room.settings) === 'cooperative') return seatDuetMidMatch(room, p, m, now);
  if (m.role === 'spectator') {
    if (p.role === 'spectator') return done(false);
    Object.assign(p, { role: 'spectator', team: null, side: null });
    systemMessage(room, `${p.name} stepped out to observe.`, now);
    return done();
  }
  const team = m.team;
  if (!team || !TEAMS.includes(team)) return fail('invalid', 'Pick a bureau.');
  if (p.team && p.team !== team) return fail('not_allowed', 'Nobody switches bureaus during a match.');
  if (m.role === 'handler') {
    const current = room.players.find((x) => x.team === team && x.role === 'handler' && x.id !== p.id);
    if (current && current.connected) return fail('not_allowed', `${TEAM_LABEL[team]} already has a handler.`);
    if (current) Object.assign(current, { role: 'spectator', team: null });
    Object.assign(p, { role: 'handler', team, side: null });
    if (!room.keyHolders.includes(p.id)) room.keyHolders.push(p.id);
    systemMessage(room, `${p.name} took over as ${TEAM_LABEL[team]} handler.`, now);
    return done();
  }
  if (room.keyHolders.includes(p.id)) return fail('not_allowed', 'You have seen the key this match, so you cannot guess.');
  if (p.role === 'operative') return done(false);
  if (room.players.some((x) => x.team === team && x.role === 'operative' && x.connected)) return fail('not_allowed', 'Mid-match, observers can only fill an empty operative seat.');
  Object.assign(p, { role: 'operative', team, side: null });
  systemMessage(room, `${p.name} joined ${TEAM_LABEL[team]} as operative.`, now);
  return done();
}

/**
 * Duet mid-match: a partner may step out to observe; an observer who never held a key may take a side
 * that has no connected partner (gaining that side's key only). Nobody switches sides: that would
 * reveal the second key.
 */
function seatDuetMidMatch(room: ServerRoom, p: Player, m: Extract<ClientMessage, { t: 'seat' }>, now: Timestamp): Outcome {
  const side = m.side;
  if (!side || !DUET_SIDES.includes(side)) return fail('invalid', 'Pick Partner A or Partner B.');
  if (p.side === side && p.role !== 'spectator') return done(false);
  if (room.keyHolders.includes(p.id) || p.side) return fail('not_allowed', 'You have seen a key this match, so you cannot switch sides.');
  if (room.players.some((x) => x.side === side && x.role !== 'spectator' && x.connected)) return fail('not_allowed', 'Mid-match, observers can only fill a side with nobody connected.');
  Object.assign(p, { role: 'operative', side, team: null });
  room.keyHolders.push(p.id);
  systemMessage(room, `${p.name} took over as ${SIDE_LABEL[side]}.`, now);
  return done();
}

// ---------- Connections, grace, pause, expiry ----------
export function disconnected(room: ServerRoom, playerId: PlayerId, now: Timestamp): boolean {
  const p = room.players.find((x) => x.id === playerId);
  const s = room.sessions.find((x) => x.playerId === playerId);
  if (!p || !p.connected) return false;
  p.connected = false;
  p.lastSeenAt = now;
  if (s) s.disconnectedAt = now;
  return true;
}

function afterDeparture(room: ServerRoom, playerId: PlayerId, now: Timestamp) {
  if (!room.players.length) return;
  if (room.host.hostId === playerId || !room.players.some((p) => p.id === room.host.hostId)) migrateHost(room, now);
}

function migrateHost(room: ServerRoom, now: Timestamp): boolean {
  const next = room.players.filter((p) => p.connected).sort((a, b) => a.joinedAt - b.joinedAt)[0];
  if (!next || next.id === room.host.hostId) return false;
  room.host = { hostId: next.id, hostSince: now };
  systemMessage(room, `${next.name} is now the host.`, now);
  return true;
}

/** Which required roles are unavailable right now (connected players only). */
export function missingRoles(room: ServerRoom): string[] {
  if (!matchLive(room)) return [];
  const out: string[] = [];
  if (room.match!.key.kind === 'cooperative') {
    for (const side of DUET_SIDES) if (!room.players.some((p) => p.side === side && p.role !== 'spectator' && p.connected)) out.push(`${SIDE_LABEL[side]} needs a player`);
    return out;
  }
  for (const team of TEAMS as readonly TeamId[]) {
    if (!room.players.some((p) => p.team === team && p.role === 'handler' && p.connected)) out.push(`${TEAM_LABEL[team]} needs a handler`);
    if (!room.players.some((p) => p.team === team && p.role === 'operative' && p.connected)) out.push(`${TEAM_LABEL[team]} needs an operative`);
  }
  return out;
}

const systemActor = { id: 'system', role: 'spectator' as const, team: null, isHost: true };

/**
 * Periodic housekeeping (Durable Object alarm). Returns whether the room changed and when to run next.
 * Order: expiry, disconnect grace (host migration, lobby seat release), auto-pause/resume, timers.
 */
export function housekeeping(room: ServerRoom, now: Timestamp, graceMs: number = RECONNECT_GRACE_MS): { changed: boolean; expired: boolean; next: Timestamp | null } {
  let changed = false;
  const connected = room.players.some((p) => p.connected);
  if (!connected && now - room.lastActiveAt >= ROOM_IDLE_MS) return { changed: false, expired: true, next: null };

  // Grace expired: hand over the host role; in the lobby, free the seat.
  for (const s of room.sessions) {
    if (s.disconnectedAt === null || now - s.disconnectedAt < graceMs) continue;
    if (room.host.hostId === s.playerId) changed = migrateHost(room, now) || changed;
    if (inLobby(room) && !room.match) {
      const p = room.players.find((x) => x.id === s.playerId);
      if (p && p.role !== 'spectator') {
        Object.assign(p, { role: 'spectator', team: null, side: null });
        systemMessage(room, `${p.name}'s seat was released after they disconnected.`, now);
        changed = true;
      }
    }
  }

  // Auto-pause when a required role has been missing past the grace; resume once filled.
  const m = room.match;
  if (m && matchLive(room)) {
    const missing = missingRoles(room);
    const awaySince = Math.max(0, ...room.sessions.filter((s) => s.disconnectedAt !== null).map((s) => s.disconnectedAt!));
    const missingLongEnough = missing.length > 0 && (awaySince === 0 || now - awaySince >= Math.min(AUTO_PAUSE_GRACE_MS, graceMs));
    if (missingLongEnough && m.phase !== 'paused') {
      const r = applyMatchAction(m, systemActor, { type: 'pause' }, { ref: { match: m.id, rev: m.revision }, now, timer: room.settings.timer });
      if (r.ok) {
        room.match = r.state;
        room.pauseReason = missing.join('; ');
        systemMessage(room, `Paused: ${room.pauseReason}.`, now);
        changed = true;
      }
    } else if (missing.length > 0 && room.pauseReason && room.pauseReason !== missing.join('; ')) {
      room.pauseReason = missing.join('; ');
      changed = true;
    } else if (missing.length === 0 && room.pauseReason && m.phase === 'paused') {
      const r = applyMatchAction(m, systemActor, { type: 'resume' }, { ref: { match: m.id, rev: m.revision }, now, timer: room.settings.timer });
      if (r.ok) {
        room.match = r.state;
        room.pauseReason = null;
        systemMessage(room, 'All roles filled. Play resumes.', now);
        changed = true;
      }
    }
  }
  if (tickMatch(room, now).length) changed = true;

  // Next wake-up: the earliest pending deadline.
  const times: Timestamp[] = [];
  for (const s of room.sessions) if (s.disconnectedAt !== null && now - s.disconnectedAt < graceMs) times.push(s.disconnectedAt + graceMs, s.disconnectedAt + Math.min(AUTO_PAUSE_GRACE_MS, graceMs));
  if (room.match?.turn?.deadline) times.push(room.match.turn.deadline);
  if (!room.players.some((p) => p.connected)) times.push(room.lastActiveAt + ROOM_IDLE_MS);
  const future = times.filter((t) => t > now);
  return { changed, expired: false, next: future.length ? Math.min(...future) : null };
}
