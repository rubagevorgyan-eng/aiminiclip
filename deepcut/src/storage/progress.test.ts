import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RoundRecord } from '../engine/machine.ts';
import { addDaily, addGame, addRecent, currentStreak, emptyProgress, loadProgress, PROGRESS_KEY, saveProgress } from './progress.ts';
import { memoryKV } from './storage.ts';

const recs: RoundRecord[] = [
  { questionId: 'a', outcome: 'correct', answer: 'X', rarity: 'mythic', points: 100 },
  { questionId: 'b', outcome: 'timeout', points: 0 },
];
const day = (_date?: string) => ({ ids: ['a', 'b'], records: recs, score: 100 });

test('addGame updates lifetime stats', () => {
  const p = addGame(addGame(emptyProgress(), recs, 100), [], 40);
  assert.equal(p.games, 2);
  assert.equal(p.bestDepth, 100);
  assert.equal(p.totalDepth, 140);
  assert.equal(p.correct, 1);
  assert.equal(p.tiers.mythic, 1);
});

test('daily: one completion per date, streaks continue on consecutive days', () => {
  let p = addDaily(emptyProgress(), '2026-11-24', day('2026-11-24'));
  p = addDaily(p, '2026-11-24', day('2026-11-24'));
  assert.equal(p.games, 1, 'second completion of the same day is ignored');
  p = addDaily(p, '2026-11-25', day('2026-11-25'));
  assert.equal(p.daily.streak, 2);
  assert.equal(currentStreak(p, '2026-11-26'), 2, 'still alive the next day');
  assert.equal(currentStreak(p, '2026-11-27'), 0, 'broken after a missed day');
  p = addDaily(p, '2026-11-27', day('2026-11-27'));
  assert.equal(p.daily.streak, 1);
  assert.equal(p.daily.longest, 2);
  // An earlier day recorded late (closed out on reopen) still joins the streak.
  p = addDaily(p, '2026-11-26', day());
  assert.equal(p.daily.streak, 4);
  assert.equal(p.daily.last, '2026-11-27');
});

test('the same game id is never counted twice', () => {
  let p = addGame(emptyProgress(), recs, 100, 'game-1');
  p = addGame(p, recs, 100, 'game-1');
  assert.equal(p.games, 1);
  p = addGame(p, recs, 50, 'game-2');
  assert.equal(p.games, 2);
});

test('recent list keeps unique ids, newest last, capped', () => {
  let p = emptyProgress();
  for (let i = 0; i < 10; i++) p = addRecent(p, [`q${i}a`, `q${i}b`, `q${i}c`]);
  assert.equal(p.recent.length, 21);
  assert.equal(p.recent[p.recent.length - 1], 'q9c');
  p = addRecent(p, ['q5a']);
  assert.equal(p.recent.filter((x) => x === 'q5a').length, 1);
});

test('storage: round trip, and corrupt or foreign data falls back to defaults', () => {
  const kv = memoryKV();
  const p = addGame(emptyProgress(), recs, 100);
  saveProgress(p, kv);
  assert.deepEqual(loadProgress(kv), p);
  kv.setItem(PROGRESS_KEY, '{not json');
  assert.deepEqual(loadProgress(kv), emptyProgress());
  kv.setItem(PROGRESS_KEY, JSON.stringify({ v: 99, games: 'x' }));
  assert.deepEqual(loadProgress(kv), emptyProgress());
});
