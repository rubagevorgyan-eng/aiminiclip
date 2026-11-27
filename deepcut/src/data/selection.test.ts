import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { QuestionMeta } from '../engine/types.ts';
import { mulberry32 } from '../utils/random.ts';
import { GROUPS, MAX_TEMPLATE, dailyNumber, dailyPick, msUntilNextDaily, pickGame, subjectOf, previousDateKey, unlimitedPick, utcDateKey } from './selection.ts';

const INDEX = join(import.meta.dirname, '..', '..', 'public', 'bank', 'index.json');
const bank: QuestionMeta[] = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, 'utf8')).questions : [];
const groupOf = (q: QuestionMeta) => (Object.keys(GROUPS) as (keyof typeof GROUPS)[]).filter((g) => (GROUPS[g] as readonly string[]).includes(q.category));

test('UTC date helpers', () => {
  assert.equal(utcDateKey(Date.parse('2026-11-26T23:59:59Z')), '2026-11-26');
  assert.equal(utcDateKey(Date.parse('2026-11-27T00:00:00Z')), '2026-11-27');
  assert.equal(previousDateKey('2026-03-01'), '2026-02-28');
  assert.equal(dailyNumber('2026-11-01'), 1);
  assert.equal(msUntilNextDaily(Date.parse('2026-11-26T23:00:00Z')), 3_600_000);
});

/** Variety rules every game must meet (when the bank can support them). */
function assertVaried(game: QuestionMeta[], label: string) {
  assert.equal(game.length, 7, label);
  assert.equal(new Set(game.map((q) => q.id)).size, 7, `${label}: duplicate question`);
  assert.equal(new Set(game.map((q) => q.family)).size, 7, `${label}: repeated template family`);
  assert.ok(new Set(game.map((q) => q.category)).size >= 5, `${label}: fewer than 5 categories`);
  for (const g of ['everyday', 'world', 'nature'] as const) assert.ok(game.some((q) => groupOf(q).includes(g)), `${label}: no ${g} question`);
  assert.ok(game.filter((q) => groupOf(q).includes('vocab')).length <= 1, `${label}: more than one vocabulary question`);
  assert.ok(game.some((q) => q.difficulty !== 'easy'), `${label}: all easy`);
  assert.ok(game.filter((q) => !q.broad).length <= MAX_TEMPLATE, `${label}: too many template questions`);
  assert.equal(new Set(game.map(subjectOf)).size, 7, `${label}: two questions on the same subject`);
}

test('real bank: daily picks are deterministic and varied every day for a year', { skip: !bank.length && 'bank not built' }, () => {
  const a = dailyPick('2026-11-27', bank).map((q) => q.id);
  assert.deepEqual(a, dailyPick('2026-11-27', [...bank].reverse()).map((q) => q.id), 'order of the index must not matter');
  assert.notDeepEqual(a, dailyPick('2026-11-28', bank).map((q) => q.id));
  for (let d = 0; d < 365; d++) {
    const key = utcDateKey(Date.parse('2026-11-27T00:00:00Z') + d * 86_400_000);
    assertVaried(dailyPick(key, bank), key);
  }
});

test('real bank: unlimited games are varied and avoid recent questions', { skip: !bank.length && 'bank not built' }, () => {
  const rand = mulberry32(7);
  let recent: string[] = [];
  for (let i = 0; i < 200; i++) {
    const g = unlimitedPick(bank, recent, rand);
    assertVaried(g, `unlimited #${i}`);
    assert.ok(g.every((q) => !recent.includes(q.id)), 'repeated a recent question');
    recent = [...recent, ...g.map((q) => q.id)].slice(-21);
  }
});

test('pickGame relaxes gracefully on a tiny pool', () => {
  const tiny: QuestionMeta[] = Array.from({ length: 9 }, (_, i) => ({ id: `q${i}`, text: `Q${i}`, category: 'Geography', difficulty: 'easy', family: `f${i}`, n: 10 }));
  const g = pickGame(tiny, mulberry32(1));
  assert.equal(g.length, 7);
  assert.equal(new Set(g.map((q) => q.id)).size, 7);
});
