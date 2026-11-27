import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseClientMessage } from '../net/validate.ts';
import { RECONNECT_GRACE_MS, ROOM_IDLE_MS } from '../shared/config.ts';
import { seededRng } from '../shared/random.ts';
import { defaultBank } from '../vocab/index.ts';
import { AUTO_PAUSE_GRACE_MS, disconnected, handle, hello, housekeeping, sameToken } from './live.ts';
import { createRoom } from './room.ts';

const deps = (now: number) => ({ bank: defaultBank(), rng: () => seededRng(`t${now}`), now });
function room() {
  const r = createRoom('ABCDE', 'classic', 0);
  const join = (name: string) => hello(r, { t: 'hello', v: 1, room: 'ABCDE', name }, 0);
  const ids = ['Ada', 'Ben', 'Dmitri', 'Esme', 'Gus'].map((n) => {
    const h = join(n);
    assert.ok(h.ok);
    return h.playerId;
  });
  const [ada, ben, dmitri, esme] = ids;
  handle(r, ada, { t: 'seat', role: 'handler', team: 'crimson' }, deps(1));
  handle(r, ben, { t: 'seat', role: 'operative', team: 'crimson' }, deps(1));
  handle(r, dmitri, { t: 'seat', role: 'handler', team: 'cobalt' }, deps(1));
  handle(r, esme, { t: 'seat', role: 'operative', team: 'cobalt' }, deps(1));
  return { r, ids };
}

test('hello: wrong token never resumes a seat; right token does', () => {
  const { r, ids } = room();
  const s = r.sessions.find((x) => x.playerId === ids[0])!;
  const bad = hello(r, { t: 'hello', v: 1, room: 'ABCDE', name: 'Ada', session: { playerId: ids[0], token: 'nope' } }, 5);
  assert.ok(bad.ok && bad.playerId !== ids[0] && !bad.resumed);
  const good = hello(r, { t: 'hello', v: 1, room: 'ABCDE', name: 'whatever', session: { playerId: ids[0], token: s.token } }, 5);
  assert.ok(good.ok && good.playerId === ids[0] && good.resumed);
  assert.equal(hello(r, { t: 'hello', v: 99, room: 'ABCDE', name: 'x' }, 5).ok, false);
  assert.ok(sameToken('abc', 'abc') && !sameToken('abc', 'abd') && !sameToken('abc', 'ab'));
});

test('start draws a secure board; handlers become key holders', () => {
  const { r, ids } = room();
  assert.ok(handle(r, ids[0], { t: 'start' }, deps(2)).ok);
  assert.equal(r.match?.words.length, 25);
  assert.deepEqual([...r.keyHolders].sort(), [ids[0], ids[2]].sort());
  assert.equal(handle(r, ids[1], { t: 'rematch' }, deps(3)).ok, false);
});

test('auto-pause after the grace when a required role drops, resume when filled', () => {
  const { r, ids } = room();
  handle(r, ids[4], { t: 'seat', role: 'operative', team: 'crimson' }, deps(1)); // a second crimson operative
  handle(r, ids[0], { t: 'start' }, deps(2));
  disconnected(r, ids[0], 1000);
  assert.equal(housekeeping(r, 1000 + AUTO_PAUSE_GRACE_MS - 1).changed, false, 'refresh-length gaps do not pause');
  housekeeping(r, 1000 + AUTO_PAUSE_GRACE_MS);
  assert.equal(r.match?.phase, 'paused');
  assert.match(r.pauseReason!, /Crimson Bureau needs a handler/);
  assert.equal(handle(r, ids[1], { t: 'resume', match: r.match!.id, rev: r.match!.revision }, deps(30_000)).ok, false, 'nobody resumes a held pause');
  assert.ok(handle(r, ids[1], { t: 'seat', role: 'handler', team: 'crimson' }, deps(30_000)).ok);
  housekeeping(r, 30_001);
  assert.notEqual(r.match?.phase, 'paused');
  assert.equal(r.pauseReason, null);
  // The replaced handler cannot come back as an operative.
  hello(r, { t: 'hello', v: 1, room: 'ABCDE', name: 'Ada', session: { playerId: ids[0], token: r.sessions.find((s) => s.playerId === ids[0])!.token } }, 31_000);
  assert.equal(r.players.find((p) => p.id === ids[0])!.role, 'spectator');
  assert.equal(handle(r, ids[0], { t: 'seat', role: 'operative', team: 'crimson' }, deps(31_001)).ok, false);
});

test('lobby: a seat is released and the host role moves after the disconnect grace', () => {
  const { r, ids } = room();
  disconnected(r, ids[0], 1000);
  housekeeping(r, 1000 + RECONNECT_GRACE_MS);
  assert.notEqual(r.host.hostId, ids[0]);
  assert.equal(r.players.find((p) => p.id === ids[0])!.role, 'spectator');
});

test('expiry: an empty room expires after the idle period', () => {
  const { r, ids } = room();
  ids.forEach((id) => disconnected(r, id, 1000));
  r.lastActiveAt = 1000;
  assert.equal(housekeeping(r, 1000 + ROOM_IDLE_MS - 1).expired, false);
  assert.equal(housekeeping(r, 1000 + ROOM_IDLE_MS).expired, true);
});

test('message validator rejects malformed input', () => {
  assert.equal(parseClientMessage('{bad'), null);
  assert.equal(parseClientMessage(JSON.stringify({ t: 'nope' })), null);
  assert.equal(parseClientMessage(JSON.stringify({ t: 'confirm', card: 1.5, match: 'm_abcdefgh', rev: 0 })), null);
  assert.equal(parseClientMessage(JSON.stringify({ t: 'seat', role: 'god' })), null);
  assert.equal(parseClientMessage('x'.repeat(5000)), null);
  assert.ok(parseClientMessage(JSON.stringify({ t: 'confirm', card: 3, match: 'm_abcdefgh', rev: 2, aid: 'a1' })));
});

test('Duet room: start, key holders, seat locks, auto-pause and observer takeover', () => {
  const r = createRoom('DUETS', 'duet', 0);
  const join = (n: string) => {
    const h = hello(r, { t: 'hello', v: 1, room: 'DUETS', name: n }, 0);
    assert.ok(h.ok);
    return h.playerId;
  };
  const [a, b, obs] = [join('A'), join('B'), join('Obs')];
  handle(r, a, { t: 'seat', role: 'operative', side: 'north' }, deps(1));
  handle(r, b, { t: 'seat', role: 'operative', side: 'south' }, deps(1));
  assert.ok(handle(r, a, { t: 'start' }, deps(2)).ok);
  assert.equal(r.match?.key.kind, 'cooperative');
  assert.deepEqual([...r.keyHolders].sort(), [a, b].sort());
  assert.equal(handle(r, a, { t: 'seat', role: 'operative', side: 'south' }, deps(3)).ok, false, 'no switching sides');
  assert.equal(handle(r, obs, { t: 'seat', role: 'operative', side: 'north' }, deps(3)).ok, false, 'side still has its partner');
  disconnected(r, a, 1000);
  housekeeping(r, 1000 + AUTO_PAUSE_GRACE_MS);
  assert.equal(r.match?.phase, 'paused');
  assert.match(r.pauseReason!, /Partner A needs a player/);
  assert.ok(handle(r, obs, { t: 'seat', role: 'operative', side: 'north' }, deps(30_000)).ok);
  housekeeping(r, 30_001);
  assert.notEqual(r.match?.phase, 'paused');
  assert.ok(r.keyHolders.includes(obs));
});
