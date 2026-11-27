import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEV_WORDS } from '../client/dev/fixtures.ts';
import { addGuest, createRoom } from '../server/room.ts';
import { applyGameMessage, startCompetitiveMatch } from '../server/match.ts';
import { UNLIMITED_TIMER } from '../shared/config.ts';
import { defaultBank } from '../vocab/index.ts';
import { seededRng } from '../shared/random.ts';
import type { CompetitiveIdentity, PrivateMatchState, TeamId } from '../shared/types.ts';
import { stem, validateClue } from './clues.ts';
import { applyAction, computeStats, createCompetitiveMatch, expireTurn, otherTeam, type Actor, type EngineAction, type EngineResult } from './competitive.ts';
import { projectView } from './projection.ts';

const WORDS = DEV_WORDS.slice(0, 25);
const T = UNLIMITED_TIMER;

function newMatch(seed = 'seed-1', startingTeam: TeamId | 'random' = 'crimson', timer = T) {
  return createCompetitiveMatch({ id: 'm_test', mode: 'classic', settings: { boardSize: 5, moles: null, startingTeam, timer }, words: WORDS, rng: seededRng(seed), seed, now: 1000 });
}
const actor = (role: Actor['role'], team: TeamId | null, id = `${team}-${role}`, isHost = false): Actor => ({ id, role, team, isHost });
const H = (t: TeamId) => actor('handler', t);
const O = (t: TeamId, n = 1) => actor('operative', t, `${t}-op${n}`);
const ids = (s: PrivateMatchState) => (s.key as { identities: CompetitiveIdentity[] }).identities;
/** Unrevealed cards of an identity: read from the private key (test-only, like the server). */
const cardsOf = (s: PrivateMatchState, id: CompetitiveIdentity) => ids(s).map((x, i) => (x === id && !s.reveals[i] ? i : -1)).filter((i) => i >= 0);

function act(s: PrivateMatchState, a: Actor, action: EngineAction, now = 2000, timer = T): EngineResult {
  return applyAction(s, a, action, { ref: { match: s.id, rev: s.revision }, now, timer });
}
function must(r: EngineResult): PrivateMatchState {
  if (!r.ok) assert.fail(`expected ok, got ${r.code}: ${r.message}`);
  return r.state;
}
function refuse(r: EngineResult, code?: string) {
  assert.equal(r.ok, false);
  if (code && !r.ok) assert.equal(r.code, code);
}
const clue = (s: PrivateMatchState, team: TeamId, count: number | null = 2, word = 'ORBIT') => must(act(s, H(team), { type: 'clue', word, count }));

// ---------- Setup ----------
test('setup: 25 distinct words, 9/8/7/1 layout, starting team has 9', () => {
  for (const seed of ['a', 'b', 'c', 'd']) {
    const s = newMatch(seed, 'random');
    const start = s.startingTeam!;
    const count = (x: CompetitiveIdentity) => ids(s).filter((i) => i === x).length;
    assert.equal(s.words.length, 25);
    assert.equal(new Set(s.words).size, 25);
    assert.equal(count(start), 9);
    assert.equal(count(otherTeam(start)), 8);
    assert.equal(count('civilian'), 7);
    assert.equal(count('mole'), 1);
    assert.deepEqual(s.remaining, { [start]: 9, [otherTeam(start)]: 8 });
    assert.equal(s.phase, 'awaiting_clue');
    assert.deepEqual(s.turn?.owner, { kind: 'team', team: start });
  }
});

test('setup: reproducible from the seed; random start picks both teams across seeds', () => {
  assert.deepEqual(ids(newMatch('same', 'random')), ids(newMatch('same', 'random')));
  assert.notDeepEqual(ids(newMatch('one', 'random')), ids(newMatch('two', 'random')));
  const starts = new Set(Array.from({ length: 40 }, (_, i) => newMatch(`s${i}`, 'random').startingTeam));
  assert.deepEqual([...starts].sort(), ['cobalt', 'crimson']);
  assert.equal(newMatch('x', 'cobalt').startingTeam, 'cobalt');
});

test('setup: rejects wrong word counts and duplicates', () => {
  const base = { id: 'm', mode: 'classic' as const, settings: { boardSize: 5 as const, moles: null, startingTeam: 'crimson' as const, timer: T }, rng: seededRng('r'), seed: 'r', now: 0 };
  assert.throws(() => createCompetitiveMatch({ ...base, words: WORDS.slice(0, 24) }));
  assert.throws(() => createCompetitiveMatch({ ...base, words: [...WORDS.slice(0, 24), WORDS[0].toLowerCase()] }));
});

// ---------- Clues ----------
test('clue: only the active handler, only while awaiting a clue', () => {
  const s = newMatch();
  refuse(act(s, O('crimson'), { type: 'clue', word: 'ORBIT', count: 1 }), 'not_allowed');
  refuse(act(s, H('cobalt'), { type: 'clue', word: 'ORBIT', count: 1 }), 'not_your_turn');
  refuse(act(s, actor('spectator', null), { type: 'clue', word: 'ORBIT', count: 1 }), 'not_allowed');
  const g = clue(s, 'crimson', 2);
  assert.equal(g.phase, 'guessing');
  assert.equal(g.turn?.guessesAllowed, 3);
  refuse(act(g, H('crimson'), { type: 'clue', word: 'AGAIN', count: 1 }), 'wrong_phase');
});

test('clue validation: empty, multi-word, numbers, board words and their forms', () => {
  const board = ['LANTERN', 'CITY', 'BOX', 'RUN', 'SNOWMAN'];
  const bad = (w: unknown, c: unknown = 1) => assert.equal(validateClue(w, c, board).ok, false, String(w) + ' ' + String(c));
  bad('');
  bad('   ');
  bad('two words');
  bad('ORBIT', -1);
  bad('ORBIT', 10);
  bad('ORBIT', 1.5);
  bad('ORBIT', '2');
  bad('lantern'); // case-insensitive
  bad('Lanterns');
  bad('cities');
  bad('boxes');
  bad('running');
  bad('Lántern'); // accents ignored
  assert.equal(validateClue('ORBIT', 0, board).ok, true);
  assert.equal(validateClue('ORBIT', null, board).ok, true);
  const compound = validateClue('SNOW', 1, board);
  assert.ok(compound.ok && compound.warnings.length === 1, 'compound containment is a warning, not a rejection');
  const revealed = validateClue('LANTERN', 1, board.slice(1), ['LANTERN']);
  assert.ok(revealed.ok, 'revealed board words may be used');
  assert.equal(stem('happier'), stem('happy'));
});

test('clue: a board word is rejected by the engine; revealed words are allowed', () => {
  const s = newMatch();
  refuse(act(s, H('crimson'), { type: 'clue', word: s.words[3].toLowerCase(), count: 1 }), 'invalid');
  const g = clue(s, 'crimson', 1);
  const after = must(act(g, O('crimson'), { type: 'guess', card: cardsOf(g, 'civilian')[0] })); // turn passes
  const word = after.words[cardsOf(g, 'civilian')[0]];
  assert.ok(must(act(after, H('cobalt'), { type: 'clue', word, count: 1 })));
});

// ---------- Guess outcomes ----------
test('friendly agent: team keeps guessing; agents remaining drops', () => {
  const g = clue(newMatch(), 'crimson', 2);
  const s = must(act(g, O('crimson'), { type: 'guess', card: cardsOf(g, 'crimson')[0] }));
  assert.equal(s.phase, 'guessing');
  assert.equal(s.remaining.crimson, 8);
  assert.equal(s.turn?.guessesMade, 1);
  assert.equal(s.reveals[cardsOf(g, 'crimson')[0]]?.identity.identity, 'crimson');
});

test('any active operative can confirm; others cannot', () => {
  const g = clue(newMatch(), 'crimson', 3);
  const card = cardsOf(g, 'crimson')[0];
  refuse(act(g, H('crimson'), { type: 'guess', card }), 'not_allowed');
  refuse(act(g, O('cobalt'), { type: 'guess', card }), 'not_your_turn');
  refuse(act(g, actor('spectator', null), { type: 'guess', card }), 'not_allowed');
  const a = must(act(g, O('crimson', 1), { type: 'guess', card }));
  must(act(a, O('crimson', 2), { type: 'guess', card: cardsOf(a, 'crimson')[0] }));
});

test('enemy agent: revealed for the rival and the turn ends', () => {
  const g = clue(newMatch(), 'crimson', 2);
  const s = must(act(g, O('crimson'), { type: 'guess', card: cardsOf(g, 'cobalt')[0] }));
  assert.equal(s.remaining.cobalt, 7);
  assert.equal(s.phase, 'awaiting_clue');
  assert.deepEqual(s.turn?.owner, { kind: 'team', team: 'cobalt' });
  assert.equal(s.turn?.number, 2);
  const end = s.history.at(-1)!;
  assert.ok(end.type === 'end_turn' && end.reason === 'wrong_guess');
});

test('civilian ends the turn', () => {
  const g = clue(newMatch(), 'crimson', 2);
  const s = must(act(g, O('crimson'), { type: 'guess', card: cardsOf(g, 'civilian')[0] }));
  assert.equal(s.phase, 'awaiting_clue');
  assert.deepEqual(s.turn?.owner, { kind: 'team', team: 'cobalt' });
  assert.deepEqual(s.remaining, { crimson: 9, cobalt: 8 });
});

test('mole: immediate defeat for the guessing team', () => {
  const g = clue(newMatch(), 'crimson', 2);
  const r = act(g, O('crimson'), { type: 'guess', card: cardsOf(g, 'mole')[0] });
  const s = must(r);
  assert.equal(s.phase, 'completed');
  assert.deepEqual(s.result?.outcome, { kind: 'team_win', team: 'cobalt' });
  assert.equal(s.result?.reason, 'mole_revealed');
  assert.ok(r.ok && r.events.some((e) => e.type === 'match_ended'));
});

test('guess limit: number + 1, then the turn ends', () => {
  let s = clue(newMatch(), 'crimson', 1);
  s = must(act(s, O('crimson'), { type: 'guess', card: cardsOf(s, 'crimson')[0] }));
  assert.equal(s.phase, 'guessing', 'bonus guess available');
  s = must(act(s, O('crimson'), { type: 'guess', card: cardsOf(s, 'crimson')[0] }));
  assert.equal(s.phase, 'awaiting_clue');
  const end = s.history.at(-1)!;
  assert.ok(end.type === 'end_turn' && end.reason === 'limit');
});

test('zero and unlimited clues: unlimited correct guesses, still at least one guess', () => {
  for (const count of [0, null]) {
    let s = clue(newMatch(), 'crimson', count);
    assert.equal(s.turn?.guessesAllowed, null);
    refuse(act(s, O('crimson'), { type: 'end_turn' }), 'not_allowed');
    for (let i = 0; i < 8; i++) s = must(act(s, O('crimson'), { type: 'guess', card: cardsOf(s, 'crimson')[0] }));
    assert.equal(s.phase, 'guessing', `still guessing after 8 with count ${count}`);
    assert.equal(s.remaining.crimson, 1);
    const last = s.history.filter((e) => e.type === 'clue').at(-1)!;
    assert.ok(last.type === 'clue' && last.clue.count === count, 'zero and unlimited stay distinct in history');
  }
});

test('voluntary end: needs one guess first, then passes the turn', () => {
  let s = clue(newMatch(), 'crimson', 3);
  refuse(act(s, O('crimson'), { type: 'end_turn' }), 'not_allowed');
  s = must(act(s, O('crimson'), { type: 'guess', card: cardsOf(s, 'crimson')[0] }));
  refuse(act(s, O('cobalt'), { type: 'end_turn' }), 'not_your_turn');
  refuse(act(s, H('crimson'), { type: 'end_turn' }), 'not_allowed');
  s = must(act(s, O('crimson'), { type: 'end_turn' }));
  assert.deepEqual(s.turn?.owner, { kind: 'team', team: 'cobalt' });
  refuse(act(s, O('cobalt'), { type: 'end_turn' }), 'wrong_phase');
});

test('guesses may target words from earlier clues (any unrevealed card)', () => {
  let s = clue(newMatch(), 'crimson', 1);
  s = must(act(s, O('crimson'), { type: 'guess', card: cardsOf(s, 'crimson')[0] }));
  s = must(act(s, O('crimson'), { type: 'end_turn' }));
  s = clue(s, 'cobalt', 1);
  s = must(act(s, O('cobalt'), { type: 'guess', card: cardsOf(s, 'civilian')[0] }));
  s = clue(s, 'crimson', 1, 'TIDE');
  s = must(act(s, O('crimson'), { type: 'guess', card: cardsOf(s, 'crimson')[0] }));
  s = must(act(s, O('crimson'), { type: 'guess', card: cardsOf(s, 'crimson')[0] }));
  assert.equal(s.remaining.crimson, 6);
});

test('revealed cards cannot be guessed again; out-of-range cards rejected', () => {
  let s = clue(newMatch(), 'crimson', 3);
  const card = cardsOf(s, 'crimson')[0];
  s = must(act(s, O('crimson'), { type: 'guess', card }));
  refuse(act(s, O('crimson'), { type: 'guess', card }), 'invalid');
  refuse(act(s, O('crimson'), { type: 'guess', card: 25 }), 'invalid');
  refuse(act(s, O('crimson'), { type: 'guess', card: -1 }), 'invalid');
  refuse(act(s, O('crimson'), { type: 'guess', card: 1.5 }), 'invalid');
});

// ---------- Victory ----------
test('a team wins when all its agents are revealed', () => {
  let s = clue(newMatch(), 'crimson', null);
  for (let i = 0; i < 9; i++) s = must(act(s, O('crimson'), { type: 'guess', card: cardsOf(s, 'crimson')[0] }));
  assert.equal(s.phase, 'completed');
  assert.deepEqual(s.result?.outcome, { kind: 'team_win', team: 'crimson' });
  assert.equal(s.result?.reason, 'all_agents_found');
});

test('revealing the rival’s final agent makes the rival win immediately', () => {
  let s = clue(newMatch(), 'crimson', 1);
  s = must(act(s, O('crimson'), { type: 'guess', card: cardsOf(s, 'civilian')[0] }));
  s = clue(s, 'cobalt', null);
  for (let i = 0; i < 7; i++) s = must(act(s, O('cobalt'), { type: 'guess', card: cardsOf(s, 'cobalt')[0] }));
  assert.equal(s.remaining.cobalt, 1);
  s = must(act(s, O('cobalt'), { type: 'guess', card: cardsOf(s, 'civilian')[0] }));
  s = clue(s, 'crimson', 1);
  s = must(act(s, O('crimson'), { type: 'guess', card: cardsOf(s, 'cobalt')[0] }));
  assert.equal(s.phase, 'completed');
  assert.deepEqual(s.result?.outcome, { kind: 'team_win', team: 'cobalt' });
});

test('after the match ends every gameplay action is rejected', () => {
  let s = clue(newMatch(), 'crimson', 2);
  s = must(act(s, O('crimson'), { type: 'guess', card: cardsOf(s, 'mole')[0] }));
  refuse(act(s, O('crimson'), { type: 'guess', card: cardsOf(s, 'crimson')[0] }), 'match_over');
  refuse(act(s, H('cobalt'), { type: 'clue', word: 'X', count: 1 }), 'match_over');
  refuse(act(s, O('crimson'), { type: 'end_turn' }), 'match_over');
  refuse(act(s, actor('operative', 'crimson', 'h', true), { type: 'pause' }), 'match_over');
});

// ---------- Integrity ----------
test('stale revisions and wrong match ids are rejected; inputs are never mutated', () => {
  const s = newMatch();
  const snapshot = JSON.stringify(s);
  refuse(applyAction(s, H('crimson'), { type: 'clue', word: 'ORBIT', count: 1 }, { ref: { match: s.id, rev: 5 }, now: 1, timer: T }), 'stale');
  refuse(applyAction(s, H('crimson'), { type: 'clue', word: 'ORBIT', count: 1 }, { ref: { match: 'm_other', rev: 0 }, now: 1, timer: T }), 'wrong_match');
  const next = clue(s, 'crimson', 1);
  assert.equal(JSON.stringify(s), snapshot);
  assert.equal(next.revision, 1);
  refuse(applyAction(next, O('crimson'), { type: 'guess', card: 0 }, { ref: { match: s.id, rev: 0 }, now: 1, timer: T }), 'stale');
});

test('pause and resume: host only; play is blocked while paused', () => {
  const host = actor('operative', 'cobalt', 'host', true);
  let s = clue(newMatch(), 'crimson', 2);
  refuse(act(s, O('crimson'), { type: 'pause' }), 'not_allowed');
  s = must(act(s, host, { type: 'pause' }));
  assert.equal(s.phase, 'paused');
  refuse(act(s, O('crimson'), { type: 'guess', card: cardsOf(s, 'crimson')[0] }), 'wrong_phase');
  s = must(act(s, host, { type: 'resume' }));
  assert.equal(s.phase, 'guessing');
  must(act(s, O('crimson'), { type: 'guess', card: cardsOf(s, 'crimson')[0] }));
});

test('suggestions: active operatives only, toggle, cleared on reveal and at turn end', () => {
  let s = clue(newMatch(), 'crimson', 2);
  const [a, b] = cardsOf(s, 'crimson');
  refuse(act(s, O('cobalt'), { type: 'suggest', card: a, on: true }), 'not_your_turn');
  s = must(act(s, O('crimson', 1), { type: 'suggest', card: a, on: true }));
  s = must(act(s, O('crimson', 2), { type: 'suggest', card: b, on: true }));
  s = must(act(s, O('crimson', 2), { type: 'suggest', card: b, on: false }));
  assert.deepEqual(s.suggestions.map((x) => x.card), [a]);
  s = must(act(s, O('crimson'), { type: 'guess', card: a }));
  assert.equal(s.suggestions.length, 0);
  s = must(act(s, O('crimson'), { type: 'suggest', card: b, on: true }));
  s = must(act(s, O('crimson'), { type: 'end_turn' }));
  assert.equal(s.suggestions.length, 0);
});

test('timers: expiry ends a guessing turn or passes a clue turn; nothing before the deadline', () => {
  const timer = { clueSeconds: 60, guessSeconds: 90 };
  let s = newMatch('t', 'crimson', timer);
  assert.equal(s.turn?.deadline, 1000 + 60_000);
  assert.equal(expireTurn(s, 1000 + 59_999, timer), null);
  const passed = expireTurn(s, 1000 + 60_000, timer);
  assert.ok(passed?.ok && passed.state.turn?.owner.kind === 'team' && passed.state.turn.owner.team === 'cobalt');
  s = must(act(s, H('crimson'), { type: 'clue', word: 'ORBIT', count: 1 }, 5000, timer));
  assert.equal(s.turn?.deadline, 5000 + 90_000);
  const ended = expireTurn(s, 95_000, timer);
  assert.ok(ended?.ok && ended.state.phase === 'awaiting_clue');
  assert.equal(expireTurn(newMatch(), 10 ** 12, T), null, 'unlimited timers never expire');
});

test('history and statistics record clues, guesses, turn changes and results', () => {
  let s = clue(newMatch(), 'crimson', 2);
  s = must(act(s, O('crimson', 1), { type: 'guess', card: cardsOf(s, 'crimson')[0] }));
  s = must(act(s, O('crimson', 2), { type: 'guess', card: cardsOf(s, 'civilian')[0] }));
  s = clue(s, 'cobalt', 1);
  s = must(act(s, O('cobalt'), { type: 'guess', card: cardsOf(s, 'mole')[0] }));
  assert.deepEqual(s.history.map((e) => e.type), ['clue', 'guess', 'guess', 'end_turn', 'clue', 'guess']);
  const st = s.result!.stats;
  assert.deepEqual(st.teams.crimson, { clues: 1, guesses: 2, correct: 1, enemy: 0, civilians: 1, moles: 0 });
  assert.deepEqual(st.teams.cobalt, { clues: 1, guesses: 1, correct: 0, enemy: 0, civilians: 0, moles: 1 });
  assert.deepEqual(st.players['crimson-op1'], { guesses: 1, correct: 1 });
  assert.deepEqual(computeStats(s), st);
});

test('random legal play always terminates consistently (200 seeded games)', () => {
  for (let g = 0; g < 200; g++) {
    const rng = seededRng(`sim${g}`);
    let s = newMatch(`sim${g}`, 'random');
    for (let step = 0; step < 200 && s.phase !== 'completed'; step++) {
      const team = (s.turn!.owner as { team: TeamId }).team;
      if (s.phase === 'awaiting_clue') {
        s = must(act(s, H(team), { type: 'clue', word: `W${step}X`, count: [0, 1, 2, 3, null][Math.floor(rng() * 5)] }));
        continue;
      }
      const hidden = s.reveals.map((r, i) => (r ? -1 : i)).filter((i) => i >= 0);
      if (s.turn!.guessesMade > 0 && rng() < 0.2) s = must(act(s, O(team), { type: 'end_turn' }));
      else s = must(act(s, O(team), { type: 'guess', card: hidden[Math.floor(rng() * hidden.length)] }));
    }
    assert.equal(s.phase, 'completed', `game ${g} finished`);
    for (const t of ['crimson', 'cobalt'] as const) assert.equal(s.remaining[t], cardsOf(s, t).length);
    const w = s.result!.outcome.kind === 'team_win' ? s.result!.outcome.team : null;
    assert.ok(s.result!.reason === 'mole_revealed' || s.remaining[w!] === 0);
  }
});

test('room runner: views never expose the key to operatives or spectators during play', () => {
  const room = createRoom('ABCDE', 'classic', 0);
  const [h1, o1, h2, o2, spec] = ['A', 'B', 'C', 'D', 'E'].map((n) => addGuest(room, n, 0).player);
  Object.assign(h1, { team: 'crimson', role: 'handler' });
  Object.assign(o1, { team: 'crimson', role: 'operative' });
  Object.assign(h2, { team: 'cobalt', role: 'handler' });
  Object.assign(o2, { team: 'cobalt', role: 'operative' });
  room.settings.startingTeam = 'crimson';
  assert.ok(startCompetitiveMatch(room, defaultBank(), seededRng('r'), 'r', 0).ok);
  for (const p of [o1, o2, spec]) {
    const v = projectView(room, p.id);
    assert.equal(v.key, null);
    assert.ok(v.match!.cards.every((c) => c.reveal === null));
    assert.ok(!JSON.stringify(v).includes('"identities"'));
  }
  assert.equal(projectView(room, h1.id).key?.kind, 'competitive');
  const m = room.match!;
  const bad = applyGameMessage(room, o1.id, { t: 'clue', word: 'ORBIT', count: 1, match: m.id, rev: m.revision }, 1);
  assert.equal(bad.ok, false, 'operatives cannot clue');
  assert.ok(applyGameMessage(room, h1.id, { t: 'clue', word: 'ORBIT', count: 1, match: m.id, rev: m.revision }, 1).ok);
  assert.equal(room.match!.phase, 'guessing');
});
