import { createCompetitiveMatch, type EngineAction, type EngineEvent, type EngineErrorCode } from '../engine/competitive.ts';
import { createDuetMatch } from '../engine/duet.ts';
import { applyMatchAction, expireMatchTurn } from '../engine/match.ts';
import { startBlockers } from '../engine/lobbyRules.ts';
import type { ClientMessage } from '../net/protocol.ts';
import { newMatchId } from '../shared/ids.ts';
import type { Rng } from '../shared/random.ts';
import type { PlayerId, ServerRoom, Timestamp } from '../shared/types.ts';
import { systemMessage } from './lobby.ts';
import { BoardError, generateBoardWords, rememberBoard } from '../vocab/board.ts';
import type { VocabularyBank } from '../vocab/types.ts';
import { customEntries, sanitizeCustomWords } from '../vocab/custom.ts';
import { effectiveSettings } from '../engine/settings.ts';

/**
 * Glue between a room and the competitive engine. Used by the room server (Step 7) and by the
 * dev-only engine harness. Actors are always built from the room's own player records.
 */
export type MatchStart = { ok: true; notes: string[] } | { ok: false; message: string };

/**
 * Starts a competitive match: draws the board from the vocabulary (avoiding the room's recent words),
 * then lets the engine assign identities independently. Production passes `cryptoRng()` and a random
 * audit id as `seed`; tests and the dev harness pass `seededRng(seed)` for reproducible boards.
 */
export function startCompetitiveMatch(room: ServerRoom, bank: VocabularyBank, rng: Rng, seed: string, now: Timestamp): MatchStart {
  return startMatch(room, bank, rng, seed, now);
}

/** Starts a match in the room's mode (Classic / Custom competitive, or Duet). */
export function startMatch(room: ServerRoom, bank: VocabularyBank, rng: Rng, seed: string, now: Timestamp): MatchStart {
  const blockers = startBlockers(room.settings, room.players);
  if (blockers.length) return { ok: false, message: blockers[0] };
  const e = effectiveSettings(room.settings);
  const coop = e.kind === 'cooperative';
  // The room's own list joins the vocabulary only when the Custom list pack is selected.
  const pool: VocabularyBank = e.packs.includes('custom') ? { version: bank.version, entries: [...bank.entries, ...customEntries(sanitizeCustomWords(room.settings.customWords).words)] } : bank;
  let board;
  try {
    board = generateBoardWords(pool, { size: e.size, packs: e.packs, difficulty: e.difficulty, recent: room.recentWordIds }, rng);
  } catch (err) {
    if (err instanceof BoardError) return { ok: false, message: err.message };
    throw err;
  }
  const words = board.entries.map((e) => e.word);
  room.match = coop
    ? createDuetMatch({ id: newMatchId(), words, rng, seed, now, timer: e.timer, rules: e.rules })
    : createCompetitiveMatch({ id: newMatchId(), mode: room.settings.mode, settings: { ...room.settings, boardSize: e.size }, words, rng, seed, now, layout: e.layout!, rules: e.rules });
  room.recentWordIds = rememberBoard(room.recentWordIds, board.entries);
  room.matchCount += 1;
  board.notes.forEach((n) => systemMessage(room, n, now));
  systemMessage(room, `Operation ${room.matchCount} started.`, now);
  return { ok: true, notes: board.notes };
}

type GameMessage = Extract<ClientMessage, { t: 'clue' | 'suggest' | 'confirm' | 'end_turn' | 'pause' | 'resume' }>;
export const isGameMessage = (m: ClientMessage): m is GameMessage => ['clue', 'suggest', 'confirm', 'end_turn', 'pause', 'resume'].includes(m.t);

function toAction(m: GameMessage): EngineAction {
  switch (m.t) {
    case 'clue': return { type: 'clue', word: m.word, count: m.count };
    case 'suggest': return { type: 'suggest', card: m.card, on: m.on === true };
    case 'confirm': return { type: 'guess', card: m.card };
    case 'end_turn': return { type: 'end_turn' };
    case 'pause': return { type: 'pause' };
    case 'resume': return { type: 'resume' };
  }
}

export type GameResult = { ok: true; events: EngineEvent[] } | { ok: false; code: EngineErrorCode | 'no_match'; message: string };

export function applyGameMessage(room: ServerRoom, by: PlayerId, m: GameMessage, now: Timestamp): GameResult {
  if (!room.match) return { ok: false, code: 'no_match', message: 'No match is running.' };
  const p = room.players.find((x) => x.id === by);
  if (!p) return { ok: false, code: 'not_allowed', message: 'You are not in this room.' };
  const actor = { id: p.id, role: p.role, team: p.team, side: p.side, isHost: room.host.hostId === p.id };
  const r = applyMatchAction(room.match, actor, toAction(m), { ref: { match: m.match, rev: m.rev }, now, timer: room.settings.timer });
  if (!r.ok) return r;
  room.match = r.state;
  for (const e of r.events) {
    if (e.type === 'match_ended') systemMessage(room, e.result.outcome.kind === 'team_win' ? `Match over: ${e.result.outcome.team} wins (${e.result.reason.replace(/_/g, ' ')}).` : `Operation ${e.result.outcome.kind === 'cooperative_win' ? 'succeeded' : 'failed'} (${e.result.reason.replace(/_/g, ' ')}).`, now);
    if (e.type === 'sudden_death') systemMessage(room, 'Out of turn tokens: sudden death. No more clues; any wrong guess loses.', now);
  }
  return { ok: true, events: r.events };
}

/** Server clock tick: applies a timer expiry if one is due. */
export function tickMatch(room: ServerRoom, now: Timestamp): EngineEvent[] {
  if (!room.match) return [];
  const r = expireMatchTurn(room.match, now, room.settings.timer);
  if (!r || !r.ok) return [];
  room.match = r.state;
  return r.events;
}
