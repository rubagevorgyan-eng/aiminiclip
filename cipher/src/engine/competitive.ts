/**
 * Deterministic competitive engine (Classic; Custom reuses it with its board size and mole count).
 *
 * Pure functions over `PrivateMatchState`: no UI, no networking, no clocks or randomness of its own
 * (time is passed in, randomness is an injected `Rng`). Every action is validated against the match id,
 * revision, phase, role and active team. Accepted actions return a new state (inputs are never mutated)
 * plus events for presentation. Animations consume events; they can never change state or validity.
 */
import { dimensions } from '../shared/board.ts';
import { TEAMS, competitiveLayout, guessesFor, type CompetitiveLayout } from '../shared/config.ts';
import { shuffle, type Rng } from '../shared/random.ts';
import { wordKey } from '../shared/text.ts';
import type {
  BoardSize, CardIndex, CardReveal, Clue, CompetitiveIdentity, DuetSide, HistoryEntry, MatchId, MatchRules, MatchResult, MatchStats, ModeId,
  Player, PlayerId, PrivateMatchState, RevealedIdentity, RoomSettings, TeamId, TeamStats, Timestamp, TurnOwner,
} from '../shared/types.ts';
import { validateClue, type ClueCount } from './clues.ts';

// ---------- Actions, actors, results ----------
export type EngineAction =
  | { type: 'clue'; word: string; count: ClueCount }
  | { type: 'suggest'; card: CardIndex; on: boolean }
  | { type: 'guess'; card: CardIndex }
  | { type: 'end_turn' }
  | { type: 'pause' }
  | { type: 'resume' };

/** Who acts. Built by the server from its own room state, never from client claims. */
export interface Actor {
  id: PlayerId;
  role: Player['role'];
  team: TeamId | null;
  /** Duet only: which key the actor holds. */
  side?: DuetSide | null;
  isHost: boolean;
}

/** The match id and revision the client saw when it acted. */
export interface ActionRef { match: MatchId; rev: number }

export type EngineErrorCode = 'match_over' | 'wrong_match' | 'stale' | 'wrong_phase' | 'not_allowed' | 'not_your_turn' | 'invalid';

export type EngineEvent =
  | { type: 'clue_given'; clue: Clue; warnings: string[] }
  | { type: 'card_revealed'; card: CardIndex; reveal: CardReveal }
  | { type: 'turn_ended'; owner: TurnOwner; reason: 'voluntary' | 'wrong_guess' | 'limit' | 'timeout' }
  | { type: 'match_ended'; result: MatchResult }
  | { type: 'civilian_marked'; card: CardIndex; side: DuetSide }
  | { type: 'sudden_death' }
  | { type: 'paused' }
  | { type: 'resumed' };

export type EngineResult =
  | { ok: true; state: PrivateMatchState; events: EngineEvent[] }
  | { ok: false; code: EngineErrorCode; message: string };

const fail = (code: EngineErrorCode, message: string): EngineResult => ({ ok: false, code, message });
export const otherTeam = (t: TeamId): TeamId => (t === 'crimson' ? 'cobalt' : 'crimson');

// ---------- Setup ----------
export interface NewMatchInput {
  id: MatchId;
  mode: ModeId; // 'classic' or 'custom'
  settings: Pick<RoomSettings, 'boardSize' | 'moles' | 'startingTeam' | 'timer'>;
  /** Exactly size×size distinct words (comparison is case/accent-insensitive). */
  words: readonly string[];
  rng: Rng;
  /** Stored for audits and replays; the engine itself only uses `rng`. */
  seed: string;
  now: Timestamp;
  /** Explicit distribution (Custom); defaults to the balanced layout for the board and moles. */
  layout?: CompetitiveLayout;
  /** Rule switches; defaults to the standard rules. */
  rules?: MatchRules;
}

export const STANDARD_RULES: MatchRules = { suggestions: true, bonusGuess: true, specialClues: true, tokens: 9 };

export function createCompetitiveMatch(input: NewMatchInput): PrivateMatchState {
  const size: BoardSize = input.mode === 'classic' ? 5 : input.settings.boardSize;
  const d = dimensions(size);
  if (input.words.length !== d.cards) throw new Error(`Need ${d.cards} words, got ${input.words.length}`);
  if (new Set(input.words.map(wordKey)).size !== d.cards) throw new Error('Board words must be distinct');

  const layout = input.layout ?? competitiveLayout(size, input.mode === 'classic' ? null : input.settings.moles);
  if (layout.cards !== d.cards || layout.starting < 1 || layout.second < 1 || layout.civilians < 0 || layout.moles < 1 || layout.starting + layout.second + layout.civilians + layout.moles !== d.cards) {
    throw new Error('Invalid card distribution');
  }
  const starting: TeamId = input.settings.startingTeam === 'random' ? (input.rng() < 0.5 ? 'crimson' : 'cobalt') : input.settings.startingTeam;
  const second = otherTeam(starting);
  const identities = shuffle<CompetitiveIdentity>(
    [
      ...Array<CompetitiveIdentity>(layout.starting).fill(starting),
      ...Array<CompetitiveIdentity>(layout.second).fill(second),
      ...Array<CompetitiveIdentity>(layout.civilians).fill('civilian'),
      ...Array<CompetitiveIdentity>(layout.moles).fill('mole'),
    ],
    input.rng,
  );
  const portraits = identities.map(() => Math.floor(input.rng() * 2 ** 31));
  const owner: TurnOwner = { kind: 'team', team: starting };
  return {
    id: input.id,
    revision: 0,
    rules: { ...(input.rules ?? STANDARD_RULES) },
    mode: input.mode,
    dimensions: d,
    phase: 'awaiting_clue',
    resumePhase: null,
    turn: { number: 1, owner, clue: null, guessesMade: 0, guessesAllowed: null, deadline: deadline(input.settings.timer.clueSeconds, input.now) },
    history: [],
    suggestions: [],
    startingTeam: starting,
    remaining: { [starting]: layout.starting, [second]: layout.second },
    result: null,
    startedAt: input.now,
    seed: input.seed,
    words: input.words.map((w) => w.toUpperCase()),
    key: { kind: 'competitive', identities },
    portraits,
    reveals: identities.map(() => null),
    civilianFor: identities.map(() => []),
  };
}

const deadline = (seconds: number | null, now: Timestamp) => (seconds === null ? null : now + seconds * 1000);

// ---------- Actions ----------
export interface ActionContext {
  ref: ActionRef;
  now: Timestamp;
  /** Room timers, for the next phase's deadline. */
  timer: RoomSettings['timer'];
}

/**
 * Suggestions are advisory, so teammates marking cards at the same moment should not reject each other:
 * a suggestion made at any revision since the current guessing phase began is still valid (the card
 * itself is re-checked). Everything else must match the exact revision.
 */
export function suggestionStillValid(state: PrivateMatchState, action: EngineAction, rev: number): boolean {
  const since = state.turn?.sinceRev;
  return action.type === 'suggest' && since !== undefined && rev >= since && rev <= state.revision && (state.phase === 'guessing' || state.phase === 'sudden_death');
}

export function applyAction(state: PrivateMatchState, actor: Actor, action: EngineAction, ctx: ActionContext): EngineResult {
  if (state.key.kind !== 'competitive') return fail('invalid', 'Not a competitive match.');
  if (ctx.ref.match !== state.id) return fail('wrong_match', 'That action was for a different match.');
  if (state.phase === 'completed') return fail('match_over', 'The match is over.');
  if (ctx.ref.rev !== state.revision && !suggestionStillValid(state, action, ctx.ref.rev)) return fail('stale', 'The board changed before your action arrived. Try again.');

  const s = structuredClone(state);
  const events: EngineEvent[] = [];
  const result = run(s, actor, action, ctx, events);
  if (result) return result;
  s.revision += 1;
  return { ok: true, state: s, events };
}

/** Mutates the clone `s`; returns an error result or undefined on success. */
function run(s: PrivateMatchState, actor: Actor, action: EngineAction, ctx: ActionContext, events: EngineEvent[]): EngineResult | undefined {
  if (action.type === 'pause' || action.type === 'resume') {
    if (!actor.isHost) return fail('not_allowed', 'Only the host can pause or resume.');
    if (action.type === 'pause') {
      if (s.phase === 'paused') return fail('wrong_phase', 'Already paused.');
      s.resumePhase = s.phase;
      s.phase = 'paused';
      if (s.turn) s.turn.deadline = null;
      events.push({ type: 'paused' });
    } else {
      if (s.phase !== 'paused' || !s.resumePhase) return fail('wrong_phase', 'The match is not paused.');
      s.phase = s.resumePhase;
      s.resumePhase = null;
      if (s.turn) s.turn.deadline = deadline(s.phase === 'awaiting_clue' ? ctx.timer.clueSeconds : ctx.timer.guessSeconds, ctx.now);
      events.push({ type: 'resumed' });
    }
    return;
  }

  const turn = s.turn!;
  const active = turn.owner.kind === 'team' ? turn.owner.team : null;
  if (!active) return fail('invalid', 'Not a competitive turn.');
  if (s.phase === 'paused') return fail('wrong_phase', 'The match is paused.');

  switch (action.type) {
    case 'clue': {
      if (s.phase !== 'awaiting_clue') return fail('wrong_phase', 'A clue was already given this turn.');
      if (actor.role !== 'handler') return fail('not_allowed', 'Only handlers give clues.');
      if (actor.team !== active) return fail('not_your_turn', 'It is the other bureau’s turn.');
      const unrevealed = s.words.filter((_, i) => !s.reveals[i]);
      const revealed = s.words.filter((_, i) => s.reveals[i]);
      const check = validateClue(action.word, action.count, unrevealed, revealed);
      if (!check.ok) return fail('invalid', check.reason);
      if (!s.rules.specialClues && (check.count === 0 || check.count === null)) return fail('invalid', 'Special clues (0 and unlimited) are turned off in this room.');
      const clue: Clue = { word: check.word, count: check.count, owner: turn.owner, by: actor.id, turn: turn.number, at: ctx.now };
      turn.clue = clue;
      turn.guessesMade = 0;
      turn.guessesAllowed = guessesFor(check.count, s.rules.bonusGuess);
      turn.deadline = deadline(ctx.timer.guessSeconds, ctx.now);
      s.phase = 'guessing';
      turn.sinceRev = s.revision + 1; // suggestions made from this revision on stay valid this phase
      s.history.push({ type: 'clue', clue });
      events.push({ type: 'clue_given', clue, warnings: check.warnings });
      return;
    }

    case 'suggest': {
      if (!s.rules.suggestions) return fail('not_allowed', 'Suggestions are turned off in this room.');
      const guard = guessGuard(s, actor, active, action.card);
      if (guard) return guard;
      const mine = s.suggestions.findIndex((x) => x.card === action.card && x.by === actor.id);
      if (action.on && mine < 0) s.suggestions.push({ card: action.card, by: actor.id, owner: turn.owner, at: ctx.now });
      if (!action.on && mine >= 0) s.suggestions.splice(mine, 1);
      return;
    }

    case 'guess': {
      const guard = guessGuard(s, actor, active, action.card);
      if (guard) return guard;
      const identity = (s.key as { identities: CompetitiveIdentity[] }).identities[action.card];
      const result: RevealedIdentity = { kind: 'competitive', identity };
      const reveal: CardReveal = { identity: result, portrait: { seed: s.portraits[action.card] }, by: actor.id, turn: turn.number, at: ctx.now };
      s.reveals[action.card] = reveal;
      s.suggestions = s.suggestions.filter((x) => x.card !== action.card);
      turn.guessesMade += 1;
      s.history.push({ type: 'guess', guess: { card: action.card, owner: turn.owner, by: actor.id, turn: turn.number, at: ctx.now, result } });
      events.push({ type: 'card_revealed', card: action.card, reveal });

      if (identity === 'mole') return void finish(s, otherTeam(active), 'mole_revealed', ctx.now, events);
      if (identity === 'crimson' || identity === 'cobalt') {
        s.remaining[identity] = (s.remaining[identity] ?? 0) - 1;
        // Revealing a team's last agent wins for that team, even if the rival revealed it.
        if (s.remaining[identity] === 0) return void finish(s, identity, 'all_agents_found', ctx.now, events);
      }
      if (identity !== active) return void endTurn(s, 'wrong_guess', actor.id, ctx, events);
      if (turn.guessesAllowed !== null && turn.guessesMade >= turn.guessesAllowed) return void endTurn(s, 'limit', actor.id, ctx, events);
      return;
    }

    case 'end_turn': {
      if (s.phase !== 'guessing') return fail('wrong_phase', 'There is no guessing turn to end.');
      if (actor.role !== 'operative') return fail('not_allowed', 'Only operatives end the guessing turn.');
      if (actor.team !== active) return fail('not_your_turn', 'It is the other bureau’s turn.');
      if (turn.guessesMade < 1) return fail('not_allowed', 'Make at least one guess before ending the turn.');
      endTurn(s, 'voluntary', actor.id, ctx, events);
      return;
    }
  }
}

function guessGuard(s: PrivateMatchState, actor: Actor, active: TeamId, card: CardIndex): EngineResult | undefined {
  if (s.phase !== 'guessing') return fail('wrong_phase', 'Wait for the clue.');
  if (actor.role !== 'operative') return fail('not_allowed', 'Only operatives guess.');
  if (actor.team !== active) return fail('not_your_turn', 'It is the other bureau’s turn.');
  if (!Number.isInteger(card) || card < 0 || card >= s.dimensions.cards) return fail('invalid', 'No such card.');
  if (s.reveals[card]) return fail('invalid', 'That card is already revealed.');
  return;
}

function endTurn(s: PrivateMatchState, reason: 'voluntary' | 'wrong_guess' | 'limit' | 'timeout', by: PlayerId | null, ctx: { now: Timestamp; timer: RoomSettings['timer'] }, events: EngineEvent[]) {
  const turn = s.turn!;
  const entry: HistoryEntry = { type: 'end_turn', owner: turn.owner, by, turn: turn.number, at: ctx.now, reason };
  s.history.push(entry);
  events.push({ type: 'turn_ended', owner: turn.owner, reason });
  const next: TurnOwner = { kind: 'team', team: otherTeam((turn.owner as { team: TeamId }).team) };
  s.turn = { number: turn.number + 1, owner: next, clue: null, guessesMade: 0, guessesAllowed: null, deadline: deadline(ctx.timer.clueSeconds, ctx.now) };
  s.phase = 'awaiting_clue';
  s.suggestions = [];
}

function finish(s: PrivateMatchState, winner: TeamId, reason: MatchResult['reason'], now: Timestamp, events: EngineEvent[]) {
  s.phase = 'completed';
  s.resumePhase = null;
  s.suggestions = [];
  if (s.turn) s.turn.deadline = null;
  s.result = { outcome: { kind: 'team_win', team: winner }, reason, turns: s.turn?.number ?? 0, startedAt: s.startedAt, completedAt: now, stats: computeStats(s) };
  events.push({ type: 'match_ended', result: s.result });
}

/**
 * Timer expiry, called by the server's clock (never by clients or animations). Returns null when
 * nothing expired. A clue timeout passes the turn; a guess timeout ends it.
 */
export function expireTurn(state: PrivateMatchState, now: Timestamp, timer: RoomSettings['timer']): EngineResult | null {
  if (!state.turn?.deadline || now < state.turn.deadline) return null;
  if (state.phase !== 'awaiting_clue' && state.phase !== 'guessing') return null;
  const s = structuredClone(state);
  const events: EngineEvent[] = [];
  endTurn(s, 'timeout', null, { now, timer }, events);
  s.revision += 1;
  return { ok: true, state: s, events };
}

/** Statistics from history alone (no hidden information beyond what was revealed). */
export function computeStats(s: PrivateMatchState): MatchStats {
  const blank = (): TeamStats => ({ clues: 0, guesses: 0, correct: 0, enemy: 0, civilians: 0, moles: 0 });
  const teams: Partial<Record<TeamId, TeamStats>> = Object.fromEntries(TEAMS.map((t) => [t, blank()]));
  const players: MatchStats['players'] = {};
  for (const e of s.history) {
    if (e.type === 'clue' && e.clue.owner.kind === 'team') teams[e.clue.owner.team]!.clues++;
    if (e.type !== 'guess' || e.guess.owner.kind !== 'team') continue;
    const t = teams[e.guess.owner.team]!;
    const id = e.guess.result.identity;
    const correct = id === e.guess.owner.team;
    t.guesses++;
    if (correct) t.correct++;
    else if (id === 'civilian') t.civilians++;
    else if (id === 'mole') t.moles++;
    else t.enemy++;
    const p = (players[e.guess.by] ??= { guesses: 0, correct: 0 });
    p.guesses++;
    if (correct) p.correct++;
  }
  return { teams, players };
}
