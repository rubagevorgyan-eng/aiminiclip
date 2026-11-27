// Auction rule tests (normal flow + edge cases). Exit code 1 on failure.   node tools/test-auction.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { loadABC } from './load.mjs';

const ABC = loadABC({ withCharacters: true });
vm.runInThisContext(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'auction.js'), 'utf8'));
const A = ABC.auction;
let pass = 0, fail = 0;
const test = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '\n  ', e.stack.split('\n').slice(0, 3).join('\n   ')); } };

/* fake pool: c0..c29, power = 10 + i; c90/c91 are two versions of one character */
const POW = {}; const CID = {};
for (let i = 0; i < 30; i++) { POW['c' + i] = 10 + i; CID['c' + i] = 'char' + i; }
POW.c90 = 50; CID.c90 = 'same'; POW.c91 = 60; CID.c91 = 'same';
const ctx = { charOf: id => ({ charId: CID[id], power: POW[id] }) };
const order = n => Array.from({ length: n }, (_, i) => 'c' + i);
const go = (s, a) => { const r = A.apply(s, a, ctx); assert.ok(r.ok, a.type + ' failed: ' + r.reason); return r.state; };
const no = (s, a, reason) => { const r = A.apply(s, a, ctx); assert.equal(r.ok, false); assert.equal(r.reason, reason); assert.equal(r.state, s); return s; };
const fresh = (n = 30, rules) => A.create({ names: ['A', 'B'], order: order(n), rules });

test('normal auction: bids move no money, sale deducts once', () => {
  let s = fresh();
  s = go(s, { type: 'bid', p: 0, amt: 1 }); s = go(s, { type: 'bid', p: 1, amt: 3 }); s = go(s, { type: 'bid', p: 0, amt: 8 });
  assert.equal(s.players[0].money, 20); assert.equal(s.players[1].money, 20);
  s = go(s, { type: 'sell' });
  assert.equal(s.players[0].money, 12); assert.deepEqual(s.players[0].roster, ['c0']); assert.deepEqual(s.fate.c0, { p: 0, price: 8 });
  assert.equal(A.spent(s, 0), 8); assert.equal(A.power(s, 0, ctx), 10);
  assert.deepEqual(s.bid, { amt: 0, by: -1, seq: s.bid.seq });           // nothing carries into round 2
  no(s, { type: 'sell' }, 'no-bid');                                      // second Sold can't re-buy or re-deduct
});
test('invalid bids are rejected', () => {
  let s = fresh();
  no(s, { type: 'bid', p: 0, amt: 21 }, 'funds');
  no(s, { type: 'bid', p: 0, amt: 0 }, 'amount');
  no(s, { type: 'bid', p: 0, amt: 1.5 }, 'amount');
  s = go(s, { type: 'bid', p: 0, amt: 5 });
  no(s, { type: 'bid', p: 0, amt: 6 }, 'leader');                       // can't raise your own bid
  no(s, { type: 'bid', p: 1, amt: 5 }, 'low');
  assert.equal(A.nextBid(s), 6);
  assert.deepEqual(A.bidOptions(s, 1).map(o => [o.amt, o.why]), [[6, null], [7, null], [10, null], [20, null]]);
});
test('stale clicks are rejected (round and bid sequence)', () => {
  let s = fresh();
  s = go(s, { type: 'bid', p: 0, amt: 2 });
  const seq = s.bid.seq;
  s = go(s, { type: 'bid', p: 1, amt: 3 });
  no(s, { type: 'sell', seq }, 'stale');                                  // Sold rendered for the $2 bid
  s = go(s, { type: 'sell', seq: s.bid.seq, round: 1 });
  no(s, { type: 'gift', p: 0, round: 1 }, 'stale');                       // double-click lands on round 2
});
test('gift: $0, gift record, power counted, pending bid voided', () => {
  let s = fresh();
  s = go(s, { type: 'bid', p: 1, amt: 4 });
  s = go(s, { type: 'gift', p: 0 });
  assert.equal(s.players[0].money, 20); assert.equal(s.players[1].money, 20);
  assert.deepEqual(s.fate.c0, { p: 0, price: 0, gift: true });
  assert.equal(A.power(s, 0, ctx), 10); assert.equal(A.spent(s, 0), 0);
  const ev = s.events.find(e => e.t === 'gift'); assert.deepEqual(ev.voided, { p: 1, amt: 4 });
});
test('player skip uses only that player\'s skip; master skip only the master pool', () => {
  let s = fresh();
  s = go(s, { type: 'pskip', p: 0 });
  assert.equal(s.players[0].skips, 2); assert.equal(s.players[1].skips, 3); assert.equal(s.master, 5);
  s = go(s, { type: 'bid', p: 0, amt: 1 });
  no(s, { type: 'pskip', p: 1 }, 'bidding-started');
  s = go(s, { type: 'mskip' });
  assert.equal(s.master, 4); assert.equal(s.players[0].skips, 2); assert.equal(s.players[1].skips, 3);
  assert.equal(s.players[0].money, 20);                                   // voided bid costs nothing
  assert.deepEqual(s.events.filter(e => e.t === 'skip').map(e => e.kind), ['player', 'master']);
});
test('allowances run out cleanly', () => {
  let s = fresh();
  for (let i = 0; i < 3; i++) s = go(s, { type: 'pskip', p: 1 });
  no(s, { type: 'pskip', p: 1 }, 'no-skips');
  for (let i = 0; i < 5; i++) s = go(s, { type: 'mskip' });
  no(s, { type: 'mskip' }, 'no-master');
});
test('full team: no bids, no gifts, TEAM COMPLETE status', () => {
  let s = fresh();
  for (let i = 0; i < 5; i++) s = go(s, { type: 'gift', p: 0 });
  assert.equal(A.status(s, 0), 'complete');
  no(s, { type: 'bid', p: 0, amt: 1 }, 'full');
  no(s, { type: 'gift', p: 0 }, 'full');
  assert.equal(s.players[0].roster.length, 5);
});
test('duplicate canonical characters are refused', () => {
  let s = A.create({ names: ['A', 'B'], order: ['c90', 'c91', 'c1'] });
  s = go(s, { type: 'gift', p: 0 });
  no(s, { type: 'gift', p: 1 }, 'duplicate');
  s = go(s, { type: 'bid', p: 1, amt: 1 });
  no(s, { type: 'sell' }, 'duplicate');
});
test('match ends: teams complete', () => {
  let s = fresh();
  for (let i = 0; i < 10; i++) s = go(s, { type: 'gift', p: i % 2 });
  assert.equal(s.over, true); assert.equal(s.end, 'teams-complete');
  no(s, { type: 'bid', p: 0, amt: 1 }, 'over'); no(s, { type: 'mskip' }, 'over');
});
test('match ends: pool exhausted', () => {
  let s = fresh(3);
  s = go(s, { type: 'gift', p: 0 }); s = go(s, { type: 'mskip' }); s = go(s, { type: 'pskip', p: 1 });
  assert.equal(s.end, 'pool-exhausted'); assert.equal(s.events.at(-1).t, 'end');
});
test('match ends: nobody can afford anything (no endless match)', () => {
  let s = fresh();
  s = go(s, { type: 'bid', p: 0, amt: 20 }); s = go(s, { type: 'sell' });       // A broke, 4 slots open
  for (let i = 0; i < 4; i++) { s = go(s, { type: 'bid', p: 1, amt: 1 }); s = go(s, { type: 'sell' }); }
  assert.equal(s.over, false);
  s = go(s, { type: 'bid', p: 1, amt: 16 }); s = go(s, { type: 'sell' });     // B full, A has $0
  assert.equal(s.over, true); assert.equal(s.end, 'no-buyers');
  assert.ok(s.players.every(P => P.money >= 0));
  assert.ok(!s.events.some(e => e.t === 'unsold'));                 // the next card is never exposed
  assert.ok(!s.events.some(e => e.id === s.order[s.pos] && e.t === 'reveal'));
});
test('balances never go negative and power totals match rosters (random play)', () => {
  for (let g = 0; g < 300; g++) {
    let s = fresh(30), seed = g * 7919 + 1;
    const rnd = n => (seed = (seed * 48271) % 2147483647) % n;
    for (let k = 0; k < 400 && !s.over; k++) {
      const p = rnd(2), t = rnd(10);
      const a = t < 5 ? { type: 'bid', p, amt: A.bidOptions(s, p)[rnd(4)].amt } : t < 7 ? { type: 'sell' } : t < 8 ? { type: 'gift', p } : t < 9 ? { type: 'pskip', p } : { type: 'mskip' };
      const r = A.apply(s, a, ctx); if (r.ok) s = r.state;
    }
    assert.equal(s.over, true, 'game ' + g + ' did not end');
    s.players.forEach((P, p) => {
      assert.ok(P.money >= 0 && P.money <= 20); assert.ok(P.roster.length <= 5); assert.ok(P.skips >= 0);
      assert.equal(P.money, 20 - A.spent(s, p));
      assert.equal(A.power(s, p, ctx), P.roster.reduce((t, id) => t + POW[id], 0));
    });
    const all = s.players.flatMap(P => P.roster); assert.equal(new Set(all).size, all.length);
    assert.ok(s.master >= 0 && s.master <= 5);
  }
});
test('winner rule unchanged: power, then best card, then money', () => {
  let s = A.create({ names: ['A', 'B'], order: ['c10', 'c0', 'c5', 'c5x'] });
  POW.c5x = 15; CID.c5x = 'x';
  s = go(s, { type: 'gift', p: 0 }); s = go(s, { type: 'gift', p: 1 }); s = go(s, { type: 'gift', p: 1 });   // A 20 | B 10+15=25
  assert.equal(A.rank(s, ctx), 1);
});
test('dynamic roster size (custom matches)', () => {
  let s = fresh(30, { maxRoster: 3 });
  for (let i = 0; i < 3; i++) s = go(s, { type: 'gift', p: 0 });
  assert.equal(A.status(s, 0), 'complete');
});
test('history: structured rounds, nothing upcoming', () => {
  let s = fresh();
  s = go(s, { type: 'bid', p: 0, amt: 1 }); s = go(s, { type: 'bid', p: 1, amt: 2 }); s = go(s, { type: 'sell' });
  s = go(s, { type: 'pskip', p: 0 });
  const R = A.rounds(s);
  assert.equal(R.length, 3);                                    // round 3 revealed, nothing beyond
  assert.deepEqual(R[0].bids, [{ p: 0, amt: 1 }, { p: 1, amt: 2 }]); assert.equal(R[0].result.t, 'sold');
  assert.equal(R[1].result.kind, 'player'); assert.equal(R[2].result, null);
  assert.ok(!s.events.some(e => e.id === 'c3'));
});
test('real data: every pool character resolves through ctx', () => {
  const B = ABC.engine.build(ABC.characters);
  const by = B.byId, real = { charOf: id => ({ charId: by[id].charId, power: by[id].game.power }) };
  for (const mode of ['all', 'anime']) {
    const ids = ABC.engine.pool(B.entries, mode).map(e => e.id);
    let s = A.create({ names: ['A', 'B'], order: ids, mode });
    for (let i = 0; i < 10; i++) { const r = A.apply(s, { type: 'gift', p: i % 2 }, real); assert.ok(r.ok); s = r.state; }
    assert.equal(s.end, 'teams-complete');
  }
});

console.log(`Auction tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
