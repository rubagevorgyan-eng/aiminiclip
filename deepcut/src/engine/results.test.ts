import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS } from '../data/questions.ts';
import type { RoundRecord } from './machine.ts';
import { achievement, otherAnswers, rarestRecord, shareText } from './results.ts';

const recs: RoundRecord[] = [
  { questionId: 'a', outcome: 'timeout', points: 0 },
  { questionId: 'b', outcome: 'correct', answer: 'Secret One', guess: 'secret one', rarity: 'common', points: 10 },
  { questionId: 'c', outcome: 'correct', answer: 'Secret Two', rarity: 'uncommon', points: 15 },
  { questionId: 'd', outcome: 'correct', answer: 'Secret Three', rarity: 'rare', points: 60 },
  { questionId: 'e', outcome: 'correct', answer: 'Secret Four', rarity: 'legendary', points: 85 },
  { questionId: 'f', outcome: 'correct', answer: 'Secret Five', rarity: 'mythic', points: 100 },
  { questionId: 'g', outcome: 'skipped', points: 0 },
];

test('achievement titles follow the depth bands', () => {
  const t = (m: number) => achievement(m).title;
  assert.deepEqual([0, 99, 100, 199, 200, 299, 300, 399, 400, 549, 550, 700].map(t), [
    'Surface Scratcher', 'Surface Scratcher', 'Copper Digger', 'Copper Digger', 'Silver Seeker', 'Silver Seeker',
    'Gold Prospector', 'Gold Prospector', 'Emerald Explorer', 'Emerald Explorer', 'Diamond Master', 'Diamond Master',
  ]);
  assert.equal(achievement(425).zone, 'Emerald Hollow');
});

test('rarest answer', () => {
  assert.equal(rarestRecord(recs)?.answer, 'Secret Five');
  assert.equal(rarestRecord([recs[0]]), null);
});

test('other answers exclude the player answer and span rarities', () => {
  const q = QUESTIONS.find((x) => x.id === 'sci-planets-dwarf-planets')!;
  const others = otherAnswers(q, 'Earth');
  assert.equal(others.length, 3);
  assert.ok(!others.some((a) => a.name === 'Earth'));
  assert.equal(others[0].rarity, 'mythic');
  assert.equal(others[2].rarity, 'common');
});

test('share text is spoiler-free and complete', () => {
  const daily = shareText({ mode: 'daily', dailyNumber: 26, date: '2026-11-26', records: recs, score: 270 });
  assert.equal(daily, 'DEEPCUT Daily #26 · 2026-11-26\nDepth: 270m / 700m\nRank: Silver Seeker\n⬛🟫🟧🟨🟩🟦⬛\nThe deeper your knowledge, the deeper you go.');
  assert.ok(!/Secret/.test(daily), 'no answers');
  const unl = shareText({ mode: 'unlimited', records: recs, score: 270 });
  assert.ok(unl.startsWith('DEEPCUT Unlimited\n'));
  for (const q of QUESTIONS) assert.ok(!daily.includes(q.text));
});
