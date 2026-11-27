import assert from 'node:assert/strict';
import { test } from 'node:test';
import { familyFor, pickPortrait, portraitFileName, PORTRAIT_FAMILIES } from '../../art/portrait.ts';
import manifest from '../../art/portraits.manifest.json' with { type: 'json' };
import type { PublicMatchState, RevealedIdentity } from '../../shared/types.ts';
import { diffMatch } from './diff.ts';
import { boardDelay, boardPlan, frameAt, FX, planDecode, PLANS } from './timing.ts';

// ---------- Timing (deliberately slow) ----------
test('characters resolve one at a time every 80–110 ms; a typical word takes 0.8–1.2 s', () => {
  const p = PLANS.word(6);
  assert.ok(p.charMs >= 80 && p.charMs <= 110, `charMs ${p.charMs}`);
  assert.ok(p.total >= 800 && p.total <= 1200, `word total ${p.total}`);
  for (const len of [4, 5, 7, 8]) {
    const t = PLANS.word(len).total;
    assert.ok(t >= 700 && t <= 1200, `${len} letters: ${t}`);
  }
});

test('incoming clue 1.2–2 s; reveal label within the 0.8–1.2 s reveal; banners 2.5–3.5 s', () => {
  for (const word of ['TIDE', 'MARITIME', 'LIGHTHOUSE']) {
    const w = PLANS.clueWord(word.length);
    const n = PLANS.clueNumber(w);
    assert.ok(n.total >= 1200 && n.total <= 2000, `${word}: ${n.total}`);
  }
  assert.ok(PLANS.revealLabel('Crimson agent'.length).total <= 1200);
  for (const banner of ['MISSION ACCOMPLISHED', 'ACCESS COMPROMISED', 'MISSION FAILED']) {
    const t = PLANS.banner(banner.length, 400).total;
    assert.ok(t >= 2000 && t <= 3500, `${banner}: ${t}`);
  }
  assert.ok(PLANS.banner('MISSION ACCOMPLISHED'.length, 400).total >= 2500);
});

test('long text adapts instead of becoming instant', () => {
  const p = planDecode(60, { maxTotal: 3000 });
  assert.ok(p.charMs >= FX.adaptiveFloorMs && p.charMs < FX.charMs, 'speeds up, but never below the floor');
  assert.ok(p.total <= 3000 || p.charMs === FX.adaptiveFloorMs);
  assert.equal(planDecode(60).charMs, FX.charMs, 'without a budget the speed stays 95 ms');
});

test('board initialization: parallel diagonal batches, every size finishes within 3 s', () => {
  for (const size of [5, 6, 7, 8, 9, 10]) {
    const cards = size * size;
    const totals = Array.from({ length: cards }, (_, i) => boardPlan(i, size, 12).total);
    assert.ok(Math.max(...totals) <= 3000, `${size}×${size}: ${Math.max(...totals)} ms`);
    const batches = new Set(Array.from({ length: cards }, (_, i) => boardDelay(i, size)));
    assert.ok(batches.size <= 2 * size - 1, 'cards share start times (not one after another)');
  }
  assert.equal(boardDelay(0, 10), 0);
  assert.equal(boardDelay(99, 10), 1100);
});

test('frames: typed left to right, each character scrambles before resolving, final text exact', () => {
  const word = 'HARBOR';
  const p = PLANS.word(word.length);
  assert.equal(frameAt(word, p, 0).text.slice(1).trim(), '', 'at the start only the first character has been typed');
  let resolvedBefore = 0;
  for (let t = 0; t < p.total; t += 20) {
    const f = frameAt(word, p, t, 3);
    const resolved = [...word].findIndex((ch, i) => f.text[i] !== ch);
    const count = resolved < 0 ? word.length : resolved;
    assert.ok(count >= resolvedBefore - 1, 'progress never jumps backwards (rare flicker allowed)');
    resolvedBefore = Math.max(resolvedBefore, count);
  }
  // Character i is scrambling between typed(i) and resolved(i), and correct after.
  for (let i = 0; i < word.length; i++) {
    const typed = i * p.charMs;
    assert.equal(frameAt(word, p, typed - 1, 1).text[i], ' ', `char ${i} not yet typed`);
    assert.ok(FX.glyphs.includes(frameAt(word, p, typed + 5, 1).text[i]), `char ${i} scrambling`);
  }
  assert.deepEqual(frameAt(word, p, p.total), { text: word, cursor: null, done: true });
  assert.equal(frameAt('A B', planDecode(3), 300).text[1], ' ', 'spaces stay spaces');
  assert.equal(frameAt('NEW', planDecode(3, { delay: 100 }), 0, 0, 'OLD').text, 'OLD', 'rematch starts from the old word');
});

// ---------- Portraits ----------
test('portrait families and slots: 68-portrait collection, predictable names', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(PORTRAIT_FAMILIES).map(([k, v]) => [k, v.target])), { crimson: 16, cobalt: 16, civilian: 12, assassin: 8, duet: 16 });
  assert.equal(manifest.target, 68);
  assert.equal(portraitFileName('crimson', 3), 'crimson-03.webp');
  const id = (identity: string, coop = false): RevealedIdentity => (coop ? { kind: 'cooperative', identity: identity as 'agent', judgedBy: 'north' } : { kind: 'competitive', identity: identity as 'crimson' });
  assert.equal(familyFor(id('crimson')), 'crimson');
  assert.equal(familyFor(id('mole')), 'assassin');
  assert.equal(familyFor(id('civilian')), 'civilian');
  assert.equal(familyFor(id('agent', true)), 'duet');
  assert.equal(familyFor({ kind: 'cooperative', identity: 'mole', judgedBy: 'south' }), 'assassin');
});

test('portrait choice depends only on the revealed identity and the card’s random seed, never the word', () => {
  const crimson: RevealedIdentity = { kind: 'competitive', identity: 'crimson' };
  for (let seed = 0; seed < 200; seed++) {
    const a = pickPortrait(crimson, seed);
    assert.deepEqual(a, pickPortrait(crimson, seed), 'deterministic');
    assert.ok(a.slot >= 1 && a.slot <= 16);
  }
  assert.equal(pickPortrait.length, 2, 'no word parameter exists');
  assert.equal(pickPortrait(crimson, 5).src, manifest.supplied ? pickPortrait(crimson, 5).src : null, 'no artwork yet: placeholder');
});

// ---------- What animates ----------
const base = (over: Partial<PublicMatchState> = {}): PublicMatchState =>
  ({ id: 'm_1', revision: 5, phase: 'guessing', turn: { number: 2, owner: { kind: 'team', team: 'crimson' }, clue: { word: 'TIDE', count: 2, owner: { kind: 'team', team: 'crimson' }, by: 'p', turn: 2, at: 0 }, guessesMade: 0, guessesAllowed: 3, deadline: null }, cards: [{ index: 0, word: 'A', reveal: null }, { index: 1, word: 'B', reveal: null }], ...over }) as unknown as PublicMatchState;
const reveal = { identity: { kind: 'competitive', identity: 'crimson' }, portrait: { seed: 1 }, by: 'p', turn: 2, at: 0 } as const;

test('diff: nothing replays on first view or after a resync; live changes animate once', () => {
  assert.equal(diffMatch(null, base()).reveals.length, 0, 'first view (load / reconnect): no replay');
  const next = base({ revision: 6, cards: [{ index: 0, word: 'A', reveal }, { index: 1, word: 'B', reveal: null }] } as never);
  assert.deepEqual(diffMatch(base(), next).reveals, [0]);
  const jump = base({ revision: 12, cards: next.cards });
  assert.deepEqual(diffMatch(base(), jump).reveals, [], 'large jump = resync, no animation');
  const clue = base({ revision: 6, turn: { ...base().turn!, number: 3, clue: { ...base().turn!.clue!, word: 'ORBIT', turn: 3 } } });
  assert.equal(diffMatch(base(), clue).clue, 'm_1:3:ORBIT');
  const rematch = base({ id: 'm_2', revision: 0 });
  assert.deepEqual(diffMatch(base(), rematch).init, { matchId: 'm_2', from: ['A', 'B'] });
  assert.equal(diffMatch(base(), base({ revision: 6, phase: 'completed' })).ended, true);
});
