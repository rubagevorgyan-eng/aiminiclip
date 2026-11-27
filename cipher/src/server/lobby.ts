import { MODES, isModeId } from '../engine/modes/index.ts';
import type { ClientMessage, ErrorCode } from '../net/protocol.ts';
import { startBlockers } from '../engine/lobbyRules.ts';
import { DIFFICULTIES, DUET_SIDES, LIMITS, TEAMS, TEAM_LABEL, WORD_PACKS } from '../shared/config.ts';
import { kindOf, settingValueProblem } from '../engine/settings.ts';
import { writeBlock } from '../engine/chatRules.ts';
import { sanitizeCustomWords } from '../vocab/custom.ts';
import { newMessageId } from '../shared/ids.ts';
import { shuffle, type Rng } from '../shared/random.ts';
import { cleanChat, cleanName } from '../shared/text.ts';
import type { Player, PlayerId, RoomSettings, ServerRoom, Timestamp } from '../shared/types.ts';

/**
 * Lobby rules, run by the room server (and by the dev fixture service). Pure: mutates the given room
 * and returns a result; never trusts the client. Match play is handled by the engine in a later stage.
 */
export type LobbyResult = { ok: true; start?: boolean } | { ok: false; code: ErrorCode; message: string };

const ok: LobbyResult = { ok: true };
const fail = (code: ErrorCode, message: string): LobbyResult => ({ ok: false, code, message });

export const inLobby = (room: ServerRoom) => !room.match || room.match.phase === 'completed';
const isHost = (room: ServerRoom, id: PlayerId) => room.host.hostId === id;

/** Moves seats when the mode kind changes: Crimson <-> Partner A, Cobalt <-> Partner B. */
function convertSeats(room: ServerRoom, from: RoomSettings, to: RoomSettings) {
  const a = kindOf(from), b = kindOf(to);
  if (a === b) return;
  for (const p of room.players) {
    if (p.role === 'spectator') continue;
    if (b === 'cooperative') Object.assign(p, { side: p.team === 'cobalt' ? 'south' : 'north', team: null, role: 'operative' });
    else Object.assign(p, { team: p.side === 'south' ? 'cobalt' : 'crimson', side: null, role: 'operative' });
  }
}

/**
 * Host settings change. Each value is checked; an invalid value is rejected with a clear message rather
 * than clamped. Combinations (e.g. a manual distribution that no longer fits a new board size) are kept
 * as chosen and reported as start blockers, never silently rewritten.
 */
function applySettings(room: ServerRoom, m: Extract<ClientMessage, { t: 'settings' }>): LobbyResult {
  const next: RoomSettings = { ...room.settings, timer: { ...room.settings.timer }, wordPacks: [...room.settings.wordPacks], customWords: [...room.settings.customWords] };
  const bad = (msg: string) => fail('invalid', msg);
  if (m.mode !== undefined) {
    if (!isModeId(m.mode)) return bad('Unknown mode.');
    next.mode = m.mode;
  }
  for (const key of ['boardSize', 'moles', 'duetTokens', 'timer'] as const) {
    if (m[key] === undefined) continue;
    const problem = settingValueProblem(key, m[key]);
    if (problem) return bad(problem);
    if (key === 'timer') next.timer = { clueSeconds: m.timer!.clueSeconds, guessSeconds: m.timer!.guessSeconds };
    else (next as unknown as Record<string, unknown>)[key] = m[key];
  }
  if (m.spectatorsAllowed !== undefined) next.spectatorsAllowed = m.spectatorsAllowed === true;
  for (const key of ['suggestions', 'bonusGuess', 'specialClues'] as const) if (m[key] !== undefined) next[key] = m[key] === true;
  if (m.customKind !== undefined) {
    if (m.customKind !== 'competitive' && m.customKind !== 'cooperative') return bad('Unknown game type.');
    next.customKind = m.customKind;
  }
  if (m.startingTeam !== undefined) {
    if (m.startingTeam !== 'random' && !TEAMS.includes(m.startingTeam)) return bad('Unknown team.');
    next.startingTeam = m.startingTeam;
  }
  if (m.wordPacks !== undefined) {
    if (!Array.isArray(m.wordPacks) || m.wordPacks.some((id) => id !== 'custom' && !WORD_PACKS.some((p) => p.id === id))) return bad('Unknown word pack.');
    next.wordPacks = [...new Set(m.wordPacks)];
  }
  if (m.difficulty !== undefined) {
    if (!DIFFICULTIES.some((d) => d.id === m.difficulty)) return bad('Unknown difficulty.');
    next.difficulty = m.difficulty;
  }
  if (m.manualLayout !== undefined) {
    const ml = m.manualLayout;
    if (ml !== null && ![ml.starting, ml.second, ml.civilians, ml.moles].every((n) => Number.isInteger(n) && n >= 0 && n <= 100)) return bad('Card counts must be whole numbers from 0 to 100.');
    next.manualLayout = ml === null ? null : { starting: ml.starting, second: ml.second, civilians: ml.civilians, moles: ml.moles };
  }
  if (m.customWords !== undefined) {
    if (!Array.isArray(m.customWords)) return bad('Custom words must be a list.');
    next.customWords = sanitizeCustomWords(m.customWords).words;
  }
  const normalized = MODES[next.mode].normalizeSettings(next);
  convertSeats(room, room.settings, normalized);
  room.settings = normalized;
  return ok;
}

function seat(room: ServerRoom, p: Player, m: Extract<ClientMessage, { t: 'seat' }>): LobbyResult {
  if (m.role === 'spectator') {
    if (!room.settings.spectatorsAllowed && !isHost(room, p.id)) return fail('spectators_off', 'The host has turned spectators off.');
    Object.assign(p, { role: 'spectator', team: null, side: null });
    return ok;
  }
  if (kindOf(room.settings) === 'cooperative') {
    if (!m.side || !DUET_SIDES.includes(m.side)) return fail('invalid', 'Pick Partner A or Partner B.');
    Object.assign(p, { role: 'operative', side: m.side, team: null });
    return ok;
  }
  if (!m.team || !TEAMS.includes(m.team)) return fail('invalid', 'Pick a team.');
  if (m.role !== 'handler' && m.role !== 'operative') return fail('invalid', 'Unknown role.');
  if (m.role === 'handler' && room.players.some((o) => o.id !== p.id && o.team === m.team && o.role === 'handler'))
    return fail('not_allowed', `${TEAM_LABEL[m.team]} already has a handler.`);
  Object.assign(p, { role: m.role, team: m.team, side: null });
  return ok;
}

/** Shuffles everyone seated (not spectators) into balanced teams; the first of each team becomes handler. */
export function shuffleTeams(room: ServerRoom, rng: Rng) {
  const seated = shuffle(room.players.filter((p) => p.role !== 'spectator'), rng);
  const coop = kindOf(room.settings) === 'cooperative';
  seated.forEach((p, i) => {
    if (coop) Object.assign(p, { side: i % 2 ? 'south' : 'north', team: null, role: 'operative' });
    else Object.assign(p, { team: TEAMS[i % 2], side: null, role: i < 2 ? 'handler' : 'operative' });
  });
}

export function systemMessage(room: ServerRoom, text: string, now: Timestamp) {
  room.chat.push({ id: newMessageId(), kind: 'system', channel: 'system', by: null, name: 'System', text, at: now });
  if (room.chat.length > LIMITS.chatHistory) room.chat.splice(0, room.chat.length - LIMITS.chatHistory);
}

/** Applies one lobby message from `by`. Returns `start: true` when the host may start the match. */
export function applyLobby(room: ServerRoom, by: PlayerId, m: ClientMessage, now: Timestamp, rng: Rng): LobbyResult {
  const p = room.players.find((x) => x.id === by);
  if (!p) return fail('not_allowed', 'You are not in this room.');
  p.lastSeenAt = now;
  const host = isHost(room, by);
  const lobbyOnly = ['seat', 'settings', 'shuffle_teams', 'kick', 'start'];
  if (lobbyOnly.includes(m.t) && !inLobby(room)) return fail('not_allowed', 'The match has already started.');

  switch (m.t) {
    case 'rename': {
      const name = cleanName(m.name);
      if (!name) return fail('invalid', 'Enter a name.');
      p.name = name;
      return ok;
    }
    case 'seat':
      return seat(room, p, m);
    case 'chat': {
      const channel = m.channel ?? 'global';
      const block = writeBlock({ settings: room.settings, match: room.match }, p, channel);
      if (block) return fail('not_allowed', block);
      const text = cleanChat(m.text);
      if (!text) return fail('invalid', 'Message is empty.');
      room.chat.push({ id: newMessageId(), kind: 'player', channel, by, name: p.name, tone: p.team ?? p.side ?? null, text, at: now });
      if (room.chat.length > LIMITS.chatHistory) room.chat.splice(0, room.chat.length - LIMITS.chatHistory);
      return ok;
    }
    case 'mute': {
      if (!host) return fail('not_allowed', 'Only the host can mute players.');
      const target = room.players.find((x) => x.id === m.player);
      if (!target || target.id === by) return fail('invalid', 'Pick another player.');
      target.muted = m.on === true;
      systemMessage(room, `${target.name} was ${target.muted ? 'muted' : 'unmuted'} by the host.`, now);
      return ok;
    }
    case 'delete_message': {
      if (!host) return fail('not_allowed', 'Only the host can remove messages.');
      const i = room.chat.findIndex((c) => c.id === m.id && c.kind === 'player');
      if (i < 0) return fail('invalid', 'That message is already gone.');
      room.chat.splice(i, 1);
      return ok;
    }
    case 'settings':
      return host ? applySettings(room, m) : fail('not_allowed', 'Only the host can change settings.');
    case 'shuffle_teams':
      if (!host) return fail('not_allowed', 'Only the host can shuffle teams.');
      shuffleTeams(room, rng);
      systemMessage(room, 'The host shuffled the teams.', now);
      return ok;
    case 'kick': {
      if (!host) return fail('not_allowed', 'Only the host can remove players.');
      if (m.player === by) return fail('invalid', 'You cannot remove yourself.');
      const target = room.players.find((x) => x.id === m.player);
      if (!target) return fail('invalid', 'That player already left.');
      room.players = room.players.filter((x) => x.id !== target.id);
      room.sessions = room.sessions.filter((s) => s.playerId !== target.id);
      systemMessage(room, `${target.name} was removed by the host.`, now);
      return ok;
    }
    case 'transfer_host': {
      if (!host) return fail('not_allowed', 'Only the host can hand over the room.');
      const target = room.players.find((x) => x.id === m.to);
      if (!target) return fail('invalid', 'That player already left.');
      room.host = { hostId: target.id, hostSince: now };
      systemMessage(room, `${target.name} is now the host.`, now);
      return ok;
    }
    case 'leave': {
      room.players = room.players.filter((x) => x.id !== by);
      room.sessions = room.sessions.filter((s) => s.playerId !== by);
      systemMessage(room, `${p.name} left the room.`, now);
      if (host && room.players.length) {
        const next = [...room.players].sort((x, y) => Number(y.connected) - Number(x.connected) || x.joinedAt - y.joinedAt)[0];
        room.host = { hostId: next.id, hostSince: now };
        systemMessage(room, `${next.name} is now the host.`, now);
      }
      return ok;
    }
    case 'start': {
      if (!host) return fail('not_allowed', 'Only the host can start.');
      const blockers = startBlockers(room.settings, room.players);
      return blockers.length ? fail('not_allowed', blockers[0]) : { ok: true, start: true };
    }
    default:
      return fail('invalid', 'Not available in the lobby.');
  }
}
