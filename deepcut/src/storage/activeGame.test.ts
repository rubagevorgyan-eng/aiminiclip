import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyQuestions } from '../data/selection.ts';
import { catchUp, initialState, reduce } from '../engine/machine.ts';
import { ACTIVE_KEY, clearActiveDaily, loadActiveDaily, saveActiveDaily } from './activeGame.ts';
import { memoryKV } from './storage.ts';

test('saved daily round-trips with its deadline and resumes after a refresh', () => {
  const kv = memoryKV();
  const qs = dailyQuestions('2026-11-26');
  let s = reduce(initialState, { type: 'START', questions: qs, now: 0 });
  s = catchUp(s, 3000); // countdown over, question 1 running
  s = reduce(s, { type: 'SUBMIT', text: 'definitely wrong', now: 4000 });
  saveActiveDaily('2026-11-26', s, kv);
  const back = loadActiveDaily(kv)!;
  assert.equal(back.date, '2026-11-26');
  assert.deepEqual(back.state, s);
  // Refresh 5s later: same question, same deadline.
  const resumed = catchUp(reduce(initialState, { type: 'LOAD', state: back.state }), 9000);
  assert.equal(resumed.phase, 'QUESTION');
  assert.equal(resumed.phaseEndsAt, s.phaseEndsAt);
  clearActiveDaily(kv);
  assert.equal(loadActiveDaily(kv), null);
});

test('saved daily is discarded when corrupt or when its questions left the bank', () => {
  const kv = memoryKV();
  kv.setItem(ACTIVE_KEY, '{"v":1,"date":');
  assert.equal(loadActiveDaily(kv), null);
  const qs = dailyQuestions('2026-11-26');
  saveActiveDaily('2026-11-26', reduce(initialState, { type: 'START', questions: qs, now: 0 }), kv);
  const raw = JSON.parse(kv.getItem(ACTIVE_KEY)!);
  raw.ids[0] = 'removed-question';
  kv.setItem(ACTIVE_KEY, JSON.stringify(raw));
  assert.equal(loadActiveDaily(kv), null);
});
