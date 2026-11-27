import type { BoardSize, Difficulty, DuetIdentity, DuetSide, ModeId, RoomSettings, TeamId, TimerSettings, VocabCategory } from './types.ts';

/** Brand strings and links. CIPHER is a Recess game served at /games/cipher/. */
export const BRAND = {
  name: 'CIPHER',
  parent: 'Recess',
  tagline: 'Trust your team. Question every word.',
  siteUrl: '/',
  slug: 'cipher',
} as const;

export const BOARD_SIZES: readonly BoardSize[] = [5, 6, 7, 8, 9, 10];
export const DEFAULT_BOARD_SIZE: BoardSize = 5;

export const TEAMS: readonly TeamId[] = ['crimson', 'cobalt'];
export const TEAM_LABEL: Record<TeamId, string> = { crimson: 'Crimson Bureau', cobalt: 'Cobalt Bureau' };
export const DUET_SIDES: readonly DuetSide[] = ['north', 'south'];
export const SIDE_LABEL: Record<DuetSide, string> = { north: 'Partner A', south: 'Partner B' };

/** Competitive card layout for one board size: our own scaling, the same formula for every size. */
export interface CompetitiveLayout {
  cards: number;
  starting: number; // agents for the team that moves first
  second: number;
  civilians: number;
  moles: number;
}

/**
 * Cipher board balance (configurable, tested). For S×S cards and A moles:
 *   opposing agents = floor((S² − A) × agentPercent / 100); starting agents = opposing + 1; civilians = the rest.
 * With one mole: 5×5 9/8/7, 6×6 13/12/10, 7×7 17/16/15, 8×8 23/22/18, 9×9 29/28/23, 10×10 35/34/30.
 * Sizes above 5×5 are proposed Cipher balance rules.
 */
export const BOARD_BALANCE = {
  /** Integer percent to avoid floating-point surprises. */
  agentPercent: 35,
  /** Moles when the room does not choose (Classic always uses this). */
  standardMoles: 1,
} as const;

/** `moles` overrides the standard count (Custom); it is clamped to `moleRange(size)`. */
export function competitiveLayout(size: BoardSize, moles: number | null = null, balance: { agentPercent: number } = BOARD_BALANCE): CompetitiveLayout {
  const cards = size * size;
  const range = moleRange(size);
  const m = moles === null ? range.standard : Math.min(range.max, Math.max(range.min, moles));
  const second = Math.floor(((cards - m) * balance.agentPercent) / 100);
  const starting = second + 1;
  return { cards, starting, second, moles: m, civilians: cards - starting - second - m };
}

/** Allowed moles (assassins) in Custom: 1 to 5 on every board size; Classic always uses 1. */
export function moleRange(_size?: BoardSize) {
  return { min: 1, max: 5, standard: BOARD_BALANCE.standardMoles };
}

/** Custom cooperative turn-token budgets (Duet structure is fixed at 5×5). */
export const DUET_TOKEN_CHOICES: readonly number[] = [9, 10, 11];

/** Custom word lists: limits applied on client and server. */
export const CUSTOM_WORDS = { maxWords: 400, minLength: 2, maxLength: 16 } as const;

/**
 * Word packs = vocabulary categories (src/vocab). Classic and Duet draw from the general-interest
 * packs; Custom may add Advanced and the specialized entertainment packs. `target` is the curation goal,
 * not the imported count (see src/vocab/data/summary.json for actual counts).
 */
export const WORD_PACKS: readonly { id: VocabCategory; label: string; blurb: string; target: number; standard: boolean }[] = [
  { id: 'general', label: 'Field Manual', blurb: 'Everyday words and ideas', target: 4000, standard: true },
  { id: 'objects', label: 'Equipment', blurb: 'Objects and occupations', target: 1000, standard: true },
  { id: 'nature', label: 'Wilderness', blurb: 'Animals and nature', target: 800, standard: true },
  { id: 'geography', label: 'Atlas', blurb: 'Places and terrain', target: 700, standard: true },
  { id: 'science_history', label: 'Archive', blurb: 'Science and history', target: 700, standard: true },
  { id: 'advanced', label: 'Cryptic', blurb: 'Advanced vocabulary', target: 1000, standard: false },
  { id: 'anime', label: 'Anime & Manga', blurb: 'Series, characters and terms', target: 600, standard: false },
  { id: 'gaming', label: 'Gaming', blurb: 'Games, characters and terms', target: 600, standard: false },
  { id: 'entertainment', label: 'Screen', blurb: 'Movies, TV and entertainment', target: 600, standard: false },
];
export const DEFAULT_PACKS: VocabCategory[] = WORD_PACKS.filter((p) => p.standard).map((p) => p.id);

/** Share of easy / medium / hard words on a board, in percent. */
export const DIFFICULTIES: readonly { id: Difficulty; label: string; blurb: string; mix: { easy: number; medium: number; hard: number } }[] = [
  { id: 'easy', label: 'Easy', blurb: '80% easy, 20% medium', mix: { easy: 80, medium: 20, hard: 0 } },
  { id: 'balanced', label: 'Balanced', blurb: '40% easy, 48% medium, 12% hard', mix: { easy: 40, medium: 48, hard: 12 } },
  { id: 'hard', label: 'Hard', blurb: '20% easy, 40% medium, 40% hard', mix: { easy: 20, medium: 40, hard: 40 } },
  { id: 'expert', label: 'Expert', blurb: '40% medium, 60% hard', mix: { easy: 0, medium: 40, hard: 60 } },
];
export const DEFAULT_DIFFICULTY: Difficulty = 'balanced';

/**
 * Duet (5×5): each side's private key has 9 agents, 13 civilians and 3 moles; exactly 3 agents are
 * shared, so 15 distinct agents must be found. `pairs` is the exact (A, B) identity distribution,
 * shuffled onto the board independently of the words.
 */
export const DUET = {
  size: 5 as BoardSize,
  agentsPerSide: 9,
  civiliansPerSide: 13,
  sharedAgents: 3,
  molesPerSide: 3,
  /** Turn tokens: one is used each time a turn ends. When none remain, sudden death. */
  turns: 9,
  pairs: [
    ['agent', 'agent', 3],
    ['agent', 'civilian', 5],
    ['agent', 'mole', 1],
    ['civilian', 'agent', 5],
    ['civilian', 'civilian', 7],
    ['civilian', 'mole', 1],
    ['mole', 'agent', 1],
    ['mole', 'civilian', 1],
    ['mole', 'mole', 1],
  ] as const satisfies readonly (readonly [DuetIdentity, DuetIdentity, number])[],
} as const;

/** Total distinct agents both players must find in Duet. */
export const duetAgentTotal = () => DUET.agentsPerSide * 2 - DUET.sharedAgents;

export const UNLIMITED_TIMER: TimerSettings = { clueSeconds: null, guessSeconds: null };
/** Optional limits offered in the room settings (seconds). `null` = unlimited. */
export const TIMER_CHOICES: readonly (number | null)[] = [null, 30, 60, 90, 120];

const BASE_SETTINGS = {
  boardSize: 5, timer: UNLIMITED_TIMER, spectatorsAllowed: true, startingTeam: 'random', difficulty: DEFAULT_DIFFICULTY, moles: null,
  customKind: 'competitive', manualLayout: null, suggestions: true, bonusGuess: true, specialClues: true, duetTokens: 9,
} as const;
const fresh = (mode: ModeId): RoomSettings => ({ ...BASE_SETTINGS, mode, timer: { ...UNLIMITED_TIMER }, wordPacks: [...DEFAULT_PACKS], customWords: [] });
export const DEFAULT_SETTINGS: Record<ModeId, RoomSettings> = { classic: fresh('classic'), duet: fresh('duet'), custom: fresh('custom') };

/** Guesses allowed for a clue of `count` (null/0 = unlimited); `bonus` adds the extra guess. */
export const guessesFor = (count: number | null, bonus = true): number | null => (count === null || count === 0 ? null : count + (bonus ? 1 : 0));

export const ROOM_CODE = {
  length: 5,
  /** No I, O, 0, 1 to avoid misreads. */
  alphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
} as const;

export const LIMITS = {
  nameLength: 20,
  clueLength: 24,
  chatLength: 280,
  chatHistory: 200,
  /** Chat messages per player per window. */
  chatBurst: 5,
  chatWindowMs: 10_000,
  playersPerRoom: 24,
  spectatorsPerRoom: 50,
} as const;

/** How long a dropped player's seat (and host role) is held. */
export const RECONNECT_GRACE_MS = 120_000;
/** Rooms with nobody connected are discarded after this. */
export const ROOM_IDLE_MS = 30 * 60_000;

export const STORAGE_KEYS = {
  name: 'cipher.name.v1',
  /** Map of room code -> { playerId, token } for reconnecting. */
  sessions: 'cipher.sessions.v1',
  settings: 'cipher.settings.v1',
  /** Dev fixture rooms (development builds only, sessionStorage). */
  devRooms: 'cipher.dev.rooms.v1',
} as const;
