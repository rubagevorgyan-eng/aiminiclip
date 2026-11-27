import type { BoardSize, CardIndex, ChatChannel, ClientView, MessageId, Difficulty, DuetSide, ManualLayout, MatchId, ModeId, ModeKind, PlayerId, Role, RoomCode, SessionToken, TeamId, TimerSettings, WordPackId } from '../shared/types.ts';

/** Bump when messages change incompatibly; the server rejects other versions. */
export const PROTOCOL_VERSION = 1;

/** Identifies the match state an action was made against. */
export interface MatchRef { match: MatchId; rev: number }

/** Client -> server. The server validates every field; nothing here is trusted. */
export type ClientMessage =
  | { t: 'hello'; v: number; room: RoomCode; name: string; session?: { playerId: PlayerId; token: SessionToken } }
  | { t: 'rename'; name: string }
  | { t: 'seat'; role: Role; team?: TeamId | null; side?: DuetSide | null }
  | {
      t: 'settings';
      mode?: ModeId; boardSize?: BoardSize; timer?: TimerSettings; spectatorsAllowed?: boolean; startingTeam?: TeamId | 'random';
      wordPacks?: WordPackId[]; difficulty?: Difficulty; moles?: number | null;
      customKind?: ModeKind; manualLayout?: ManualLayout | null; suggestions?: boolean; bonusGuess?: boolean; specialClues?: boolean;
      duetTokens?: number; customWords?: string[];
    }
  | { t: 'shuffle_teams' }
  | { t: 'kick'; player: PlayerId }
  | { t: 'leave' }
  | { t: 'start' }
  // Gameplay messages name the match and the revision they were made against (stale = rejected).
  | ({ t: 'clue'; word: string; count: number | null } & MatchRef)
  | ({ t: 'suggest'; card: CardIndex; on: boolean } & MatchRef)
  | ({ t: 'confirm'; card: CardIndex } & MatchRef)
  | ({ t: 'end_turn' } & MatchRef)
  | ({ t: 'pause' } & MatchRef)
  | ({ t: 'resume' } & MatchRef)
  | { t: 'rematch'; rotate?: boolean }
  | { t: 'to_lobby' }
  | { t: 'transfer_host'; to: PlayerId }
  | { t: 'chat'; text: string; channel?: ChatChannel }
  | { t: 'mute'; player: PlayerId; on: boolean }
  | { t: 'delete_message'; id: MessageId }
  | { t: 'ping'; at?: number };

/** Every client message may carry a client-generated action id; the server ignores repeats. */
export type ClientEnvelope = ClientMessage & { aid?: string };

/** Max accepted message size (bytes) and WebSocket close codes the client maps to room states. */
/** 16 KB: room for a 400-word custom list; every field is still capped individually. */
export const MAX_MESSAGE_BYTES = 16_384;
export const CLOSE = {
  notFound: 4404,
  expired: 4410,
  kicked: 4403,
  full: 4409,
  spectatorsOff: 4402,
  badVersion: 4426,
  rateLimited: 4429,
  helloTimeout: 4408,
  tooBig: 1009,
  invalid: 4400,
} as const;

export type ErrorCode =
  | 'bad_version'
  | 'room_not_found'
  | 'room_expired'
  | 'room_full'
  | 'spectators_off'
  | 'kicked'
  | 'not_allowed'
  | 'invalid'
  | 'rate_limited'
  | 'stale' // action made against an older revision
  | 'wrong_match'
  | 'match_over'
  | 'wrong_phase'
  | 'not_your_turn';

/** Server -> client. `view` is always produced by `projectView` for that client. */
export type ServerMessage =
  | { t: 'welcome'; playerId: PlayerId; token: SessionToken; view: ClientView }
  | { t: 'view'; view: ClientView }
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'pong'; at: number; serverNow: number };
