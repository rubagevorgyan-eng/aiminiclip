import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEV_WORDS } from '../client/dev/fixtures.ts';
import { applyLobby } from '../server/lobby.ts';
import { handle, hello, housekeeping } from '../server/live.ts';
import { createRoom } from '../server/room.ts';
import { BOARD_SIZES, CUSTOM_WORDS, DEFAULT_SETTINGS, UNLIMITED_TIMER, competitiveLayout } from '../shared/config.ts';
import { seededRng } from '../shared/random.ts';
import type { BoardSize, CompetitiveIdentity, PrivateMatchState, RoomSettings, ServerRoom, TeamId } from '../shared/types.ts';
import { customEntries, sanitizeCustomWords, splitWordList } from '../vocab/custom.ts';
import { defaultBank, generateBoardWords } from '../vocab/index.ts';
import { applyAction, createCompetitiveMatch, type Actor, type EngineAction, type EngineResult } from './competitive.ts';
import { applyDuetAction, createDuetMatch } from './duet.ts';
import { settingsProblems, startBlockers } from './lobbyRules.ts';
import { projectView } from './projection.ts';
import { layoutFor, manualLayoutProblems } from './settings.ts';

const custom = (patch: Partial<RoomSettings> = {}): RoomSettings => ({ ...DEFAULT_SETTINGS.custom, ...patch });
const T = UNLIMITED_TIMER;
const words = (n: number) => DEV_WORDS.slice(0, n);
const H = (t: TeamId): Actor => ({ id: `${t}-h`, role: 'handler', team: t, isHost: false });
const O = (t: TeamId): Actor => ({ id: `${t}-o`, role: 'operative', team: t, isHost: false });
const act = (s: PrivateMatchState, a: Actor, action: EngineAction): EngineResult => applyAction(s, a, action, { ref: { match: s.id, rev: s.revision }, now: 1, timer: T });
const must = (r: EngineResult) => {
  if (!r.ok) assert.fail(`${r.code}: ${r.message}`);
  return r.state;
};
const own = (s: PrivateMatchState, t: TeamId) => (s.key as { identities: CompetitiveIdentity[] }).identities.map((x, i) => (x === t && !s.reveals[i] ? i : -1)).filter((i) => i >= 0);

// ---------- Layouts ----------
test('auto layouts: every board size × 1–5 assassins is valid and balanced', () => {
  for (const size of BOARD_SIZES) {
    for (let moles = 1; moles <= 5; moles++) {
      const s = custom({ boardSize: size, moles });
      const l = layoutFor(s);
      assert.equal(l.starting + l.second + l.civilians + l.moles, size * size);
      assert.ok(l.starting === l.second + 1 && l.second > 0 && l.civilians >= 0 && l.moles === moles);
      assert.deepEqual(settingsProblems(s), [], `${size} ${moles}`);
    }
  }
  assert.deepEqual(layoutFor(custom({ boardSize: 10, moles: 1 })), competitiveLayout(10, 1));
});

test('manual layouts: valid totals and positive agents required; problems reported, never altered', () => {
  assert.deepEqual(manualLayoutProblems({ starting: 9, second: 8, civilians: 7, moles: 1 }, 5), []);
  assert.match(manualLayoutProblems({ starting: 9, second: 8, civilians: 7, moles: 2 }, 5)[0], /adds up to 26/);
  assert.match(manualLayoutProblems({ starting: 0, second: 8, civilians: 16, moles: 1 }, 5)[0], /at least one agent/);
  assert.match(manualLayoutProblems({ starting: 9, second: 8, civilians: 2, moles: 6 }, 5).join(), /Assassins must be between 1 and 5/);
  const s = custom({ boardSize: 6, manualLayout: { starting: 9, second: 8, civilians: 7, moles: 1 } });
  assert.ok(settingsProblems(s).some((p) => /36/.test(p)), 'size changed: mismatch is reported');
  assert.deepEqual(s.manualLayout, { starting: 9, second: 8, civilians: 7, moles: 1 }, 'not silently rewritten');
});

test('engine honors manual layouts and rejects impossible ones', () => {
  const layout = { cards: 36, starting: 14, second: 10, civilians: 7, moles: 5 };
  const m = createCompetitiveMatch({ id: 'm', mode: 'custom', settings: { boardSize: 6, moles: 5, startingTeam: 'cobalt', timer: T }, words: words(36), rng: seededRng('m'), seed: 'm', now: 0, layout });
  const ids = (m.key as { identities: CompetitiveIdentity[] }).identities;
  const n = (x: CompetitiveIdentity) => ids.filter((i) => i === x).length;
  assert.deepEqual([n('cobalt'), n('crimson'), n('civilian'), n('mole')], [14, 10, 7, 5]);
  assert.throws(() => createCompetitiveMatch({ id: 'm', mode: 'custom', settings: { boardSize: 6, moles: 1, startingTeam: 'cobalt', timer: T }, words: words(36), rng: seededRng('m'), seed: 'm', now: 0, layout: { ...layout, civilians: 8 } }));
});

// ---------- Rule switches ----------
const competitive = (rules: Partial<PrivateMatchState['rules']>) =>
  createCompetitiveMatch({ id: 'm_c', mode: 'custom', settings: { boardSize: 5, moles: 1, startingTeam: 'crimson', timer: T }, words: words(25), rng: seededRng('r'), seed: 'r', now: 0, rules: { suggestions: true, bonusGuess: true, specialClues: true, tokens: 9, ...rules } });

test('bonus guess off: exactly the clue number', () => {
  let s = must(act(competitive({ bonusGuess: false }), H('crimson'), { type: 'clue', word: 'ORBIT', count: 2 }));
  assert.equal(s.turn?.guessesAllowed, 2);
  s = must(act(s, O('crimson'), { type: 'guess', card: own(s, 'crimson')[0] }));
  s = must(act(s, O('crimson'), { type: 'guess', card: own(s, 'crimson')[0] }));
  assert.equal(s.phase, 'awaiting_clue', 'turn ends after N correct guesses');
});

test('special clues off: 0 and unlimited are rejected', () => {
  const s = competitive({ specialClues: false });
  for (const count of [0, null]) {
    const r = act(s, H('crimson'), { type: 'clue', word: 'ORBIT', count });
    assert.ok(!r.ok && /Special clues/.test(r.message));
  }
  must(act(s, H('crimson'), { type: 'clue', word: 'ORBIT', count: 3 }));
});

test('suggestions off: rejected in competitive and cooperative play', () => {
  const s = must(act(competitive({ suggestions: false }), H('crimson'), { type: 'clue', word: 'ORBIT', count: 2 }));
  assert.equal(act(s, O('crimson'), { type: 'suggest', card: 0, on: true }).ok, false);
  const d = createDuetMatch({ id: 'm_d', words: words(25), rng: seededRng('d'), seed: 'd', now: 0, timer: T, firstSide: 'north', rules: { suggestions: false, bonusGuess: false, specialClues: true, tokens: 9 } });
  const A: Actor = { id: 'a', role: 'operative', team: null, side: 'north', isHost: false };
  const B: Actor = { id: 'b', role: 'operative', team: null, side: 'south', isHost: false };
  const g = applyDuetAction(d, A, { type: 'clue', word: 'ORBIT', count: 1 }, { ref: { match: d.id, rev: 0 }, now: 1, timer: T });
  assert.ok(g.ok);
  assert.equal(applyDuetAction(g.state, B, { type: 'suggest', card: 0, on: true }, { ref: { match: d.id, rev: 1 }, now: 1, timer: T }).ok, false);
});

test('cooperative token budgets 10 and 11: sudden death after exactly that many turns', () => {
  for (const tokens of [10, 11]) {
    let s = createDuetMatch({ id: 'm_t', words: words(25), rng: seededRng(`t${tokens}`), seed: 't', now: 0, timer: T, firstSide: 'north', rules: { suggestions: true, bonusGuess: false, specialClues: true, tokens } });
    assert.equal(s.turn?.turnsLeft, tokens);
    const sides = (s.key as { sides: Record<'north' | 'south', string[]> }).sides;
    const actor = (side: 'north' | 'south'): Actor => ({ id: side, role: 'operative', team: null, side, isHost: false });
    for (let t = 0; t < tokens; t++) {
      const giver = (s.turn!.owner as { side: 'north' | 'south' }).side;
      const guesser = giver === 'north' ? 'south' : 'north';
      s = applyDuetAction(s, actor(giver), { type: 'clue', word: 'ORBIT', count: 1 }, { ref: { match: s.id, rev: s.revision }, now: 1, timer: T }).ok ? (applyDuetAction(s, actor(giver), { type: 'clue', word: 'ORBIT', count: 1 }, { ref: { match: s.id, rev: s.revision }, now: 1, timer: T }) as { state: PrivateMatchState }).state : s;
      const civ = sides[giver].findIndex((x, i) => x === 'civilian' && !s.reveals[i] && !s.civilianFor[i].includes(giver));
      const r = applyDuetAction(s, actor(guesser), { type: 'guess', card: civ }, { ref: { match: s.id, rev: s.revision }, now: 1, timer: T });
      assert.ok(r.ok);
      s = r.state;
      if (t < tokens - 1) assert.equal(s.phase, 'awaiting_clue');
    }
    assert.equal(s.phase, 'sudden_death');
  }
});

// ---------- Custom words ----------
test('custom words: sanitized, upper-cased, deduplicated, length- and safety-filtered, capped', () => {
  const { words: w, report } = sanitizeCustomWords(['lantern', 'LANTERN', ' Café ', 'two words', 'x', 'a'.repeat(20), 'rock-star', "o'clock", 'shit', 'Shits', '\u0000bad', 'harbor']);
  assert.deepEqual(w, ['LANTERN', 'CAFÉ', 'ROCK-STAR', "O'CLOCK", 'BAD', 'HARBOR'], 'control characters are stripped, not kept');
  assert.deepEqual(report, { received: 12, kept: 6, invalid: 3, duplicates: 1, blocked: 2, overLimit: 0 });
  const many = sanitizeCustomWords(Array.from({ length: 500 }, (_, i) => `WORD${i}`));
  assert.equal(many.words.length, CUSTOM_WORDS.maxWords);
  assert.equal(many.report.overLimit, 100);
  assert.deepEqual(splitWordList('a, b;c\nd\te'), ['a', 'b', 'c', 'd', 'e']);
});

test('custom-only boards draw from the list; too few words is reported, never padded', () => {
  const list = sanitizeCustomWords(DEV_WORDS.slice(0, 40)).words;
  const pool = { version: 't', entries: [...defaultBank().entries, ...customEntries(list)] };
  const b = generateBoardWords(pool, { size: 6, packs: ['custom'], difficulty: 'expert' }, seededRng('c'));
  assert.equal(b.entries.length, 36);
  assert.ok(b.entries.every((e) => e.category === 'custom'));
  assert.ok(settingsProblems(custom({ boardSize: 7, wordPacks: ['custom'], customWords: list })).some((p) => /40 words; a 7×7 board needs 49/.test(p)));
  assert.ok(settingsProblems(custom({ wordPacks: ['custom'], customWords: [] })).some((p) => /no words were imported/.test(p)));
  const mixed = generateBoardWords(pool, { size: 10, packs: ['custom', 'general'], difficulty: 'balanced' }, seededRng('m'));
  assert.equal(mixed.entries.length, 100);
});

// ---------- Rooms: host permissions, locks, start, timers ----------
function room(mode: 'custom' = 'custom') {
  const r = createRoom('CUSTM', mode, 0);
  const ids = ['Host', 'B', 'C', 'D'].map((n) => {
    const h = hello(r, { t: 'hello', v: 1, room: 'CUSTM', name: n }, 0);
    assert.ok(h.ok);
    return h.playerId;
  });
  return { r, ids };
}
const deps = (now: number) => ({ bank: defaultBank(), rng: () => seededRng(`x${now}`), now });
function seatClassic(r: ServerRoom, ids: string[]) {
  handle(r, ids[0], { t: 'seat', role: 'handler', team: 'crimson' }, deps(1));
  handle(r, ids[1], { t: 'seat', role: 'operative', team: 'crimson' }, deps(1));
  handle(r, ids[2], { t: 'seat', role: 'handler', team: 'cobalt' }, deps(1));
  handle(r, ids[3], { t: 'seat', role: 'operative', team: 'cobalt' }, deps(1));
}

test('settings: host only; bad values rejected with a reason; locked while a match runs', () => {
  const { r, ids } = room();
  const rng = seededRng('l');
  assert.equal(applyLobby(r, ids[1], { t: 'settings', boardSize: 8 }, 1, rng).ok, false);
  for (const bad of [{ moles: 6 }, { moles: 0 }, { duetTokens: 12 }, { timer: { clueSeconds: 45, guessSeconds: 45 } }] as const) {
    const res = applyLobby(r, ids[0], { t: 'settings', ...bad }, 1, rng);
    assert.ok(!res.ok && res.message.length > 10, JSON.stringify(bad));
  }
  seatClassic(r, ids);
  assert.ok(handle(r, ids[0], { t: 'start' }, deps(2)).ok);
  const locked = applyLobby(r, ids[0], { t: 'settings', boardSize: 9 }, 3, rng);
  assert.ok(!locked.ok && /already started/.test(locked.message));
});

test('complete Custom competitive setup: 8×8, manual layout, custom words, rules and timer reach the match', () => {
  const { r, ids } = room();
  const list = DEV_WORDS.slice(0, 101);
  const settings = { mode: 'custom' as const, boardSize: 8 as BoardSize, manualLayout: { starting: 20, second: 19, civilians: 22, moles: 3 }, wordPacks: ['custom' as const, 'general' as const], customWords: list, bonusGuess: false, specialClues: false, suggestions: false, timer: { clueSeconds: 30, guessSeconds: 30 } };
  assert.ok(applyLobby(r, ids[0], { t: 'settings', ...settings }, 1, seededRng('s')).ok);
  seatClassic(r, ids);
  assert.deepEqual(startBlockers(r.settings, r.players), []);
  assert.ok(handle(r, ids[0], { t: 'start' }, deps(1000)).ok);
  const m = r.match!;
  assert.equal(m.words.length, 64);
  const n = (x: CompetitiveIdentity) => (m.key as { identities: CompetitiveIdentity[] }).identities.filter((i) => i === x).length;
  assert.deepEqual([n(m.startingTeam!), n(m.startingTeam === 'crimson' ? 'cobalt' : 'crimson'), n('civilian'), n('mole')], [20, 19, 22, 3]);
  assert.deepEqual(m.rules, { suggestions: false, bonusGuess: false, specialClues: false, tokens: 9 });
  assert.equal(m.turn?.deadline, 1000 + 30_000, 'server deadline');
  const v = projectView(r, ids[1], 1234);
  assert.equal(v.serverNow, 1234);
  assert.equal(v.match?.turn?.deadline, 31_000);
  // Authoritative expiry: the server clock ends the clue turn; nothing happens a moment before.
  assert.equal(housekeeping(r, 30_999).changed, false);
  housekeeping(r, 31_000);
  assert.notEqual((r.match!.turn!.owner as { team: TeamId }).team, m.startingTeam, 'turn passed at the deadline');
});

test('Custom cooperative: Duet engine at 5×5 with the chosen token budget and packs', () => {
  const { r, ids } = room();
  assert.ok(applyLobby(r, ids[0], { t: 'settings', customKind: 'cooperative', duetTokens: 11, boardSize: 9, wordPacks: ['anime', 'gaming'], difficulty: 'hard' }, 1, seededRng('c')).ok);
  handle(r, ids[0], { t: 'seat', role: 'operative', side: 'north' }, deps(1));
  handle(r, ids[1], { t: 'seat', role: 'operative', side: 'south' }, deps(1));
  assert.ok(handle(r, ids[0], { t: 'start' }, deps(2)).ok);
  assert.equal(r.match?.key.kind, 'cooperative');
  assert.equal(r.match?.words.length, 25, 'cooperative stays 5×5');
  assert.equal(r.match?.turn?.turnsLeft, 11);
  const v = projectView(r, ids[2]);
  assert.equal(v.key, null, 'observer gets no key');
});
