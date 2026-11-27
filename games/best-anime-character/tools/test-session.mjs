// Session tests: undo, save/restore, timers, hidden information, clues, fullscreen fallback, rematch state.
//   node tools/test-session.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { loadABC } from './load.mjs';

const ABC = loadABC({ withCharacters: true });
const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
for (const f of ['auction.js', 'setup.js', 'draw.js', 'session.js']) vm.runInThisContext(readFileSync(join(DATA, f), 'utf8'));
const SE = ABC.session, AU = ABC.auction, SU = ABC.setup, B = ABC.engine.build(ABC.characters), byId = B.byId;
const SIDS = Object.keys(ABC.config.series);
let pass = 0, fail = 0;
const test = (n, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log('FAIL', n, '\n  ', e.message); } };
const ctx = { charOf: id => ({ charId: byId[id].charId, power: byId[id].game.power }) };

/* a real match like the page builds it */
function newMatch(over = {}, seed = 7) {
  const cfg = SU.normalize(Object.assign({}, over), SIDS);
  const ids = SU.pool(B.entries, cfg, ABC.draw.rng(seed)).ids;
  const order = SU.drawOrder(ids, byId, cfg, { seed: seed ^ 0x9E3779B9 });
  const S = AU.create({ names: ['A', 'B'], order, mode: cfg.eligibility, rules: SU.rulesOf(cfg) });
  S.setup = Object.assign(cfg, { seed }); S.snap = Object.fromEntries(order.map(id => [id, [byId[id].game.power, byId[id].game.star]])); S.paused = false;
  S.timer = cfg.timer ? SE.timerNew(cfg.timer, 1, 1000) : null;
  return S;
}
function act(S, undo, a) { const r = AU.apply(S, a, ctx); assert.ok(r.ok, a.type + ': ' + r.reason); return [r.state, SE.pushUndo(undo, S)]; }

test('undo restores every field of every action type and keeps the upcoming sequence', () => {
  let S = newMatch(), undo = [];
  const order0 = S.order.slice(), seq = [];
  const steps = [{ type: 'bid', p: 0, amt: 3 }, { type: 'bid', p: 1, amt: 5 }, { type: 'sell' }, { type: 'gift', p: 0 }, { type: 'pskip', p: 1 }, { type: 'bid', p: 0, amt: 1 }, { type: 'mskip' }];
  for (const a of steps) { seq.push(JSON.stringify(S)); [S, undo] = act(S, undo, a); }
  for (let i = steps.length - 1; i >= 0; i--) { const prev = undo.at(-1); undo = undo.slice(0, -1); S = SE.restoreUndo(prev, S); assert.deepEqual(S, JSON.parse(seq[i]), 'step ' + i); }
  assert.deepEqual(S.order, order0);
  assert.deepEqual(S.players.map(p => [p.money, p.roster.length, p.skips]), [[20, 0, 3], [20, 0, 3]]);
  assert.equal(S.master, 5); assert.equal(S.pos, 0); assert.deepEqual(S.bid, { amt: 0, by: -1, seq: 0 });
  // replaying the same actions reaches the same characters (no reshuffle)
  let T = JSON.parse(seq[0]); for (const a of steps) T = AU.apply(T, a, ctx).state;
  assert.deepEqual(T.order, order0);
});
test('undo stack is bounded', () => {
  let undo = []; const S = newMatch();
  for (let i = 0; i < SE.UNDO_MAX + 15; i++) undo = SE.pushUndo(undo, S);
  assert.equal(undo.length, SE.UNDO_MAX);
  assert.ok(!('order' in undo[0]) && !('snap' in undo[0]));                     // fixed parts stay out of undo steps
  assert.ok(SE.pack(S, undo).length < 400 * 1024, 'save with full undo stack should stay small');
});
test('Mystery: undo across a reveal is refused; bids can still be undone', () => {
  let S = newMatch({ info: 'mystery' }), undo = [];
  [S, undo] = act(S, undo, { type: 'bid', p: 0, amt: 2 });
  assert.equal(SE.undoBlockedReason(S, undo.at(-1)), null);
  [S, undo] = act(S, undo, { type: 'sell' });
  assert.match(SE.undoBlockedReason(S, undo.at(-1)), /can't be undone/);
  const O = newMatch(); let u2 = []; let T; [T, u2] = act(O, u2, { type: 'gift', p: 0 });
  assert.equal(SE.undoBlockedReason(T, u2.at(-1)), null);                     // open mode: fine
});
test('save round-trip, corruption, old versions and unknown characters', () => {
  let S = newMatch({ timer: 30 }), undo = [];
  [S, undo] = act(S, undo, { type: 'bid', p: 1, amt: 4 });
  const raw = SE.pack(S, undo), r = SE.unpack(raw, id => !!byId[id]);
  assert.ok(r.ok); assert.deepEqual(r.state, JSON.parse(JSON.stringify(S))); assert.equal(r.undo.length, 1);
  assert.deepEqual(r.state.snap, S.snap);                                    // scores travel with the save
  assert.equal(SE.unpack('{not json', () => true).ok, false);
  assert.equal(SE.unpack(JSON.stringify({ v: 4, state: S }), () => true).ok, false);
  assert.equal(SE.unpack(raw, id => id !== S.order[3]).ok, false);           // database lost a character
  const broken = JSON.parse(raw); delete broken.state.snap; assert.equal(SE.unpack(broken, () => true).ok, false);
});
test('saved scores are not changed by database updates', () => {
  const S = newMatch(), id = S.order[0];
  const r = SE.unpack(SE.pack(S, []), () => true);
  byId[id].game.power += 7;                                                   // simulate a later rescore
  assert.equal(r.state.snap[id][0], byId[id].game.power - 7);
  byId[id].game.power -= 7;
});
test('timer: elapsed-time maths, pause/resume, bid policies', () => {
  let t = SE.timerNew(15, 1, 0);
  assert.equal(SE.timerLeft(t, 4000), 11000);
  t = SE.timerPause(t, 4000); assert.equal(SE.timerLeft(t, 99999), 11000);   // paused time doesn't run
  t = SE.timerResume(t, 50000); assert.equal(SE.timerLeft(t, 52000), 9000);
  assert.equal(SE.timerLeft(SE.timerOnBid(t, 'reset', 52000), 52000), 15000);
  assert.equal(SE.timerLeft(SE.timerOnBid(t, 'extend', 52000), 52000), 14000);
  assert.equal(SE.timerLeft(SE.timerOnBid(t, 'none', 52000), 52000), 9000);
  assert.equal(SE.timerLeft(SE.timerNew(10, 1, 0), 30000), 0);               // throttled tab: still exact
});
test('timer expiry: never buys without a bid; one resolution only', () => {
  let S = newMatch({ timer: 10 });
  assert.equal(SE.timerExpiry(S, 'sell').action, null);
  S = AU.apply(S, { type: 'bid', p: 0, amt: 2 }, ctx).state;
  assert.equal(SE.timerExpiry(S, 'wait').action, null);
  const a = SE.timerExpiry(S, 'sell').action; assert.equal(a.type, 'sell');
  const r1 = AU.apply(S, a, ctx), r2 = AU.apply(r1.state, a, ctx);          // expiry + manual Sold at once
  assert.ok(r1.ok); assert.equal(r2.ok, false); assert.equal(r2.reason, 'stale');
  assert.equal(r1.state.players[0].money, 18);
});
test('visibility: Blind and Mystery hide the right things; the end reveals all', () => {
  const open = SE.visibility({ info: 'open' }, false), blind = SE.visibility({ info: 'blind', blindStars: true }, false);
  const blindNoStars = SE.visibility({ info: 'blind', blindStars: false }, false), mys = SE.visibility({ info: 'mystery' }, false);
  assert.ok(open.power && open.stats && open.teamPower && open.identity);
  assert.deepEqual([blind.identity, blind.art, blind.form, blind.power, blind.tier, blind.stats, blind.teamPower, blind.stars, blind.list], [true, true, true, false, false, false, false, true, false]);
  assert.equal(blindNoStars.stars, false);
  assert.deepEqual([mys.identity, mys.art, mys.form, mys.power, mys.stars], [false, false, false, false, false]);
  for (const v of [SE.visibility({ info: 'blind' }, true), SE.visibility({ info: 'mystery' }, true)]) assert.ok(v.power && v.identity && v.stats && v.teamPower);
});
test('Mystery clues come only from the entry\'s own data', () => {
  const e = B.entries.find(x => x.roles && x.roles.length && x.stats && x.stats.abilities && x.stats.abilities.length && ABC.engine.playable(x));
  const all = { series: true, power: true, ability: true, stars: true, role: true };
  const cl = SE.clues(e, all, ABC.config.series[e.series].name, e.game.star);
  assert.deepEqual(cl.map(c => c.k), ['series', 'power', 'stars', 'ability', 'role']);
  assert.equal(cl.find(c => c.k === 'role').value, e.roles[0]);
  assert.equal(cl.find(c => c.k === 'stars').value, '★'.repeat(e.game.star));
  for (const s of SE.abilityStyle(e)) assert.ok(typeof s === 'string');
  const bare = Object.assign({}, e, { roles: [], stats: { abilities: null } });
  const cb = SE.clues(bare, all, 'X', 3);
  assert.equal(cb.find(c => c.k === 'role').value, 'Not recorded'); assert.equal(cb.find(c => c.k === 'ability').value, 'Not recorded');
  assert.deepEqual(SE.clues(e, { series: false, power: false, ability: false, stars: false, role: false }, 'X', 1), []);
  assert.ok(!cl.some(c => String(c.value).includes(e.name)));                 // the answer is never a clue
});
test('fullscreen: native when supported, focus-mode fallback otherwise', () => {
  assert.equal(SE.fullscreenMode({ fullscreenEnabled: true, documentElement: { requestFullscreen() {} } }), 'native');
  assert.equal(SE.fullscreenMode({ fullscreenEnabled: false, documentElement: {} }), 'focus');
  assert.equal(SE.fullscreenMode(undefined), 'focus');
});
test('rematch: same setup, fresh state, new draw', () => {
  let S = newMatch({ budget: 30, team: 3, info: 'blind' }, 11), undo = [];
  [S, undo] = act(S, undo, { type: 'gift', p: 0 });
  const R = newMatch(SU.normalize(S.setup, SIDS), 12);                        // page: start(names, S.setup) with a new seed
  assert.deepEqual(SU.rulesOf(R.setup), SU.rulesOf(S.setup)); assert.equal(R.setup.info, 'blind');
  assert.deepEqual(R.players.map(p => [p.money, p.roster.length, p.skips]), [[30, 0, 3], [30, 0, 3]]);
  assert.equal(R.master, 5); assert.equal(R.events.filter(e => e.t !== 'start' && e.t !== 'reveal').length, 0);
  assert.notDeepEqual(R.order, S.order);
});
test('setup presets: Blind and Mystery use Classic rules; timer off by default', () => {
  const d = SU.normalize({}, SIDS); assert.equal(d.timer, 0); assert.equal(d.info, 'open');
  const b = SU.applyMode(d, 'blind', SIDS), m = SU.applyMode(d, 'mystery', SIDS);
  assert.deepEqual(SU.rulesOf(b), SU.rulesOf(d)); assert.equal(b.info, 'blind'); assert.equal(m.info, 'mystery');
  assert.equal(SU.settle(Object.assign({}, b, { info: 'open' }), SIDS).mode, 'custom');
  assert.equal(SU.normalize({ timer: 45 }, SIDS).timer, 0);
});

console.log(`Session tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
