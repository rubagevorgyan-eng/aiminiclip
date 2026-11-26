import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyNumber, dailyQuestions, msUntilNextDaily, previousDateKey, unlimitedQuestions, utcDateKey } from './selection.ts';
import { QUESTIONS } from './questions.ts';
import { mulberry32 } from '../utils/random.ts';

const ids = (qs: { id: string }[]) => qs.map((q) => q.id);

test('UTC date helpers', () => {
  assert.equal(utcDateKey(Date.parse('2026-11-26T23:59:59Z')), '2026-11-26');
  assert.equal(utcDateKey(Date.parse('2026-11-27T00:00:00Z')), '2026-11-27');
  assert.equal(previousDateKey('2026-03-01'), '2026-02-28');
  assert.equal(dailyNumber('2026-11-01'), 1);
  assert.equal(dailyNumber('2026-11-26'), 26);
  assert.equal(msUntilNextDaily(Date.parse('2026-11-26T23:00:00Z')), 3_600_000);
});

test('daily: same date gives the same 7 unique questions; dates differ', () => {
  const a = ids(dailyQuestions('2026-11-26'));
  assert.deepEqual(a, ids(dailyQuestions('2026-11-26')));
  assert.equal(new Set(a).size, 7);
  assert.notDeepEqual(a, ids(dailyQuestions('2026-11-27')));
  // Order of the bank array must not matter.
  const shuffledPool = [...QUESTIONS.map((q) => q.id)].reverse().sort();
  assert.deepEqual(a, ids(dailyQuestions('2026-11-26', shuffledPool)));
});

test('unlimited: 7 unique, avoids recent questions when possible', () => {
  const rand = mulberry32(1);
  const recent = ids(QUESTIONS.slice(0, 40));
  for (let i = 0; i < 20; i++) {
    const g = ids(unlimitedQuestions(recent, rand));
    assert.equal(new Set(g).size, 7);
    assert.ok(g.every((id) => !recent.includes(id)), 'should avoid recent');
  }
  // Too few fresh questions: fills with the least recently played, still unique.
  const almostAll = ids(QUESTIONS.slice(0, 47));
  const g = ids(unlimitedQuestions(almostAll, rand));
  assert.equal(new Set(g).size, 7);
  assert.ok(g.includes(almostAll[0]));
});
