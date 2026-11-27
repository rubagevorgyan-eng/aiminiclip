import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEV_WORDS } from '../client/dev/fixtures.ts';
import { DUET, UNLIMITED_TIMER } from '../shared/config.ts';
import { seededRng } from '../shared/random.ts';
import type { DuetIdentity, DuetSide, PrivateMatchState } from '../shared/types.ts';
import { addGuest, createRoom } from '../server/room.ts';
import type { Actor, EngineAction, EngineResult } from './competitive.ts';
import { applyDuetAction, createDuetMatch, duetAgentsTotal, generateDuetKey, otherSide, validateDuetKey } from './duet.ts';
import { projectView } from './projection.ts';

const WORDS = DEV_WORDS.slice(0, 25);
const T = UNLIMITED_TIMER;
const A: Actor = { id: 'pa', role: 'operative', team: null, side: 'north', isHost: true };
const B: Actor = { id: 'pb', role: 'operative', team: null, side: 'south', isHost: false };
const SPEC: Actor = { id: 'ps', role: 'spectator', team: null, side: null, isHost: false };
const who = (s: DuetSide) => (s === 'north' ? A : B);

const newDuet = (seed = 'd1', firstSide: DuetSide = 'north') => createDuetMatch({ id: 'm_duet', words: WORDS, rng: seededRng(seed), seed, now: 0, timer: T, firstSide });
const sides = (s: PrivateMatchState) => (s.key as { sides: Record<DuetSide, DuetIdentity[]> }).sides;
const act = (s: PrivateMatchState, a: Actor, action: EngineAction): EngineResult => applyDuetAction(s, a, action, { ref: { match: s.id, rev: s.revision }, now: 1, timer: T });
function must(r: EngineResult) {
  if (!r.ok) assert.fail(`${r.code}: ${r.message}`);
  return r.state;
}
function refuse(r: EngineResult, code?: string) {
  assert.equal(r.ok, false);
  if (code && !r.ok) assert.equal(r.code, code);
}
/** Hidden cards with identity `a` on `judge`'s key (and optionally `b` on the other key). */
function cards(s: PrivateMatchState, judge: DuetSide, a: DuetIdentity, b?: DuetIdentity) {
  const k = sides(s);
  return k[judge].map((x, i) => (x === a && (!b || k[otherSide(judge)][i] === b) && !s.reveals[i] && !s.civilianFor[i].includes(judge) ? i : -1)).filter((i) => i >= 0);
}
const clue = (s: PrivateMatchState, giver: DuetSide, count: number | null = 2) => must(act(s, who(giver), { type: 'clue', word: 'ORBIT', count }));
const giverOf = (s: PrivateMatchState) => (s.turn!.owner as { side: DuetSide }).side;

// ---------- Keys ----------
test('keys: 9 agents, 13 civilians, 3 moles per side; exact pair table; 3 overlap; 15 unique', () => {
  for (let i = 0; i < 300; i++) {
    const k = generateDuetKey(seededRng(`k${i}`));
    assert.deepEqual(validateDuetKey(k), []);
    assert.equal(k.north.filter((x, j) => x === 'agent' && k.south[j] === 'agent').length, 3);
    assert.equal(k.north.filter((x, j) => x === 'agent' || k.south[j] === 'agent').length, 15);
  }
  assert.equal(DUET.pairs.reduce((n, p) => n + p[2], 0), 25);
  assert.equal(duetAgentsTotal(), 15);
  const bad = generateDuetKey(seededRng('x'));
  bad.north[bad.north.indexOf('civilian')] = 'agent';
  assert.ok(validateDuetKey(bad).length > 0, 'invalid keys are detected');
});

test('keys are independent of the words; reproducible from the seed', () => {
  const a = createDuetMatch({ id: 'm', words: WORDS, rng: seededRng('same'), seed: 's', now: 0, timer: T, firstSide: 'north' });
  const b = createDuetMatch({ id: 'm', words: DEV_WORDS.slice(30, 55), rng: seededRng('same'), seed: 's', now: 0, timer: T, firstSide: 'north' });
  assert.deepEqual(sides(a), sides(b));
  assert.notDeepEqual(sides(a), sides(newDuet('other')));
});

// ---------- Turn flow ----------
test('roles: the clue-giver clues, the partner guesses; spectators do nothing', () => {
  const s = newDuet();
  refuse(act(s, B, { type: 'clue', word: 'ORBIT', count: 1 }), 'not_your_turn');
  refuse(act(s, SPEC, { type: 'clue', word: 'ORBIT', count: 1 }), 'not_allowed');
  const g = clue(s, 'north');
  refuse(act(g, A, { type: 'guess', card: 0 }), 'not_your_turn');
  refuse(act(g, A, { type: 'end_turn' }), 'not_your_turn');
  refuse(act(g, B, { type: 'end_turn' }), 'not_allowed'); // needs one guess
  refuse(act(g, SPEC, { type: 'guess', card: 0 }), 'not_allowed');
});

test('guesses are judged by the clue-giver’s key, never the guesser’s', () => {
  // Agent for the giver (north), mole for the guesser (south): safe.
  let s = clue(newDuet(), 'north');
  const safe = cards(s, 'north', 'agent', 'mole')[0];
  s = must(act(s, B, { type: 'guess', card: safe }));
  assert.equal(s.reveals[safe]?.identity.identity, 'agent');
  // Mole for the giver, agent for the guesser: defeat.
  const deadly = cards(s, 'north', 'mole', 'agent')[0];
  s = must(act(s, B, { type: 'guess', card: deadly }));
  assert.equal(s.phase, 'completed');
  assert.deepEqual(s.result?.outcome, { kind: 'cooperative_loss' });
  assert.equal(s.result?.reason, 'mole_revealed');
});

test('asymmetric civilians: marked for one direction, still live from the other', () => {
  let s = clue(newDuet(), 'north');
  const card = cards(s, 'north', 'civilian', 'agent')[0];
  s = must(act(s, B, { type: 'guess', card }));
  assert.deepEqual(s.civilianFor[card], ['north']);
  assert.equal(s.reveals[card], null, 'not revealed: its other identity stays secret');
  assert.equal(s.phase, 'awaiting_clue');
  assert.equal(giverOf(s), 'south', 'turns alternate');
  s = clue(s, 'south');
  s = must(act(s, A, { type: 'guess', card }));
  assert.equal(s.reveals[card]?.identity.identity, 'agent');
  // A card already known as a civilian for the current giver cannot be guessed again.
  let t = clue(newDuet(), 'north');
  const c2 = cards(t, 'north', 'civilian', 'civilian')[0];
  t = must(act(t, B, { type: 'guess', card: c2 }));
  t = clue(t, 'south');
  t = must(act(t, A, { type: 'guess', card: cards(t, 'south', 'civilian')[0] })); // back to north
  t = clue(t, 'north');
  refuse(act(t, B, { type: 'guess', card: c2 }), 'invalid');
});

test('no number+1 limit: correct guesses continue; tokens are used per turn, not per guess', () => {
  let s = clue(newDuet(), 'north', 1);
  for (let i = 0; i < 6; i++) s = must(act(s, B, { type: 'guess', card: cards(s, 'north', 'agent')[0] }));
  assert.equal(s.phase, 'guessing');
  assert.equal(s.turn?.turnsLeft, 9, 'no token used yet');
  assert.equal(s.remaining.agents, 9);
  s = must(act(s, B, { type: 'end_turn' }));
  assert.equal(s.turn?.turnsLeft, 8);
  assert.equal(giverOf(s), 'south');
  s = clue(s, 'south');
  s = must(act(s, A, { type: 'guess', card: cards(s, 'south', 'civilian')[0] }));
  assert.equal(s.turn?.turnsLeft, 7, 'a civilian ends the turn and uses a token');
});

test('special flow: a side whose 9 agents are found stops giving clues', () => {
  let s = clue(newDuet(), 'north', null);
  while (cards(s, 'north', 'agent').length) s = must(act(s, B, { type: 'guess', card: cards(s, 'north', 'agent')[0] }));
  assert.deepEqual(s.sidesDone, ['north']);
  s = must(act(s, B, { type: 'end_turn' }));
  assert.equal(giverOf(s), 'south');
  s = clue(s, 'south');
  s = must(act(s, A, { type: 'guess', card: cards(s, 'south', 'agent')[0] }));
  s = must(act(s, A, { type: 'end_turn' }));
  assert.equal(giverOf(s), 'south', 'north is done, so south keeps giving clues');
  refuse(act(s, A, { type: 'clue', word: 'TIDE', count: 1 }), 'not_your_turn');
});

test('sudden death: tokens run out → no clues, partner-key guesses, any civilian loses', () => {
  let s = newDuet('sd');
  for (let t = 0; t < DUET.turns; t++) {
    const g = giverOf(s);
    s = clue(s, g);
    s = must(act(s, who(otherSide(g)), { type: 'guess', card: cards(s, g, 'civilian')[0] }));
  }
  assert.equal(s.phase, 'sudden_death');
  assert.equal(s.turn?.turnsLeft, 0);
  refuse(act(s, A, { type: 'clue', word: 'X', count: 1 }), 'wrong_phase');
  refuse(act(s, A, { type: 'end_turn' }), 'wrong_phase');
  // A (north) guesses words that are agents on B's (south) key.
  const good = cards(s, 'south', 'agent')[0];
  s = must(act(s, A, { type: 'guess', card: good }));
  const rv = s.reveals[good]?.identity;
  assert.ok(rv?.kind === 'cooperative' && rv.judgedBy === 'south');
  assert.equal(s.phase, 'sudden_death');
  const lose = must(act(s, B, { type: 'guess', card: cards(s, 'north', 'civilian')[0] }));
  assert.equal(lose.phase, 'completed');
  assert.equal(lose.result?.reason, 'turns_exhausted');
  assert.ok(lose.result?.stats.cooperative?.suddenDeath);
  const mole = must(act(s, B, { type: 'guess', card: cards(s, 'north', 'mole')[0] }));
  assert.equal(mole.result?.reason, 'mole_revealed');
});

test('victory: all 15 unique agents found', () => {
  let s = clue(newDuet('win'), 'north', null);
  while (cards(s, 'north', 'agent').length) s = must(act(s, B, { type: 'guess', card: cards(s, 'north', 'agent')[0] }));
  s = must(act(s, B, { type: 'end_turn' }));
  s = clue(s, 'south', 0);
  while (s.phase !== 'completed') s = must(act(s, A, { type: 'guess', card: cards(s, 'south', 'agent')[0] }));
  assert.deepEqual(s.result?.outcome, { kind: 'cooperative_win' });
  assert.equal(s.result?.stats.cooperative?.agentsFound, 15);
  assert.equal(s.result?.stats.cooperative?.tokensUsed, 1);
  refuse(act(s, A, { type: 'guess', card: 0 }), 'match_over');
});

test('integrity: stale revisions, wrong match, pause; inputs never mutated', () => {
  const s = newDuet();
  const snap = JSON.stringify(s);
  refuse(applyDuetAction(s, A, { type: 'clue', word: 'ORBIT', count: 1 }, { ref: { match: s.id, rev: 3 }, now: 1, timer: T }), 'stale');
  refuse(applyDuetAction(s, A, { type: 'clue', word: 'ORBIT', count: 1 }, { ref: { match: 'm_x', rev: 0 }, now: 1, timer: T }), 'wrong_match');
  refuse(act(s, A, { type: 'clue', word: s.words[0], count: 1 }), 'invalid');
  const p = must(act(s, A, { type: 'pause' }));
  refuse(act(p, A, { type: 'clue', word: 'ORBIT', count: 1 }), 'wrong_phase');
  refuse(act(p, B, { type: 'resume' }), 'not_allowed');
  assert.equal(JSON.stringify(s), snap);
});

// ---------- Privacy ----------
test('privacy: each partner gets only their own key; spectators none; reveals never leak the other key', () => {
  const room = createRoom('ABCDE', 'duet', 0);
  const pa = Object.assign(addGuest(room, 'A', 0).player, { side: 'north', role: 'operative' });
  const pb = Object.assign(addGuest(room, 'B', 0).player, { side: 'south', role: 'operative' });
  const spec = addGuest(room, 'S', 0).player;
  let s = clue(newDuet(), 'north');
  // B guesses an agent for north that is a MOLE on south, and a civilian for north that is an AGENT on south.
  s = must(act(s, { ...B, id: pb.id }, { type: 'guess', card: cards(s, 'north', 'agent', 'mole')[0] }));
  s = must(act(s, { ...B, id: pb.id }, { type: 'guess', card: cards(s, 'north', 'civilian', 'agent')[0] }));
  room.match = s;
  const va = projectView(room, pa.id);
  const vb = projectView(room, pb.id);
  const vs = projectView(room, spec.id);
  assert.ok(va.key?.kind === 'cooperative' && va.key.side === 'north');
  assert.ok(vb.key?.kind === 'cooperative' && vb.key.side === 'south');
  assert.deepEqual(va.key.kind === 'cooperative' && va.key.identities, sides(s).north);
  assert.equal(vs.key, null);
  for (const v of [va, vb, vs]) {
    const json = JSON.stringify(v);
    assert.ok(!json.includes('"sides"') && !json.includes('dev-') && !json.includes('"seed":"'));
    assert.equal(v.match?.declassified, null);
    for (const c of v.match!.cards) {
      if (!c.reveal) assert.ok(!('portrait' in c), 'no art on hidden cards');
      else assert.equal(c.reveal.identity.identity, 'agent', 'revealed agent carries no other-key identity');
    }
  }
  const pub = JSON.stringify({ ...va, key: null });
  assert.ok(!pub.includes('"mole"'), 'north sees nothing about south’s mole');
  const spectatorJson = JSON.stringify(vs);
  assert.ok(!spectatorJson.includes('"identities"'));
});
