/**
 * Cipher data models shared by the room server and the client.
 *
 * Naming: a *handler* gives clues (sees the key), *operatives* guess, *spectators* watch.
 * Card identities: team agents, *civilians* (neutral) and *moles* (instant loss when revealed).
 *
 * Security boundary: everything named `Private*` / `Server*` stays on the server.
 * Clients only ever receive a `ClientView` built by `engine/projection.ts`.
 */

// ---------- Identifiers ----------
export type PlayerId = string; // public, random, stable for a guest session
export type SessionToken = string; // secret, proves ownership of a PlayerId on reconnect
export type RoomCode = string; // short code typed by players, see config ROOM_CODE
export type MatchId = string; // unique per match, a rematch gets a new one
export type MessageId = string;
export type Timestamp = number; // ms since epoch, always server time

// ---------- Modes, teams, roles ----------
export type ModeId = 'classic' | 'duet' | 'custom';
export type ModeKind = 'competitive' | 'cooperative';
export type TeamId = 'crimson' | 'cobalt';
/** Duet: each of the two players holds one side of the key. */
export type DuetSide = 'north' | 'south';
export type Role = 'handler' | 'operative' | 'spectator';

// ---------- Board ----------
export type BoardSize = 5 | 6 | 7 | 8 | 9 | 10;
export interface BoardDimensions {
  size: BoardSize;
  rows: number;
  cols: number;
  cards: number;
}
export type CardIndex = number; // row-major, 0 .. cards-1

/** Competitive identities. */
export type CompetitiveIdentity = TeamId | 'civilian' | 'mole';
/** One side of a Duet key. */
export type DuetIdentity = 'agent' | 'civilian' | 'mole';

/** Server only: full answer for every card. */
export type SecretKey =
  | { kind: 'competitive'; identities: CompetitiveIdentity[] }
  | { kind: 'cooperative'; sides: Record<DuetSide, DuetIdentity[]> };

/** What a card publicly turned out to be once revealed. */
export type RevealedIdentity =
  | { kind: 'competitive'; identity: CompetitiveIdentity }
  /** Duet reveals are judged against the clue giver's side. `agent` cards count for both sides. */
  | { kind: 'cooperative'; identity: DuetIdentity; judgedBy: DuetSide };

export interface PortraitRef {
  /** Deterministic portrait seed, only ever sent with a revealed card. */
  seed: number;
}

export interface CardReveal {
  identity: RevealedIdentity;
  portrait: PortraitRef | null; // null for civilians if the art set has none
  by: PlayerId | null; // null when revealed by the system (e.g. end of match)
  turn: number;
  at: Timestamp;
}

/** Public card: the word, plus its identity only after it has been revealed. */
export interface PublicCard {
  index: CardIndex;
  word: string;
  reveal: CardReveal | null;
  /**
   * Duet only: a card can be "civilian" for one side and still hidden for the other side.
   * Lists the sides for which it was revealed as a civilian.
   */
  civilianFor?: DuetSide[];
}

// ---------- Players and sessions ----------
export interface Player {
  id: PlayerId;
  name: string;
  team: TeamId | null; // null for spectators and in Duet
  side: DuetSide | null; // Duet only
  role: Role;
  connected: boolean;
  joinedAt: Timestamp;
  lastSeenAt: Timestamp;
  /** Host moderation: muted players cannot send chat. */
  muted?: boolean;
}

/** Server only: a guest session. No registration: the token is kept in the guest's localStorage. */
export interface GuestSession {
  playerId: PlayerId;
  token: SessionToken;
  roomCode: RoomCode;
  createdAt: Timestamp;
  /** Set when the socket drops; the seat is held until `disconnectedAt + RECONNECT_GRACE_MS`. */
  disconnectedAt: Timestamp | null;
}

// ---------- Room ----------
export interface TimerSettings {
  /** null = unlimited (default). */
  clueSeconds: number | null;
  guessSeconds: number | null;
}

export type Difficulty = 'easy' | 'balanced' | 'hard' | 'expert';
/** Vocabulary categories; each is also a word pack. */
export type VocabCategory = 'general' | 'objects' | 'advanced' | 'nature' | 'geography' | 'science_history' | 'anime' | 'gaming' | 'entertainment';
/** A word pack: a vocabulary category, or the room's own imported list. */
export type WordPackId = VocabCategory | 'custom';

/** Custom competitive: an explicit card distribution (replaces the balanced formula). */
export interface ManualLayout { starting: number; second: number; civilians: number; moles: number }

/** Rule switches a match runs with (fixed for Classic and Duet, chosen in Custom). Public. */
export interface MatchRules {
  suggestions: boolean;
  /** Competitive: one extra guess beyond the clue number. */
  bonusGuess: boolean;
  /** Competitive: allow 0 and unlimited clues. */
  specialClues: boolean;
  /** Cooperative: turn tokens. */
  tokens: number;
}

export interface RoomSettings {
  mode: ModeId;
  boardSize: BoardSize;
  timer: TimerSettings;
  spectatorsAllowed: boolean;
  /** Competitive only. */
  startingTeam: TeamId | 'random';
  /** Vocabulary packs to draw from (at least one). Classic and Duet use the defaults. */
  wordPacks: WordPackId[];
  difficulty: Difficulty;
  /** Competitive: moles on the board. null = the standard count for the board size. */
  moles: number | null;
  /** Custom only: competitive (Classic engine) or cooperative (Duet engine, 5×5). */
  customKind: ModeKind;
  /** Custom competitive: manual distribution; null = balanced automatically. */
  manualLayout: ManualLayout | null;
  suggestions: boolean;
  bonusGuess: boolean;
  specialClues: boolean;
  /** Custom cooperative: 9, 10 or 11. */
  duetTokens: number;
  /** Custom word list (sanitized server-side); used when the 'custom' pack is selected. */
  customWords: string[];
}

export interface HostState {
  hostId: PlayerId;
  /** If the host stays disconnected past the grace period, ownership moves to the longest-seated connected player. */
  hostSince: Timestamp;
}

// ---------- Turn, clues, guesses ----------
export type MatchPhase = 'lobby' | 'awaiting_clue' | 'guessing' | 'sudden_death' | 'paused' | 'completed';

/** Who acts this turn: a team (competitive) or the side giving the clue (Duet). */
export type TurnOwner = { kind: 'team'; team: TeamId } | { kind: 'side'; side: DuetSide };

/** `null` count = unlimited guesses, `0` = "zero" clue (unlimited guesses in most house rules). */
export interface Clue {
  word: string;
  count: number | null;
  owner: TurnOwner;
  by: PlayerId;
  turn: number;
  at: Timestamp;
}

export interface GuessRecord {
  card: CardIndex;
  owner: TurnOwner;
  by: PlayerId;
  turn: number;
  at: Timestamp;
  result: RevealedIdentity;
}

export type HistoryEntry =
  | { type: 'clue'; clue: Clue }
  | { type: 'guess'; guess: GuessRecord }
  | { type: 'end_turn'; owner: TurnOwner; by: PlayerId | null; turn: number; at: Timestamp; reason: 'voluntary' | 'wrong_guess' | 'limit' | 'timeout' };

export interface TurnState {
  number: number; // 1-based
  owner: TurnOwner;
  clue: Clue | null;
  guessesMade: number;
  /** null = unlimited. Derived from the clue (count + 1 by default, see config). */
  guessesAllowed: number | null;
  /** null when the timer is unlimited or the match is paused. */
  deadline: Timestamp | null;
  /** Duet: turns left before sudden death. */
  turnsLeft?: number;
  /** Revision at which the current guessing phase began: suggestions made since then stay valid. */
  sinceRev?: number;
}

export interface Suggestion {
  card: CardIndex;
  by: PlayerId;
  owner: TurnOwner; // suggestions belong to the team/side currently guessing
  at: Timestamp;
}

// ---------- Chat ----------
/**
 * Chat channels. `global`: everyone in the room. `team:*` / `side:*`: members of that bureau or Duet side.
 * `spectators`: observers only. `system`: automated room log (joins, starts, moderation).
 */
export type ChatChannel = 'global' | 'team:crimson' | 'team:cobalt' | 'side:north' | 'side:south' | 'spectators' | 'system';

export interface ChatMessage {
  id: MessageId;
  kind: 'player' | 'system';
  channel: ChatChannel;
  by: PlayerId | null;
  name: string; // copied at send time so history reads correctly after renames
  /** Sender's team or side at send time (for colors). */
  tone?: TeamId | DuetSide | null;
  text: string;
  at: Timestamp;
}

// ---------- Results ----------
export type ResultReason =
  | 'all_agents_found' // competitive: a team found all its agents; Duet: all agents found
  | 'mole_revealed'
  | 'turns_exhausted' // Duet: sudden death failed
  | 'abandoned';

export interface MatchResult {
  /** Competitive: the winning team. Duet: 'cooperative_win' or 'cooperative_loss'. */
  outcome: { kind: 'team_win'; team: TeamId } | { kind: 'cooperative_win' } | { kind: 'cooperative_loss' };
  reason: ResultReason;
  turns: number;
  startedAt: Timestamp;
  completedAt: Timestamp;
  stats: MatchStats;
}

/** Per-match statistics, computed by the engine from its own history. */
export interface TeamStats {
  clues: number;
  guesses: number;
  correct: number; // own agents found
  enemy: number; // rival agents revealed
  civilians: number;
  moles: number;
}
export interface MatchStats {
  teams: Partial<Record<TeamId, TeamStats>>;
  players: Record<PlayerId, { guesses: number; correct: number }>;
  /** Duet only. */
  cooperative?: { agentsFound: number; agentsTotal: number; tokensUsed: number; tokensTotal: number; civilianHits: number; suddenDeath: boolean };
}

// ---------- Match state: private (server) vs public (client) ----------
interface MatchCommon {
  id: MatchId;
  /** Increments on every accepted action. Actions must name the revision they were made against. */
  revision: number;
  rules: MatchRules;
  mode: ModeId;
  dimensions: BoardDimensions;
  phase: MatchPhase;
  /** Phase to return to when `phase === 'paused'`. */
  resumePhase: MatchPhase | null;
  turn: TurnState | null;
  history: HistoryEntry[];
  suggestions: Suggestion[];
  /** Competitive: the team that moved first (it has one more agent). */
  startingTeam: TeamId | null;
  /** Duet: sides whose own agents are all found; they no longer give clues (public, as at the table). */
  sidesDone?: DuetSide[];
  /** Agents still hidden per team/side. Public in every mode. */
  remaining: Partial<Record<TeamId | DuetSide | 'agents', number>>;
  result: MatchResult | null;
  startedAt: Timestamp;
}

/** Server only. Never serialize to a client. */
export interface PrivateMatchState extends MatchCommon {
  seed: string;
  words: string[];
  key: SecretKey;
  /** Portrait seed per card; copied into `CardReveal.portrait` only when the card is revealed. */
  portraits: number[];
  reveals: (CardReveal | null)[];
  civilianFor: DuetSide[][];
}

/** Safe for every client in the room. */
export interface PublicMatchState extends MatchCommon {
  cards: PublicCard[];
  /** Present only when `phase === 'completed'`: the whole key is declassified at the end. */
  declassified: SecretKey | null;
}

/** Server only: everything a room object holds. */
export interface ServerRoom {
  code: RoomCode;
  createdAt: Timestamp;
  settings: RoomSettings;
  host: HostState;
  players: Player[];
  sessions: GuestSession[];
  chat: ChatMessage[];
  match: PrivateMatchState | null;
  matchCount: number;
  /** Vocabulary ids used on recent boards, newest last; the generator avoids them. */
  recentWordIds: string[];
  /** Players who have held a key this match (handlers). They may never become operatives until it ends. */
  keyHolders: PlayerId[];
  /** Set when the server paused play because a required role is missing (null = not auto-paused). */
  pauseReason: string | null;
  /** Last time anyone was connected (for expiry). */
  lastActiveAt: Timestamp;
}

/** Safe for every client in the room. */
export interface PublicRoom {
  code: RoomCode;
  settings: RoomSettings;
  host: HostState;
  players: Player[];
  chat: ChatMessage[];
  matchCount: number;
  pauseReason: string | null;
  /** Player ids who held a key this match (public: it only says who, never what). */
  keyHolders: PlayerId[];
}

/** Key material a specific viewer is allowed to see. */
export type KeyView =
  | { kind: 'competitive'; identities: CompetitiveIdentity[] } // handlers
  | { kind: 'cooperative'; side: DuetSide; identities: DuetIdentity[] }; // a Duet player's own side

/** Everything one client receives. Built only by `projectView`. */
export interface ClientView {
  you: PlayerId;
  /** Server clock when this view was built: clients show countdowns against it; the server enforces them. */
  serverNow?: Timestamp;
  room: PublicRoom;
  match: PublicMatchState | null;
  key: KeyView | null;
}
