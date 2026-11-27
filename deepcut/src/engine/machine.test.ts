import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIG, GAME, digDurationMs } from '../config/game.ts';
import { QUESTIONS } from '../data/questions.ts';
import { RARITY } from '../config/game.ts';
import { initialState, pointsFor, reduce, type GameEvent, type GameState } from './machine.ts';

const run = (s: GameState, ...es: GameEvent[]) => es.reduce(reduce, s);
const byId = (id: string) => QUESTIONS.find((q) => q.id === id)!;
// Fixed set: first is the planets question; every one has a mythic answer.
const Q = ['sci-planets-dwarf-planets', 'geo-largest-countries', 'sci-one-letter-elements', 'spo-world-cup-winners', 'car-japanese-makers', 'vg-gen1-pokemon', 'his-ancient-wonders'].map(byId);
const QMS = DIG.revealMs + GAME.secondsPerQuestion * 1000;

/** Start a game at t=0 and pass the countdown; first question starts at t=countdownMs. */
function started(): { s: GameState; t: number } {
  const t = GAME.countdownMs;
  const s = run(initialState, { type: 'START', questions: Q, now: 0 }, { type: 'TICK', now: t });
  assert.equal(s.phase, 'QUESTION');
  return { s, t };
}
/** From ROUND_RESULT at time t, advance to the next phase. */
const advance = (s: GameState, _t?: number) => reduce(s, { type: 'TICK', now: s.phaseEndsAt! });



test('full seven-round loop: mythic every round scores exactly 700', () => {
  let { s, t } = started();
  for (let i = 0; i < GAME.roundsPerGame; i++) {
    const mythic = s.questions[i].answers.find((a) => a.rarity === 'mythic')!;
    t += 1000;
    s = reduce(s, { type: 'SUBMIT', text: mythic.name, now: t });
    assert.equal(s.phase, 'ROUND_RESULT');
    assert.equal(s.records[i].points, 100);
    t = s.phaseEndsAt!;
    s = advance(s);
  }
  assert.equal(s.phase, 'FINAL_RESULTS');
  assert.equal(s.score, GAME.maxScore);
  assert.equal(s.records.length, 7);
});

test('wrong answers can be retried; first correct answer locks the round', () => {
  let { s, t } = started();
  s = reduce(s, { type: 'SUBMIT', text: 'Moon', now: t + 100 });
  assert.equal(s.phase, 'QUESTION');
  assert.deepEqual(s.wrong, ['Moon']);
  s = reduce(s, { type: 'SUBMIT', text: 'earth', now: t + 200 });
  assert.equal(s.phase, 'ROUND_RESULT');
  assert.equal(s.score, 10);
  // rapid duplicate / second submission is ignored
  const after = reduce(s, { type: 'SUBMIT', text: 'Neptune', now: t + 210 });
  assert.equal(after, s);
  assert.equal(after.score, 10);
});

test('timeout and skip award zero points', () => {
  let { s, t } = started();
  s = reduce(s, { type: 'TICK', now: t + QMS - 1 });
  assert.equal(s.phase, 'QUESTION');
  s = reduce(s, { type: 'TICK', now: t + QMS });
  assert.equal(s.phase, 'ROUND_RESULT');
  assert.equal(s.records[0].outcome, 'timeout');
  t = s.phaseEndsAt!;
  s = advance(s);
  s = reduce(s, { type: 'SKIP', now: t + 500 });
  assert.equal(s.records[1].outcome, 'skipped');
  assert.equal(s.score, 0);
});

test('a correct answer submitted after the deadline counts as a timeout', () => {
  let { s, t } = started();
  s = reduce(s, { type: 'SUBMIT', text: 'Neptune', now: t + QMS + 5 });
  assert.equal(s.records[0].outcome, 'timeout');
  assert.equal(s.score, 0);
});

test('invalid transitions return the same state', () => {
  assert.equal(reduce(initialState, { type: 'SUBMIT', text: 'Earth', now: 1 }), initialState);
  assert.equal(reduce(initialState, { type: 'SKIP', now: 1 }), initialState);
  assert.equal(reduce(initialState, { type: 'TICK', now: 1 }), initialState);
  const { s, t } = started();
  assert.equal(reduce(s, { type: 'START', questions: Q, now: t }), s); // no restart mid-game
  const res = reduce(s, { type: 'SKIP', now: t + 1 });
  assert.equal(reduce(res, { type: 'SKIP', now: t + 2 }), res); // no double skip
  assert.equal(reduce(res, { type: 'TICK', now: t + 2 }), res); // result screen holds for its duration
  assert.equal(reduce(s, { type: 'QUIT' }).phase, 'HOME');
});

test('one late tick cannot skip more than one phase', () => {
  const { s, t } = started();
  const late = reduce(s, { type: 'TICK', now: t + QMS * 10 });
  assert.equal(late.phase, 'ROUND_RESULT');
  assert.equal(late.records.length, 1);
});

test('rarity scoring: each tier awards its configured points, 1 point = 1 meter', () => {
  assert.deepEqual(RARITY.map((t) => pointsFor(t.id)), [10, 15, 30, 60, 85, 100]);
  let { s, t } = started();
  const coal = s.questions[0].answers.find((a) => a.rarity === 'common')!;
  s = reduce(s, { type: 'SUBMIT', text: coal.name, now: t + 100 });
  assert.equal(s.score, 10);
  assert.equal(s.records[0].rarity, 'common');
});

test('a find holds the result for its whole dig animation; the next clock starts after the reveal', () => {
  let { s, t } = started();
  const mythic = s.questions[0].answers.find((a) => a.rarity === 'mythic')!;
  s = reduce(s, { type: 'SUBMIT', text: mythic.name, now: t + 1000 });
  assert.equal(s.phaseEndsAt, t + 1000 + digDurationMs(5));
  assert.ok(digDurationMs(5) > digDurationMs(0), 'rarer finds descend longer');
  const end = s.phaseEndsAt!;
  assert.equal(reduce(s, { type: 'TICK', now: end - 1 }).phase, 'ROUND_RESULT', 'no early next question');
  s = reduce(s, { type: 'TICK', now: end });
  assert.equal(s.phase, 'QUESTION');
  assert.equal(s.phaseEndsAt, end + DIG.revealMs + GAME.secondsPerQuestion * 1000);
  assert.equal(s.score, 100, 'points come from the engine once, not from the animation');
});
