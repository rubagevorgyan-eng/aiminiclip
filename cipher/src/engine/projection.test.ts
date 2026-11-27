import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dimensions } from '../shared/board.ts';
import type { CompetitiveIdentity, DuetIdentity, Player, PrivateMatchState, SecretKey, ServerRoom } from '../shared/types.ts';
import { addGuest, createRoom } from '../server/room.ts';
import { projectView } from './projection.ts';

const SEED = 'secret-seed-xyz';
const PORTRAIT = 987654321;

function room(key: SecretKey, mode: 'classic' | 'duet'): { room: ServerRoom; seat: (role: Player['role'], team?: Player['team'], side?: Player['side']) => Player } {
  const r = createRoom('ABCDE', mode, 0);
  const d = dimensions(5);
  const match: PrivateMatchState = {
    id: 'm_1', revision: 0, rules: { suggestions: true, bonusGuess: true, specialClues: true, tokens: 9 }, startingTeam: null, mode, dimensions: d, phase: 'guessing', resumePhase: null, turn: null, history: [],
    suggestions: [
      { card: 3, by: 'x', owner: { kind: 'team', team: 'crimson' }, at: 0 },
    ],
    remaining: {}, result: null, startedAt: 0,
    seed: SEED, words: Array.from({ length: d.cards }, (_, i) => `WORD${i}`), key,
    portraits: Array(d.cards).fill(PORTRAIT), reveals: Array(d.cards).fill(null), civilianFor: Array.from({ length: d.cards }, () => []),
  };
  r.match = match;
  return {
    room: r,
    seat: (role, team = null, side = null) => {
      const p = addGuest(r, 'n', 0).player;
      Object.assign(p, { role, team, side });
      return p;
    },
  };
}

const competitive: SecretKey = { kind: 'competitive', identities: Array.from({ length: 25 }, (_, i): CompetitiveIdentity => (i === 0 ? 'mole' : i % 2 ? 'crimson' : 'cobalt')) };
const duetKey: SecretKey = {
  kind: 'cooperative',
  sides: {
    north: Array.from({ length: 25 }, (_, i): DuetIdentity => (i < 8 ? 'agent' : i < 10 ? 'mole' : 'civilian')),
    south: Array.from({ length: 25 }, (_, i): DuetIdentity => (i > 16 ? 'agent' : i < 2 ? 'mole' : 'civilian')),
  },
};

/** Fails if any secret value shows up anywhere in what a client would receive. */
function assertNoSecrets(json: string) {
  assert.ok(!json.includes(SEED), 'seed leaked');
  assert.ok(!json.includes(String(PORTRAIT)), 'portrait seed leaked');
  for (const word of ['"mole"', '"crimson"', '"cobalt"', '"agent"', '"civilian"']) {
    // Team names legitimately appear on players/suggestions; identities must not appear as key arrays.
    if (word === '"crimson"' || word === '"cobalt"') continue;
    assert.ok(!json.includes(word), `${word} leaked`);
  }
  assert.ok(!json.includes('"identities"'), 'key leaked');
  assert.ok(!json.includes('"sides"'), 'duet key leaked');
  assert.ok(!json.includes('"token"'), 'session token leaked');
}

test('operatives and spectators get no key, seed, portraits or tokens', () => {
  const { room: r, seat } = room(competitive, 'classic');
  const op = seat('operative', 'cobalt');
  const spec = seat('spectator');
  for (const p of [op, spec]) {
    const view = projectView(r, p.id);
    assert.equal(view.key, null);
    assertNoSecrets(JSON.stringify(view));
  }
});

test('a handler sees the competitive key, nothing else secret', () => {
  const { room: r, seat } = room(competitive, 'classic');
  const h = seat('handler', 'crimson');
  const view = projectView(r, h.id);
  assert.equal(view.key?.kind, 'competitive');
  const json = JSON.stringify({ ...view, key: null });
  assert.ok(!json.includes(SEED) && !json.includes(String(PORTRAIT)) && !json.includes('"token"'));
});

test('a Duet player sees only their own side', () => {
  const { room: r, seat } = room(duetKey, 'duet');
  const north = seat('operative', null, 'north');
  const view = projectView(r, north.id);
  assert.equal(view.key?.kind, 'cooperative');
  assert.deepEqual(view.key && view.key.kind === 'cooperative' ? view.key.identities : null, duetKey.kind === 'cooperative' ? duetKey.sides.north : null);
  assert.ok(!JSON.stringify(view).includes('"sides"'), 'other side leaked');
});

test('suggestions stay within the suggesting team', () => {
  const { room: r, seat } = room(competitive, 'classic');
  const mate = seat('operative', 'crimson');
  const rival = seat('operative', 'cobalt');
  assert.equal(projectView(r, mate.id).match?.suggestions.length, 1);
  assert.equal(projectView(r, rival.id).match?.suggestions.length, 0);
});

test('revealed cards carry identity and portrait; the full key is declassified only when completed', () => {
  const { room: r, seat } = room(competitive, 'classic');
  const op = seat('operative', 'cobalt');
  r.match!.reveals[2] = { identity: { kind: 'competitive', identity: 'cobalt' }, portrait: { seed: 42 }, by: op.id, turn: 1, at: 0 };
  let view = projectView(r, op.id);
  assert.equal(view.match?.cards[2].reveal?.portrait?.seed, 42);
  assert.equal(view.match?.cards[1].reveal, null);
  assert.equal(view.match?.declassified, null);
  r.match!.phase = 'completed';
  view = projectView(r, op.id);
  assert.equal(view.match?.declassified?.kind, 'competitive');
});

test('unknown viewers get no key', () => {
  const { room: r } = room(competitive, 'classic');
  const view = projectView(r, 'p_nobody');
  assert.equal(view.key, null);
  assert.equal(view.match?.suggestions.length, 0);
});
