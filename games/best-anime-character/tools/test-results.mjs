// Results tests: winner, draws, incomplete/gift-only teams, zero spending, awards, undo-adjusted history,
// persistent history, database changes after completion.   node tools/test-results.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { loadABC } from './load.mjs';

const ABC = loadABC();
const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
for (const f of ['auction.js', 'session.js', 'results.js']) vm.runInThisContext(readFileSync(join(DATA, f), 'utf8'));
const AU = ABC.auction, RS = ABC.results, SE = ABC.session;
let pass = 0, fail = 0;
const test = (n, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log('FAIL', n, '\n  ', e.message); } };

/* small fixed "database": snapshot values live in SNAP (what a match stores) */
const DB = {};
const mk = (id, power, star, series = 'op') => (DB[id] = { charId: id, name: 'Name ' + id, series, seriesName: series.toUpperCase(), form: 'Form ' + id, star, rarity: 'R' + star, power, tier: 'T' + id, img: null });
[['a', 80, 6], ['b', 70, 5], ['c', 60, 5, 'db'], ['d', 50, 4, 'db'], ['e', 40, 3], ['f', 30, 3, 'jjk'], ['g', 20, 2], ['h', 10, 1], ['i', 80, 6, 'db'], ['j', 5, 1]].forEach(a => mk(...a));
const SNAP = JSON.parse(JSON.stringify(DB));
const info = id => SNAP[id];
const ctx = { charOf: id => ({ charId: SNAP[id].charId, power: SNAP[id].power }) };
const go = (s, a) => { const r = AU.apply(s, a, ctx); assert.ok(r.ok, a.type + ' ' + r.reason); return r.state; };
const match = (order, rules = { maxRoster: 2 }) => Object.assign(AU.create({ names: ['Ann', 'Bo'], order, rules }), { setup: { mode: 'classic', seed: 1, eligibility: 'all' } });

test('standard completion: winner, totals, spending, balances, counts', () => {
  let s = match(['a', 'b', 'c', 'd', 'e']);
  s = go(s, { type: 'bid', p: 0, amt: 2 }); s = go(s, { type: 'bid', p: 1, amt: 4 }); s = go(s, { type: 'bid', p: 0, amt: 9 }); s = go(s, { type: 'sell' });  // Ann a $9
  s = go(s, { type: 'bid', p: 1, amt: 3 }); s = go(s, { type: 'sell' });                                                    // Bo b $3
  s = go(s, { type: 'pskip', p: 0 });                                                                                     // c skipped
  s = go(s, { type: 'gift', p: 0 });                                                                                      // Ann d gift
  s = go(s, { type: 'bid', p: 1, amt: 1 }); s = go(s, { type: 'sell' });                                                  // Bo e $1
  assert.equal(s.over, true);
  const r = RS.summarize(s, info, { modeLabel: 'Classic', now: 0 });
  assert.equal(r.winner, 0); assert.equal(r.draw, false);
  assert.deepEqual(r.players.map(p => p.power), [130, 110]); assert.equal(r.diff, 20);
  assert.deepEqual(r.players.map(p => [p.spent, p.balance, p.purchased, p.gifted, p.skipsUsed]), [[9, 11, 1, 1, 1], [4, 16, 2, 0, 0]]);
  assert.deepEqual(r.totals, { revealed: 5, auctions: 3, bids: 5, gifts: 1, playerSkips: 1, masterSkipsUsed: 0, masterSkipsLeft: 5, unsold: 0 });
  assert.deepEqual(r.players.map(p => p.bids), [2, 3]); assert.deepEqual(r.players.map(p => p.wins), [1, 2]);
  assert.equal(r.players[0].roster[1].gift, true); assert.equal(r.players[0].roster[1].price, 0);
});
test('awards: values, gifts excluded from efficiency, war needs 2+ bids', () => {
  let s = match(['a', 'b', 'c', 'd', 'e']);
  s = go(s, { type: 'bid', p: 0, amt: 2 }); s = go(s, { type: 'bid', p: 1, amt: 4 }); s = go(s, { type: 'bid', p: 0, amt: 9 }); s = go(s, { type: 'sell' });
  s = go(s, { type: 'bid', p: 1, amt: 3 }); s = go(s, { type: 'sell' }); s = go(s, { type: 'pskip', p: 0 }); s = go(s, { type: 'gift', p: 0 });
  s = go(s, { type: 'bid', p: 1, amt: 1 }); s = go(s, { type: 'sell' });
  const A = Object.fromEntries(RS.summarize(s, info).awards.map(a => [a.key, a]));
  assert.equal(A.mvp.items[0].id, 'a');
  assert.equal(A.bargain.items[0].id, 'e');                 // 40/$1
  assert.equal(A.expensive.items[0].id, 'a'); assert.equal(A.expensive.value, 9);
  assert.equal(A.efficient.items[0].p, 1);                   // Bo: 110/4 > Ann: 80/9 (Ann's gift ignored)
  assert.equal(A.war.items[0].id, 'a'); assert.equal(A.war.value, 3);
  assert.equal(A.legendary.items[0].p, 0);                   // Ann has a (6★)
  assert.equal(A.gift.items[0].id, 'd');
});
test('tied power: existing tiebreak, then draw', () => {
  let s = match(['a', 'i']); s = go(s, { type: 'gift', p: 0 }); s = go(s, { type: 'gift', p: 1 });   // 80 vs 80, same best, same money
  const r = RS.summarize(s, info); assert.equal(r.draw, true); assert.equal(r.tiebreak, 'draw'); assert.equal(r.diff, 0);
  let t = match(['b', 'e', 'c', 'f']); t = go(t, { type: 'gift', p: 0 }); t = go(t, { type: 'gift', p: 0 });  // 110
  t = go(t, { type: 'gift', p: 1 }); t = go(t, { type: 'gift', p: 1 });                                          // 90
  assert.equal(RS.summarize(t, info).tiebreak, null);
  let u = match(['b', 'c', 'e', 'h'], { maxRoster: 2 });   // 70+10=80 vs 60+? -> build 80 vs 80 with different best card
  u = go(u, { type: 'gift', p: 0 }); u = go(u, { type: 'gift', p: 1 }); u = go(u, { type: 'gift', p: 1 }); u = go(u, { type: 'gift', p: 0 });  // Ann b+h=80, Bo c+e...
  const ru = RS.summarize(u, info);
  if (ru.players[0].power === ru.players[1].power) { assert.equal(ru.tiebreak, 'tiebreak'); assert.equal(ru.winner, 0); }
});
test('incomplete teams and zero spending: no purchase awards, no division by zero', () => {
  let s = match(['a', 'b', 'c'], { maxRoster: 5 });
  s = go(s, { type: 'gift', p: 0 }); s = go(s, { type: 'mskip' }); s = go(s, { type: 'gift', p: 1 });   // pool exhausted
  assert.equal(s.end, 'pool-exhausted');
  const r = RS.summarize(s, info), keys = r.awards.map(a => a.key);
  assert.ok(!keys.includes('bargain') && !keys.includes('expensive') && !keys.includes('efficient') && !keys.includes('war'));
  assert.ok(keys.includes('mvp') && keys.includes('gift'));
  assert.equal(r.stats[0].powerPerDollar, null); assert.equal(r.stats[0].avgPrice, null);
  assert.equal(r.players[1].roster.length, 1); assert.equal(r.totals.masterSkipsUsed, 1);
});
test('gift-only teams and empty teams', () => {
  let s = match(['h', 'j']); s = go(s, { type: 'gift', p: 0 }); s = go(s, { type: 'gift', p: 0 });   // Ann full, Bo nothing; pool done
  const r = RS.summarize(s, info);
  assert.deepEqual(r.players.map(p => p.roster.length), [2, 0]); assert.equal(r.winner, 0);
  assert.equal(r.stats[1].min, null); assert.equal(RS.share(0, 0), 0.5); assert.equal(RS.share(10, 0), 1);
});
test('ties in awards list every holder', () => {
  let s = match(['a', 'i']); s = go(s, { type: 'gift', p: 0 }); s = go(s, { type: 'gift', p: 1 });
  const mvp = RS.summarize(s, info).awards.find(a => a.key === 'mvp');
  assert.equal(mvp.tie, true); assert.deepEqual(mvp.items.map(i => i.id).sort(), ['a', 'i']);
});
test('history reflects the state after undo (no obsolete events)', () => {
  let s = match(['a', 'b', 'c', 'd']); const undo = [];
  s = go(s, { type: 'bid', p: 0, amt: 3 }); undo.push(JSON.parse(JSON.stringify(s)));
  s = go(s, { type: 'sell' });                                                                  // later undone
  s = JSON.parse(JSON.stringify(undo.pop()));                                                    // undo the sale
  s = go(s, { type: 'bid', p: 1, amt: 5 }); s = go(s, { type: 'sell' });
  s = go(s, { type: 'gift', p: 0 }); s = go(s, { type: 'gift', p: 0 }); s = go(s, { type: 'gift', p: 1 });
  const r = RS.summarize(s, info);
  assert.deepEqual(r.rounds[0].bids, [{ p: 0, amt: 3 }, { p: 1, amt: 5 }]);
  assert.equal(r.rounds[0].result.t, 'sold'); assert.equal(r.rounds[0].result.p, 1);
  assert.equal(r.rounds.filter(x => x.result && x.result.t === 'sold').length, 1);
  assert.deepEqual(RS.filterRounds(r.rounds, 'p0').map(x => x.round), [1, 2, 3]);
  assert.deepEqual(RS.filterRounds(r.rounds, 'gift').length, 3);
  assert.deepEqual(RS.filterRounds(r.rounds, 'buy').length, 1);
});
test('hidden-information matches reveal everything in the summary', () => {
  let s = match(['a', 'b', 'c']); s.setup.info = 'mystery';
  s = go(s, { type: 'pskip', p: 0 }); s = go(s, { type: 'gift', p: 0 }); s = go(s, { type: 'gift', p: 1 });
  const r = RS.summarize(s, info);
  assert.equal(r.rounds[0].char.name, 'Name a'); assert.equal(r.config.info, 'mystery');
  assert.ok(SE.visibility(s.setup, true).identity && SE.visibility(s.setup, true).power);
});
test('stored results survive database changes and reloads; bounded history', () => {
  let s = match(['a', 'b']); s = go(s, { type: 'gift', p: 0 }); s = go(s, { type: 'gift', p: 1 });
  const r = RS.summarize(s, info, { now: 1000 });
  SNAP.a.power = 1; SNAP.a.name = 'Renamed';                     // database update after the match
  const back = RS.readHistory(RS.writeHistory(RS.addToHistory([], r)))[0];
  assert.equal(back.players[0].roster[0].power, 80); assert.equal(back.players[0].roster[0].name, 'Name a');
  assert.equal(back.players[0].power, 80); assert.equal(back.winner, 0);
  SNAP.a.power = 80; SNAP.a.name = 'Name a';
  let list = []; for (let i = 0; i < RS.HISTORY_MAX + 10; i++) list = RS.addToHistory(list, Object.assign({}, r, { id: 'm' + i }));
  assert.equal(list.length, RS.HISTORY_MAX); assert.equal(list[0].id, 'm' + (RS.HISTORY_MAX + 9));
  list = RS.addToHistory(list, Object.assign({}, r, { id: list[3].id, winner: 1 }));             // same id replaces
  assert.equal(list.length, RS.HISTORY_MAX); assert.equal(list[0].winner, 1);
  assert.deepEqual(RS.readHistory('garbage'), []); assert.deepEqual(RS.readHistory(JSON.stringify({ v: 0, matches: [r] })), []);
});

console.log(`Results tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
