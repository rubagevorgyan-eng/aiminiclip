import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupHistory } from '../client/game/history.ts';
import { canRead, writeBlock } from '../engine/chatRules.ts';
import { projectView } from '../engine/projection.ts';
import { parseClientMessage } from '../net/validate.ts';
import type { ClientMessage } from '../net/protocol.ts';
import { seededRng } from '../shared/random.ts';
import type { ChatChannel, CompetitiveIdentity, DuetSide, PlayerId, ServerRoom, TeamId } from '../shared/types.ts';
import { defaultBank } from '../vocab/index.ts';
import { handle, hello } from './live.ts';
import { createRoom } from './room.ts';

const deps = (now: number) => ({ bank: defaultBank(), rng: () => seededRng(`c${now}`), now });

function classicRoom() {
  const r = createRoom('COMMS', 'classic', 0);
  const id = (n: string) => {
    const h = hello(r, { t: 'hello', v: 1, room: 'COMMS', name: n }, 0);
    assert.ok(h.ok);
    return h.playerId;
  };
  const [ch, co, bh, bo, spec] = ['CrimsonH', 'CrimsonO', 'CobaltH', 'CobaltO', 'Spec'].map(id);
  handle(r, ch, { t: 'seat', role: 'handler', team: 'crimson' }, deps(1));
  handle(r, co, { t: 'seat', role: 'operative', team: 'crimson' }, deps(1));
  handle(r, bh, { t: 'seat', role: 'handler', team: 'cobalt' }, deps(1));
  handle(r, bo, { t: 'seat', role: 'operative', team: 'cobalt' }, deps(1));
  r.settings.startingTeam = 'crimson';
  return { r, ch, co, bh, bo, spec };
}
const say = (r: ServerRoom, by: PlayerId, channel: ChatChannel, text = 'hello', now = 10) => handle(r, by, { t: 'chat', text, channel }, deps(now));
const texts = (r: ServerRoom, viewer: PlayerId) => projectView(r, viewer).room.chat.filter((c) => c.kind === 'player').map((c) => `${c.channel}:${c.text}`);

test('lobby: everyone may chat in channels they can read; nobody writes to others’ channels', () => {
  const { r, ch, co, bo, spec } = classicRoom();
  assert.ok(say(r, ch, 'team:crimson').ok);
  assert.ok(say(r, spec, 'spectators').ok);
  assert.ok(say(r, spec, 'global').ok);
  assert.equal(say(r, bo, 'team:crimson').ok, false);
  assert.equal(say(r, co, 'spectators').ok, false);
  assert.equal(say(r, co, 'system').ok, false);
});

test('live competitive: handlers silent; operatives team + global; observers only observers', () => {
  const { r, ch, co, bh, bo, spec } = classicRoom();
  assert.ok(handle(r, ch, { t: 'start' }, deps(2)).ok);
  for (const c of ['team:crimson', 'global'] as const) {
    const res = say(r, ch, c);
    assert.ok(!res.ok && /Handlers cannot chat/.test(res.message), 'handler blocked on the server');
  }
  assert.equal(say(r, bh, 'team:cobalt').ok, false);
  assert.ok(say(r, co, 'team:crimson', 'maybe TIDE').ok);
  assert.ok(say(r, bo, 'global', 'gl hf').ok);
  assert.ok(say(r, spec, 'spectators', 'nice').ok);
  assert.equal(say(r, spec, 'global').ok, false, 'observers cannot reach players during a match');
  assert.equal(say(r, spec, 'team:crimson').ok, false);
});

test('visibility: team chat only to that team (handler can read), observer chat only to observers', () => {
  const { r, ch, co, bh, bo, spec } = classicRoom();
  handle(r, ch, { t: 'start' }, deps(2));
  say(r, co, 'team:crimson', 'crimson secret');
  say(r, bo, 'team:cobalt', 'cobalt secret');
  say(r, spec, 'spectators', 'observer note');
  say(r, co, 'global', 'public');
  assert.deepEqual(texts(r, ch).sort(), ['global:public', 'team:crimson:crimson secret'], 'crimson handler reads crimson team chat');
  assert.deepEqual(texts(r, bh).sort(), ['global:public', 'team:cobalt:cobalt secret']);
  assert.deepEqual(texts(r, spec).sort(), ['global:public', 'spectators:observer note'], 'observers never see team chat');
  assert.ok(!JSON.stringify(projectView(r, bo)).includes('crimson secret'));
  assert.ok(!JSON.stringify(projectView(r, co)).includes('observer note'));
});

test('Duet: only the guessing partner talks in global; side channels stay private; no global in sudden death', () => {
  const r = createRoom('DCHAT', 'duet', 0);
  const id = (n: string) => (hello(r, { t: 'hello', v: 1, room: 'DCHAT', name: n }, 0) as { playerId: string }).playerId;
  const [a, a2, b, spec] = ['A', 'A2', 'B', 'S'].map(id);
  handle(r, a, { t: 'seat', role: 'operative', side: 'north' }, deps(1));
  handle(r, a2, { t: 'seat', role: 'operative', side: 'north' }, deps(1));
  handle(r, b, { t: 'seat', role: 'operative', side: 'south' }, deps(1));
  assert.ok(handle(r, a, { t: 'start' }, deps(2)).ok);
  const giver = (r.match!.turn!.owner as { side: DuetSide }).side;
  const [g, q] = giver === 'north' ? [a, b] : [b, a];
  assert.match(say(r, q, 'global').ok ? '' : 'blocked', /blocked/, 'no global before the clue');
  assert.ok(handle(r, g, { t: 'clue', word: 'ORBIT', count: 2, match: r.match!.id, rev: r.match!.revision }, deps(3)).ok);
  assert.ok(say(r, q, 'global', 'thinking ANCHOR').ok, 'guessing partner may discuss');
  const blocked = say(r, g, 'global', 'not that one!');
  assert.ok(!blocked.ok && /let your partner guess/.test(blocked.message));
  assert.ok(say(r, a, 'side:north', 'same key, private').ok);
  assert.equal(say(r, b, 'side:north').ok, false);
  assert.ok(!texts(r, b).some((t) => t.startsWith('side:north')), 'the other side never reads it');
  assert.ok(!texts(r, spec).some((t) => t.startsWith('side:')));
  r.match!.phase = 'sudden_death';
  assert.equal(say(r, q, 'global').ok, false);
});

test('moderation: host mutes and deletes; others cannot', () => {
  const { r, ch, co, bo } = classicRoom();
  assert.ok(say(r, co, 'global', 'spam').ok);
  const msg = r.chat.find((c) => c.text === 'spam')!;
  assert.equal(handle(r, bo, { t: 'delete_message', id: msg.id }, deps(5)).ok, false);
  assert.equal(handle(r, bo, { t: 'mute', player: co, on: true }, deps(5)).ok, false);
  assert.ok(handle(r, ch, { t: 'mute', player: co, on: true }, deps(5)).ok); // ch is host (first to join)
  const muted = say(r, co, 'global');
  assert.ok(!muted.ok && /muted/.test(muted.message));
  assert.ok(handle(r, ch, { t: 'delete_message', id: msg.id }, deps(6)).ok);
  assert.ok(!r.chat.some((c) => c.id === msg.id));
  assert.ok(handle(r, ch, { t: 'mute', player: co, on: false }, deps(7)).ok);
  assert.ok(say(r, co, 'global').ok);
});

test('sanitizing: markup is stored as plain text, control and bidi characters removed, length capped', () => {
  const { r, co } = classicRoom();
  assert.ok(say(r, co, 'global', '<img src=x onerror=alert(1)>‮evil\u0000' + 'x'.repeat(400)).ok);
  const t = r.chat.at(-1)!.text;
  assert.ok(t.startsWith('<img src=x onerror=alert(1)>'), 'kept as text: the UI renders it escaped, never as HTML');
  assert.ok(!/[\u0000‮]/.test(t));
  assert.ok(t.length <= 280);
  assert.equal(say(r, co, 'global', '   ').ok, false);
  assert.equal(parseClientMessage(JSON.stringify({ t: 'chat', text: 'x', channel: 'admin' })), null);
});

test('suggestions: concurrent teammates both land; stale ones from a previous turn are rejected', () => {
  const { r, ch, co, bo } = classicRoom();
  const co2 = (hello(r, { t: 'hello', v: 1, room: 'COMMS', name: 'CrimsonO2' }, 0) as { playerId: string }).playerId;
  handle(r, co2, { t: 'seat', role: 'operative', team: 'crimson' }, deps(1));
  handle(r, ch, { t: 'start' }, deps(2));
  const m0 = r.match!;
  assert.ok(handle(r, ch, { t: 'clue', word: 'ORBIT', count: 2, match: m0.id, rev: m0.revision }, deps(3)).ok);
  const rev = r.match!.revision;
  // Both operatives suggest from the same revision: both are accepted.
  assert.ok(handle(r, co, { t: 'suggest', card: 0, on: true, match: m0.id, rev }, deps(4)).ok);
  assert.ok(handle(r, co2, { t: 'suggest', card: 0, on: true, match: m0.id, rev }, deps(4)).ok);
  assert.ok(handle(r, co2, { t: 'suggest', card: 1, on: true, match: m0.id, rev }, deps(4)).ok);
  assert.equal(r.match!.suggestions.filter((s) => s.card === 0).length, 2, 'several teammates on one card');
  // Handlers and rivals cannot suggest; a confirm still needs the exact revision.
  assert.equal(handle(r, ch, { t: 'suggest', card: 2, on: true, match: m0.id, rev: r.match!.revision }, deps(5)).ok, false);
  assert.equal(handle(r, bo, { t: 'suggest', card: 2, on: true, match: m0.id, rev: r.match!.revision }, deps(5)).ok, false);
  assert.equal(handle(r, co, { t: 'confirm', card: 3, match: m0.id, rev }, deps(5)).ok, false, 'confirm with an old revision is stale');
  assert.equal(r.match!.reveals.filter(Boolean).length, 0, 'suggestions never reveal');
  // End the turn; the old revision can no longer suggest.
  const key = (r.match!.key as { identities: CompetitiveIdentity[] }).identities;
  const civ = key.findIndex((x) => x === 'civilian');
  assert.ok(handle(r, co, { t: 'confirm', card: civ, match: m0.id, rev: r.match!.revision }, deps(6)).ok);
  assert.equal(r.match!.suggestions.length, 0, 'cleared at the turn change');
  assert.equal(handle(r, co, { t: 'suggest', card: 5, on: true, match: m0.id, rev }, deps(7)).ok, false, 'stale suggestion rejected');
  const vRival = projectView(r, bo);
  assert.ok(vRival.match!.suggestions.every((s) => (s.owner as { team: TeamId }).team === 'cobalt'));
});

test('history: grouped per turn with guesses and outcomes, public data only', () => {
  const { r, ch, co } = classicRoom();
  handle(r, ch, { t: 'start' }, deps(2));
  const m = r.match!;
  const key = (m.key as { identities: CompetitiveIdentity[] }).identities;
  handle(r, ch, { t: 'clue', word: 'ORBIT', count: 2, match: m.id, rev: m.revision }, deps(3));
  const own = key.findIndex((x) => x === 'crimson');
  const civ = key.findIndex((x) => x === 'civilian');
  handle(r, co, { t: 'confirm', card: own, match: m.id, rev: r.match!.revision }, deps(4));
  handle(r, co, { t: 'confirm', card: civ, match: m.id, rev: r.match!.revision }, deps(5));
  const turns = groupHistory(projectView(r, co).match!.history);
  assert.equal(turns.length, 1);
  assert.equal(turns[0].clue?.word, 'ORBIT');
  assert.deepEqual(turns[0].guesses.map((g) => [g.card, g.result.identity]), [[own, 'crimson'], [civ, 'civilian']]);
  assert.equal(turns[0].ended?.reason, 'wrong_guess');
  const v = JSON.stringify(projectView(r, co));
  assert.ok(!v.includes('"identities"'), 'history view carries no key');
});

test('protocol: chat channels and moderation messages validate', () => {
  const ok: ClientMessage[] = [{ t: 'chat', text: 'hi', channel: 'team:crimson' }, { t: 'mute', player: 'p_abcdefgh', on: true }, { t: 'delete_message', id: 'c_abcdefgh' }];
  for (const m of ok) assert.ok(parseClientMessage(JSON.stringify(m)), m.t);
  assert.equal(parseClientMessage(JSON.stringify({ t: 'mute', player: 'p_abcdefgh' })), null);
  assert.ok(canRead('global', null) && !canRead('team:crimson', null));
  assert.equal(writeBlock({ settings: createRoom('X', 'classic', 0).settings, match: null }, null, 'global'), 'You are not in this room.');
});
