import { isBoardSize } from '../shared/board.ts';
import { CUSTOM_WORDS, LIMITS } from '../shared/config.ts';
import { MAX_MESSAGE_BYTES, type ClientEnvelope } from './protocol.ts';

/**
 * Strict shape check for client messages (server side). Anything malformed returns null and is
 * rejected before it reaches room logic. Values are still re-validated by the lobby rules and engine.
 */
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const int = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const oneOf = <T extends string>(v: unknown, xs: readonly T[]): v is T => typeof v === 'string' && (xs as readonly string[]).includes(v);
const id = (v: unknown) => str(v, 40) && /^[a-z]_[a-z0-9]{6,32}$/.test(v as string);
const ref = (m: Record<string, unknown>) => id(m.match) && int(m.rev, 0, 1_000_000);
const opt = (v: unknown, check: (x: unknown) => boolean) => v === undefined || check(v);

export function parseClientMessage(raw: string | ArrayBuffer): ClientEnvelope | null {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) return null;
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string') return null;
  if (!opt(m.aid, (a) => str(a, 40))) return null;
  const ok = (() => {
    switch (m.t) {
      case 'hello':
        return int(m.v, 0, 1000) && str(m.room, 8) && str(m.name, 64) &&
          opt(m.session, (s) => !!s && typeof s === 'object' && id((s as Record<string, unknown>).playerId) && str((s as Record<string, unknown>).token, 64));
      case 'rename':
        return str(m.name, 64);
      case 'seat':
        return oneOf(m.role, ['handler', 'operative', 'spectator'] as const) && opt(m.team, (t) => t === null || oneOf(t, ['crimson', 'cobalt'] as const)) && opt(m.side, (s) => s === null || oneOf(s, ['north', 'south'] as const));
      case 'settings':
        return opt(m.mode, (x) => oneOf(x, ['classic', 'duet', 'custom'] as const)) &&
          opt(m.boardSize, isBoardSize) &&
          opt(m.timer, (x) => !!x && typeof x === 'object' && [(x as Record<string, unknown>).clueSeconds, (x as Record<string, unknown>).guessSeconds].every((s) => s === null || int(s, 1, 3600))) &&
          opt(m.spectatorsAllowed, (x) => typeof x === 'boolean') &&
          opt(m.startingTeam, (x) => oneOf(x, ['random', 'crimson', 'cobalt'] as const)) &&
          opt(m.wordPacks, (x) => Array.isArray(x) && x.length <= 20 && x.every((p) => str(p, 32))) &&
          opt(m.difficulty, (x) => oneOf(x, ['easy', 'balanced', 'hard', 'expert'] as const)) &&
          opt(m.moles, (x) => x === null || int(x, 0, 100)) &&
          opt(m.customKind, (x) => oneOf(x, ['competitive', 'cooperative'] as const)) &&
          opt(m.manualLayout, (x) => x === null || (!!x && typeof x === 'object' && ['starting', 'second', 'civilians', 'moles'].every((k) => int((x as Record<string, unknown>)[k], 0, 100)))) &&
          opt(m.suggestions, (x) => typeof x === 'boolean') &&
          opt(m.bonusGuess, (x) => typeof x === 'boolean') &&
          opt(m.specialClues, (x) => typeof x === 'boolean') &&
          opt(m.duetTokens, (x) => int(x, 1, 99)) &&
          opt(m.customWords, (x) => Array.isArray(x) && x.length <= CUSTOM_WORDS.maxWords * 2 && x.every((w) => str(w, 64)));
      case 'shuffle_teams': case 'leave': case 'start': case 'to_lobby':
        return true;
      case 'rematch':
        return opt(m.rotate, (x) => typeof x === 'boolean');
      case 'kick':
        return id(m.player);
      case 'transfer_host':
        return id(m.to);
      case 'chat':
        return str(m.text, LIMITS.chatLength * 2) && opt(m.channel, (c) => oneOf(c, ['global', 'team:crimson', 'team:cobalt', 'side:north', 'side:south', 'spectators', 'system'] as const));
      case 'mute':
        return id(m.player) && typeof m.on === 'boolean';
      case 'delete_message':
        return id(m.id);
      case 'ping':
        return opt(m.at, (x) => typeof x === 'number');
      case 'clue':
        return ref(m) && str(m.word, 64) && (m.count === null || int(m.count, 0, 99));
      case 'suggest':
        return ref(m) && int(m.card, 0, 99) && typeof m.on === 'boolean';
      case 'confirm':
        return ref(m) && int(m.card, 0, 99);
      case 'end_turn': case 'pause': case 'resume':
        return ref(m);
      default:
        return false;
    }
  })();
  return ok ? (m as unknown as ClientEnvelope) : null;
}
