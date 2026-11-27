/**
 * Deterministic cooperative Duet engine (5×5). Same contract as the competitive engine: pure, injected
 * randomness and time, every action checked against match id, revision, phase and the actor's side,
 * new state returned, inputs never mutated. Presentation only consumes the events.
 *
 * Rules (see CIPHER_RULES.md, "Duet"):
 * - Each side (Partner A = north, Partner B = south) holds a private key; guesses are judged against
 *   the CURRENT CLUE-GIVER's key, never the guesser's own.
 * - Agent: revealed for everyone, keep guessing (no number + 1 limit). Civilian: marked for that
 *   direction only, the turn ends. Mole: immediate defeat.
 * - Each finished turn uses one token. Turns alternate; a side whose 9 agents are all found stops
 *   giving clues and its partner gives the rest.
 * - Tokens gone with agents left: sudden death. No clues; anyone seated guesses words that are agents
 *   on their PARTNER's key; any civilian or mole loses.
 * - All 15 distinct agents found: victory.
 */
import { dimensions } from '../shared/board.ts';
import { DUET, DUET_SIDES, guessesFor } from '../shared/config.ts';
import { shuffle, type Rng } from '../shared/random.ts';
import { wordKey } from '../shared/text.ts';
import type {
  CardIndex, CardReveal, Clue, DuetIdentity, DuetSide, MatchId, MatchResult, MatchRules, MatchStats, PlayerId, PrivateMatchState,
  RevealedIdentity, RoomSettings, Timestamp, TurnOwner,
} from '../shared/types.ts';
import { validateClue } from './clues.ts';
import { suggestionStillValid, type ActionContext, type Actor, type EngineAction, type EngineErrorCode, type EngineEvent, type EngineResult } from './competitive.ts';

export const otherSide = (s: DuetSide): DuetSide => (s === 'north' ? 'south' : 'north');
const fail = (code: EngineErrorCode, message: string): EngineResult => ({ ok: false, code, message });

// ---------- Key generation ----------
/** Builds both private keys from the exact pair distribution, shuffled with `rng`. */
export function generateDuetKey(rng: Rng): Record<DuetSide, DuetIdentity[]> {
  const pairs: [DuetIdentity, DuetIdentity][] = [];
  for (const [a, b, n] of DUET.pairs) for (let i = 0; i < n; i++) pairs.push([a, b]);
  const shuffled = shuffle(pairs, rng);
  return { north: shuffled.map((p) => p[0]), south: shuffled.map((p) => p[1]) };
}

/** Checks a key pair against the Duet rules; returns the problems (empty when valid). */
export function validateDuetKey(sides: Record<DuetSide, readonly DuetIdentity[]>): string[] {
  const out: string[] = [];
  const cards = DUET.size * DUET.size;
  for (const side of DUET_SIDES) {
    const k = sides[side];
    if (k.length !== cards) out.push(`${side}: ${k.length} cards`);
    const n = (x: DuetIdentity) => k.filter((i) => i === x).length;
    if (n('agent') !== DUET.agentsPerSide) out.push(`${side}: ${n('agent')} agents`);
    if (n('civilian') !== DUET.civiliansPerSide) out.push(`${side}: ${n('civilian')} civilians`);
    if (n('mole') !== DUET.molesPerSide) out.push(`${side}: ${n('mole')} moles`);
  }
  for (const [a, b, want] of DUET.pairs) {
    const got = sides.north.filter((x, i) => x === a && sides.south[i] === b).length;
    if (got !== want) out.push(`pair ${a}/${b}: ${got} (want ${want})`);
  }
  return out;
}

export const duetAgentsTotal = () => DUET.agentsPerSide * 2 - DUET.sharedAgents; // 15

// ---------- Setup ----------
export interface NewDuetInput {
  id: MatchId;
  words: readonly string[];
  rng: Rng;
  seed: string;
  now: Timestamp;
  timer: RoomSettings['timer'];
  /** First clue-giver; random when omitted. */
  firstSide?: DuetSide;
  /** Turn tokens (Custom: 9, 10 or 11) and suggestions switch; standard when omitted. */
  rules?: MatchRules;
}

export function createDuetMatch(input: NewDuetInput): PrivateMatchState {
  const d = dimensions(DUET.size);
  if (input.words.length !== d.cards) throw new Error(`Need ${d.cards} words, got ${input.words.length}`);
  if (new Set(input.words.map(wordKey)).size !== d.cards) throw new Error('Board words must be distinct');
  const sides = generateDuetKey(input.rng);
  const problems = validateDuetKey(sides);
  if (problems.length) throw new Error(`Invalid Duet key: ${problems.join('; ')}`);
  const first = input.firstSide ?? (input.rng() < 0.5 ? 'north' : 'south');
  const rules: MatchRules = { suggestions: true, bonusGuess: false, specialClues: true, ...input.rules, tokens: input.rules?.tokens ?? DUET.turns };
  if (!Number.isInteger(rules.tokens) || rules.tokens < 1) throw new Error('Invalid token budget');
  return {
    id: input.id,
    revision: 0,
    rules,
    mode: 'duet',
    dimensions: d,
    phase: 'awaiting_clue',
    resumePhase: null,
    turn: { number: 1, owner: { kind: 'side', side: first }, clue: null, guessesMade: 0, guessesAllowed: null, deadline: dl(input.timer.clueSeconds, input.now), turnsLeft: rules.tokens },
    history: [],
    suggestions: [],
    startingTeam: null,
    sidesDone: [],
    remaining: { agents: duetAgentsTotal() },
    result: null,
    startedAt: input.now,
    seed: input.seed,
    words: input.words.map((w) => w.toUpperCase()),
    key: { kind: 'cooperative', sides },
    portraits: sides.north.map(() => Math.floor(input.rng() * 2 ** 31)),
    reveals: sides.north.map(() => null),
    civilianFor: sides.north.map(() => []),
  };
}

const dl = (seconds: number | null, now: Timestamp) => (seconds === null ? null : now + seconds * 1000);
const keyOf = (s: PrivateMatchState) => (s.key as { kind: 'cooperative'; sides: Record<DuetSide, DuetIdentity[]> }).sides;

/** Whether every agent on `side`'s key has been revealed. */
export function sideDone(s: PrivateMatchState, side: DuetSide): boolean {
  return keyOf(s)[side].every((id, i) => id !== 'agent' || !!s.reveals[i]);
}

// ---------- Actions ----------
export function applyDuetAction(state: PrivateMatchState, actor: Actor, action: EngineAction, ctx: ActionContext): EngineResult {
  if (state.key.kind !== 'cooperative') return fail('invalid', 'Not a Duet match.');
  if (ctx.ref.match !== state.id) return fail('wrong_match', 'That action was for a different match.');
  if (state.phase === 'completed') return fail('match_over', 'The match is over.');
  if (ctx.ref.rev !== state.revision && !suggestionStillValid(state, action, ctx.ref.rev)) return fail('stale', 'The board changed before your action arrived. Try again.');
  const s = structuredClone(state);
  const events: EngineEvent[] = [];
  const err = run(s, actor, action, ctx, events);
  if (err) return err;
  s.revision += 1;
  return { ok: true, state: s, events };
}

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
      if (s.turn && s.phase !== 'sudden_death') s.turn.deadline = dl(s.phase === 'awaiting_clue' ? ctx.timer.clueSeconds : ctx.timer.guessSeconds, ctx.now);
      events.push({ type: 'resumed' });
    }
    return;
  }
  if (s.phase === 'paused') return fail('wrong_phase', 'The match is paused.');
  const side = actor.role !== 'spectator' ? actor.side ?? null : null;
  if (!side) return fail('not_allowed', 'Only seated partners play.');
  const turn = s.turn!;
  const giver = (turn.owner as { side: DuetSide }).side;

  switch (action.type) {
    case 'clue': {
      if (s.phase === 'sudden_death') return fail('wrong_phase', 'No more clues: sudden death.');
      if (s.phase !== 'awaiting_clue') return fail('wrong_phase', 'A clue was already given this turn.');
      if (side !== giver) return fail('not_your_turn', 'Your partner gives this clue.');
      const check = validateClue(action.word, action.count, s.words.filter((_, i) => !s.reveals[i]), s.words.filter((_, i) => s.reveals[i]));
      if (!check.ok) return fail('invalid', check.reason);
      const clue: Clue = { word: check.word, count: check.count, owner: turn.owner, by: actor.id, turn: turn.number, at: ctx.now };
      Object.assign(turn, { clue, guessesMade: 0, guessesAllowed: guessesFor(null), deadline: dl(ctx.timer.guessSeconds, ctx.now) });
      s.phase = 'guessing';
      turn.sinceRev = s.revision + 1; // suggestions made from this revision on stay valid this phase
      s.history.push({ type: 'clue', clue });
      events.push({ type: 'clue_given', clue, warnings: check.warnings });
      return;
    }

    case 'suggest': {
      if (!s.rules.suggestions) return fail('not_allowed', 'Suggestions are turned off in this room.');
      const judge = judgeFor(s, side, giver);
      if (typeof judge !== 'string') return judge;
      const guard = cardGuard(s, action.card, judge);
      if (guard) return guard;
      const owner: TurnOwner = { kind: 'side', side };
      const i = s.suggestions.findIndex((x) => x.card === action.card && x.by === actor.id);
      if (action.on && i < 0) s.suggestions.push({ card: action.card, by: actor.id, owner, at: ctx.now });
      if (!action.on && i >= 0) s.suggestions.splice(i, 1);
      return;
    }

    case 'guess': {
      const judge = judgeFor(s, side, giver);
      if (typeof judge !== 'string') return judge;
      const guard = cardGuard(s, action.card, judge);
      if (guard) return guard;
      const identity = keyOf(s)[judge][action.card];
      const result: RevealedIdentity = { kind: 'cooperative', identity, judgedBy: judge };
      const owner: TurnOwner = { kind: 'side', side: judge };
      turn.guessesMade += 1;
      s.suggestions = s.suggestions.filter((x) => x.card !== action.card);
      s.history.push({ type: 'guess', guess: { card: action.card, owner, by: actor.id, turn: turn.number, at: ctx.now, result } });

      if (identity === 'civilian') {
        // Civilian for this direction only: mark it, never reveal what it is on the other key.
        s.civilianFor[action.card] = [...s.civilianFor[action.card], judge];
        events.push({ type: 'civilian_marked', card: action.card, side: judge });
        if (s.phase === 'sudden_death') return void finish(s, 'cooperative_loss', 'turns_exhausted', ctx.now, events);
        return void endTurn(s, 'wrong_guess', actor.id, ctx, events);
      }
      const reveal: CardReveal = { identity: result, portrait: { seed: s.portraits[action.card] }, by: actor.id, turn: turn.number, at: ctx.now };
      s.reveals[action.card] = reveal;
      events.push({ type: 'card_revealed', card: action.card, reveal });
      if (identity === 'mole') return void finish(s, 'cooperative_loss', 'mole_revealed', ctx.now, events);
      s.remaining.agents = (s.remaining.agents ?? 0) - 1;
      updateDone(s);
      if (s.remaining.agents === 0) return void finish(s, 'cooperative_win', 'all_agents_found', ctx.now, events);
      return;
    }

    case 'end_turn': {
      if (s.phase === 'sudden_death') return fail('wrong_phase', 'Sudden death has no turns: keep guessing or stop playing.');
      if (s.phase !== 'guessing') return fail('wrong_phase', 'There is no guessing turn to end.');
      if (side === giver) return fail('not_your_turn', 'Your partner is guessing.');
      if (turn.guessesMade < 1) return fail('not_allowed', 'Make at least one guess before ending the turn.');
      endTurn(s, 'voluntary', actor.id, ctx, events);
      return;
    }
  }
}

/**
 * Which key judges a guess by `side`: the clue-giver's key during a turn; in sudden death the
 * guesser's partner's key (you guess the words your partner sees as agents).
 */
function judgeFor(s: PrivateMatchState, side: DuetSide, giver: DuetSide): DuetSide | EngineResult {
  if (s.phase === 'sudden_death') {
    const partner = otherSide(side);
    return sideDone(s, partner) ? fail('not_allowed', 'Every agent on your partner’s key is already found.') : partner;
  }
  if (s.phase !== 'guessing') return fail('wrong_phase', 'Wait for the clue.');
  if (side === giver) return fail('not_your_turn', 'You gave this clue; your partner guesses.');
  return giver;
}

function cardGuard(s: PrivateMatchState, card: CardIndex, judge: DuetSide): EngineResult | undefined {
  if (!Number.isInteger(card) || card < 0 || card >= s.dimensions.cards) return fail('invalid', 'No such card.');
  if (s.reveals[card]) return fail('invalid', 'That card is already revealed.');
  if (s.civilianFor[card].includes(judge)) return fail('invalid', 'Already known to be a civilian on that key.');
  return;
}

function updateDone(s: PrivateMatchState) {
  s.sidesDone = DUET_SIDES.filter((x) => sideDone(s, x));
}

/** A turn ends: one token is used; the next clue comes from the guesser unless their key is exhausted. */
function endTurn(s: PrivateMatchState, reason: 'voluntary' | 'wrong_guess' | 'limit' | 'timeout', by: PlayerId | null, ctx: { now: Timestamp; timer: RoomSettings['timer'] }, events: EngineEvent[]) {
  const turn = s.turn!;
  const giver = (turn.owner as { side: DuetSide }).side;
  s.history.push({ type: 'end_turn', owner: turn.owner, by, turn: turn.number, at: ctx.now, reason });
  events.push({ type: 'turn_ended', owner: turn.owner, reason });
  const left = (turn.turnsLeft ?? 0) - 1;
  s.suggestions = [];
  updateDone(s);
  if (left <= 0) {
    s.phase = 'sudden_death';
    s.turn = { number: turn.number + 1, owner: turn.owner, clue: null, guessesMade: 0, guessesAllowed: null, deadline: null, turnsLeft: 0, sinceRev: s.revision + 1 };
    events.push({ type: 'sudden_death' });
    return;
  }
  const preferred = otherSide(giver);
  const next = s.sidesDone!.includes(preferred) ? giver : preferred;
  s.turn = { number: turn.number + 1, owner: { kind: 'side', side: next }, clue: null, guessesMade: 0, guessesAllowed: null, deadline: dl(ctx.timer.clueSeconds, ctx.now), turnsLeft: left };
  s.phase = 'awaiting_clue';
}

function finish(s: PrivateMatchState, outcome: 'cooperative_win' | 'cooperative_loss', reason: MatchResult['reason'], now: Timestamp, events: EngineEvent[]) {
  const suddenDeath = s.phase === 'sudden_death';
  s.phase = 'completed';
  s.resumePhase = null;
  s.suggestions = [];
  if (s.turn) s.turn.deadline = null;
  s.result = { outcome: { kind: outcome }, reason, turns: s.turn?.number ?? 0, startedAt: s.startedAt, completedAt: now, stats: duetStats(s, suddenDeath) };
  events.push({ type: 'match_ended', result: s.result });
}

/** Timer expiry (server clock): ends the turn like a voluntary stop, using a token. */
export function expireDuetTurn(state: PrivateMatchState, now: Timestamp, timer: RoomSettings['timer']): EngineResult | null {
  if (!state.turn?.deadline || now < state.turn.deadline || (state.phase !== 'awaiting_clue' && state.phase !== 'guessing')) return null;
  const s = structuredClone(state);
  const events: EngineEvent[] = [];
  endTurn(s, 'timeout', null, { now, timer }, events);
  s.revision += 1;
  return { ok: true, state: s, events };
}

export function duetStats(s: PrivateMatchState, suddenDeath = s.phase === 'sudden_death'): MatchStats {
  const players: MatchStats['players'] = {};
  let civ = 0;
  for (const e of s.history) {
    if (e.type !== 'guess') continue;
    const p = (players[e.guess.by] ??= { guesses: 0, correct: 0 });
    p.guesses++;
    if (e.guess.result.identity === 'agent') p.correct++;
    if (e.guess.result.identity === 'civilian') civ++;
  }
  const total = duetAgentsTotal();
  const ended = s.history.filter((e) => e.type === 'end_turn').length;
  return { teams: {}, players, cooperative: { agentsFound: total - (s.remaining.agents ?? 0), agentsTotal: total, tokensUsed: Math.min(ended, s.rules.tokens), tokensTotal: s.rules.tokens, civilianHits: civ, suddenDeath } };
}
