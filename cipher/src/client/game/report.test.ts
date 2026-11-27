import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectView } from '../../engine/projection.ts';
import { handle, hello } from '../../server/live.ts';
import { createRoom } from '../../server/room.ts';
import { seededRng } from '../../shared/random.ts';
import type { CompetitiveIdentity, PlayerId, ServerRoom, TeamId } from '../../shared/types.ts';
import { defaultBank } from '../../vocab/index.ts';
import { declassifiedBoard, reportData } from './report.ts';

const deps = (now: number) => ({ bank: defaultBank(), rng: () => seededRng(`r${now}`), now });
function classic() {
  const r = createRoom('RPRTX', 'classic', 0);
  const id = (n: string) => (hello(r, { t: 'hello', v: 1, room: 'RPRTX', name: n }, 0) as { playerId: PlayerId }).playerId;
  const [ch, co, co2, bh, bo] = ['CH', 'CO', 'CO2', 'BH', 'BO'].map(id);
  handle(r, ch, { t: 'seat', role: 'handler', team: 'crimson' }, deps(1));
  handle(r, co, { t: 'seat', role: 'operative', team: 'crimson' }, deps(1));
  handle(r, co2, { t: 'seat', role: 'operative', team: 'crimson' }, deps(1));
  handle(r, bh, { t: 'seat', role: 'handler', team: 'cobalt' }, deps(1));
  handle(r, bo, { t: 'seat', role: 'operative', team: 'cobalt' }, deps(1));
  r.settings.startingTeam = 'crimson';
  assert.ok(handle(r, ch, { t: 'start' }, deps(1000)).ok);
  return { r, ch, co, co2, bh, bo };
}
const key = (r: ServerRoom) => (r.match!.key as { identities: CompetitiveIdentity[] }).identities;
const hidden = (r: ServerRoom, id: CompetitiveIdentity) => key(r).map((x, i) => (x === id && !r.match!.reveals[i] ? i : -1)).filter((i) => i >= 0);
const act = (r: ServerRoom, by: PlayerId, m: Record<string, unknown>, now: number) => handle(r, by, { ...m, match: r.match!.id, rev: r.match!.revision } as never, deps(now));

test('report figures come from the recorded match: duration, clues, accuracy, best clue, assassin', () => {
  const { r, ch, co, bh, bo } = classic();
  act(r, ch, { t: 'clue', word: 'ORBIT', count: 2 }, 2000);
  act(r, co, { t: 'confirm', card: hidden(r, 'crimson')[0] }, 3000);
  act(r, co, { t: 'confirm', card: hidden(r, 'crimson')[0] }, 4000);
  act(r, co, { t: 'confirm', card: hidden(r, 'civilian')[0] }, 5000); // limit 3 → this is the third guess, ends turn
  act(r, bh, { t: 'clue', word: 'TIDE', count: 1 }, 6000);
  act(r, bo, { t: 'confirm', card: hidden(r, 'cobalt')[0] }, 7000);
  const moleCard = hidden(r, 'mole')[0];
  act(r, bo, { t: 'confirm', card: moleCard }, 61_000);
  assert.equal(r.match!.phase, 'completed');
  const v = projectView(r, co).match!;
  const d = reportData(v)!;
  assert.equal(d.durationMs, 60_000);
  assert.equal(d.clues, 2);
  assert.equal(d.guesses, 5);
  assert.equal(d.correctGuesses, 3);
  assert.equal(d.accuracy, 3 / 5);
  assert.deepEqual(d.best && { word: d.best.word, correct: d.best.correct, turn: d.best.turn }, { word: 'ORBIT', correct: 2, turn: 1 });
  assert.deepEqual(d.assassin, { word: v.cards[moleCard].word, loser: 'cobalt', by: bo });
  assert.deepEqual(d.agents.map((a) => [a.label, a.found, a.total]), [['crimson', 2, 9], ['cobalt', 1, 8]]);
  const board = declassifiedBoard(v)!;
  assert.equal(board.length, 25);
  assert.equal(board.filter((c) => c.identity === 'crimson').length, 9);
  assert.equal(board.filter((c) => c.revealed).length, 5);
});

test('reports never exist before the end; the board is not declassified mid-match', () => {
  const { r, co } = classic();
  const v = projectView(r, co).match!;
  assert.equal(reportData(v), null);
  assert.equal(declassifiedBoard(v), null);
});

test('new operation: same room code, fresh match, keys, suggestions, timers and history; optional rotation', () => {
  const { r, ch, co, co2, bh, bo } = classic();
  const first = r.match!;
  act(r, ch, { t: 'clue', word: 'ORBIT', count: 1 }, 2000);
  act(r, co, { t: 'suggest', card: 0, on: true }, 2500);
  act(r, co, { t: 'confirm', card: hidden(r, 'mole')[0] }, 3000);
  assert.equal(handle(r, co, { t: 'rematch', rotate: true }, deps(4000)).ok, false, 'host only');
  assert.ok(handle(r, ch, { t: 'rematch', rotate: true }, deps(4000)).ok);
  const m = r.match!;
  assert.equal(r.code, 'RPRTX');
  assert.notEqual(m.id, first.id);
  assert.deepEqual([m.revision, m.history.length, m.suggestions.length, m.reveals.filter(Boolean).length, m.result], [0, 0, 0, 0, null]);
  assert.notDeepEqual((m.key as { identities: string[] }).identities, (first.key as { identities: string[] }).identities);
  const role = (id: PlayerId) => r.players.find((p) => p.id === id)!.role;
  assert.deepEqual([role(ch), role(co), role(co2)], ['operative', 'handler', 'operative'], 'crimson handler passed to the next seat');
  assert.deepEqual([role(bh), role(bo)], ['operative', 'handler']);
  assert.deepEqual([...r.keyHolders].sort(), [co, bo].sort(), 'new handlers hold the new key; old ones do not');
  assert.equal(projectView(r, ch).key, null, 'the previous handler now sees no key');
  const team = (id: PlayerId) => r.players.find((p) => p.id === id)!.team as TeamId;
  assert.deepEqual([team(ch), team(co)], ['crimson', 'crimson'], 'teams unchanged');
});

test('Duet rotation swaps partners; report shows shared agents', () => {
  const r = createRoom('DRPRT', 'duet', 0);
  const id = (n: string) => (hello(r, { t: 'hello', v: 1, room: 'DRPRT', name: n }, 0) as { playerId: PlayerId }).playerId;
  const [a, b] = ['A', 'B'].map(id);
  handle(r, a, { t: 'seat', role: 'operative', side: 'north' }, deps(1));
  handle(r, b, { t: 'seat', role: 'operative', side: 'south' }, deps(1));
  handle(r, a, { t: 'start' }, deps(2));
  const giver = (r.match!.turn!.owner as { side: string }).side === 'north' ? a : b;
  const guesser = giver === a ? b : a;
  act(r, giver, { t: 'clue', word: 'ORBIT', count: 1 }, 3);
  const gSide = (r.match!.turn!.owner as { side: 'north' | 'south' }).side;
  const mole = (r.match!.key as { sides: Record<string, string[]> }).sides[gSide].indexOf('mole');
  act(r, guesser, { t: 'confirm', card: mole }, 4);
  const d = reportData(projectView(r, a).match!)!;
  assert.deepEqual(d.agents, [{ label: 'shared', found: 0, total: 15 }]);
  assert.equal(d.assassin?.loser, 'cooperative');
  handle(r, a, { t: 'rematch', rotate: true }, deps(5));
  assert.deepEqual([r.players.find((p) => p.id === a)!.side, r.players.find((p) => p.id === b)!.side], ['south', 'north']);
});
