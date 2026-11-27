// Setup, mode and filtering tests.   node tools/test-setup.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { loadABC } from './load.mjs';

const ABC = loadABC({ withCharacters: true });
const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
for (const f of ['auction.js', 'setup.js', 'draw.js']) vm.runInThisContext(readFileSync(join(DATA, f), 'utf8'));
const SU = ABC.setup, AU = ABC.auction, B = ABC.engine.build(ABC.characters), E = B.entries, byId = B.byId;
const SIDS = Object.keys(ABC.config.series);
let pass = 0, fail = 0;
const test = (n, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log('FAIL', n, '\n  ', e.message); } };
const seeded = s => () => (s = (s * 48271) % 2147483647) / 2147483647;
const def = () => SU.normalize({}, SIDS);

test('Classic defaults are the established rules and immediately valid', () => {
  const s = def();
  assert.deepEqual(SU.rulesOf(s), { startMoney: 20, maxRoster: 5, playerSkips: 3, masterSkips: 5 });
  assert.equal(s.eligibility, 'all'); assert.equal(s.version, 'strongest'); assert.equal(s.series, null);
  assert.deepEqual([s.minStar, s.maxStar], [1, 7]);
  const v = SU.validate(s, E, SIDS); assert.ok(v.ok); assert.deepEqual(v.warnings, []);
});
test('pool counts unique characters, never versions', () => {
  const { ids, stats } = SU.pool(E, def());
  assert.equal(ids.length, new Set(E.filter(ABC.engine.playable).map(e => e.charId)).size);   // unreviewed entries stay out
  assert.equal(new Set(ids.map(id => byId[id].charId)).size, ids.length);
  assert.equal(stats.characters, ids.length);
});
test('strongest form is picked per character', () => {
  const { ids } = SU.pool(E, def());
  for (const id of ids) { const e = byId[id]; assert.ok(E.filter(x => x.charId === e.charId && ABC.engine.playable(x)).every(x => x.game.power <= e.game.power), id); }
  assert.ok(ids.includes('satoru-gojo--shinjuku-showdown'));
});
test('Anime only filters versions (not names) and keeps the strongest animated one', () => {
  const s = Object.assign(def(), { eligibility: 'anime' });
  const { ids } = SU.pool(E, s);
  assert.ok(ids.every(id => byId[id].anime !== 'not-shown'));
  assert.ok(ids.includes('satoru-gojo--hidden-inventory'));          // Gojo stays, as his animated version
  assert.ok(ids.includes('sung-jinwoo--black-heart'));
  assert.ok(!ids.some(id => byId[id].charId === 'antares'));          // manhwa-only character is gone
});
test('mode presets: Elite = 5★+, Underdogs = 4★ and below, Chaos = uniform draw', () => {
  const el = SU.applyMode(def(), 'elite', SIDS), ud = SU.applyMode(def(), 'underdogs', SIDS), ch = SU.applyMode(def(), 'chaos', SIDS);
  assert.ok(SU.pool(E, el).ids.every(id => byId[id].game.star >= 5));
  assert.ok(SU.pool(E, ud).ids.every(id => byId[id].game.star <= 4));
  assert.equal(ch.draw, 'uniform'); assert.equal(el.draw, 'balanced');
  // star filter applies to versions: Jinwoo appears in Underdogs as a weaker (4★) version
  assert.ok(SU.pool(E, ud).ids.includes('sung-jinwoo--black-heart'));
});
test('editing a preset field switches to Custom; other edits keep the mode', () => {
  let s = SU.applyMode(def(), 'elite', SIDS);
  assert.equal(SU.settle(Object.assign({}, s, { budget: 50 }), SIDS).mode, 'elite');
  assert.equal(SU.settle(Object.assign({}, s, { minStar: 3 }), SIDS).mode, 'custom');
  assert.equal(SU.settle(Object.assign(def(), { team: 7 }), SIDS).mode, 'custom');
});
test('random form: only eligible versions, still one per character', () => {
  const s = Object.assign(def(), { version: 'random' });
  const seen = new Set();
  for (let k = 1; k < 40; k++) {
    const { ids } = SU.pool(E, s, seeded(k));
    assert.equal(new Set(ids.map(id => byId[id].charId)).size, ids.length);
    ids.forEach(id => seen.add(id));
  }
  assert.ok(seen.has('satoru-gojo--hidden-inventory') && seen.has('satoru-gojo--shinjuku-showdown'));
  const a = SU.pool(E, Object.assign({}, s, { eligibility: 'anime' }), seeded(3)).ids;
  assert.ok(a.every(id => byId[id].anime !== 'not-shown'));
});
test('base forms: never invented; missing data falls back and is reported', () => {
  const s = Object.assign(def(), { version: 'base' });
  const { ids, stats } = SU.pool(E, s);
  const withBase = new Set(E.filter(e => e.formType === 'base' && ABC.engine.playable(e)).map(e => e.charId));
  assert.equal(stats.baseRecorded, withBase.size);
  for (const id of ids) { const e = byId[id]; if (withBase.has(e.charId)) assert.equal(e.formType, 'base'); }
  assert.ok(SU.validate(s, E, SIDS).warnings.some(w => w.startsWith('Base forms are recorded for ' + withBase.size)));
});
test('series filter and counts', () => {
  const s = Object.assign(def(), { series: ['jjk', 'hxh'] });
  const { ids } = SU.pool(E, s); assert.ok(ids.every(id => ['jjk', 'hxh'].includes(byId[id].series)));
  const c = SU.seriesCounts(E, def()); assert.equal(Object.values(c).reduce((a, b) => a + b, 0), SU.pool(E, def()).ids.length);
  assert.deepEqual(SU.normalize({ series: [...SIDS] }, SIDS).series, null);     // all selected = default
  assert.deepEqual(SU.normalize({ series: ['nope', 'jjk'] }, SIDS).series, ['jjk']);
});
test('validation: impossible and tight setups', () => {
  assert.ok(!SU.validate(Object.assign(def(), { series: [] }), E, SIDS).ok);
  assert.ok(!SU.validate(Object.assign(def(), { minStar: 6, maxStar: 3 }), E, SIDS).ok);
  const small = Object.entries(SU.seriesCounts(E, def())).sort((a, b) => a[1] - b[1])[0];        // smallest series
  const big = Object.assign(def(), { team: 10, series: [small[0]] });
  const v = SU.validate(big, E, SIDS); assert.ok(!v.ok); assert.match(v.errors[0], /need 20 unique/);
  const n = small[1], team = Math.max(1, Math.floor(n / 2));                                       // fits, but not with skips
  const t = SU.validate(Object.assign(def(), { team, series: [small[0]], skips: 3, master: 5 }), E, SIDS);
  assert.ok(t.ok); assert.ok(t.warnings.some(w => w.startsWith('Tight pool')));
  const u = SU.validate(Object.assign(def(), { unreviewed: true }), E, SIDS); assert.ok(u.count >= SU.validate(def(), E, SIDS).count);
  assert.ok(SU.validate(Object.assign(def(), { budget: 3 }), E, SIDS).warnings.some(w => w.includes("can't fill")));
});
test('normalize clamps bad input', () => {
  const s = SU.normalize({ budget: -5, team: 99, skips: 'x', master: 1e9, minStar: 0, maxStar: 12, version: 'weird', eligibility: 'manga', names: ['A'.repeat(40)] }, SIDS);
  assert.deepEqual([s.budget, s.team, s.skips, s.master, s.minStar, s.maxStar, s.version, s.eligibility], [1, 10, 3, 20, 1, 7, 'strongest', 'all']);
  assert.equal(s.names[0].length, 16);
});
test('migration: legacy prefs.mode, garbage and current version', () => {
  assert.equal(SU.migrate(null, { mode: 'anime' }, SIDS).eligibility, 'anime');
  assert.equal(SU.migrate('junk', null, SIDS).budget, 20);
  const cur = SU.normalize({ budget: 50, mode: 'custom' }, SIDS);
  assert.deepEqual(SU.migrate(JSON.parse(JSON.stringify(cur)), null, SIDS), cur);
});
test('draw orders are permutations of the pool, reproducible by seed', () => {
  const s = def(), { ids } = SU.pool(E, s);
  const bal = SU.drawOrder(ids, byId, s, { seed: 9 });
  assert.deepEqual([...bal].sort(), [...ids].sort());
  assert.deepEqual(SU.drawOrder(ids, byId, s, { seed: 9 }), bal);
  assert.notDeepEqual(SU.drawOrder(ids, byId, s, { seed: 10 }), bal);
  const uni = SU.drawOrder(ids, byId, Object.assign({}, s, { draw: 'uniform' }), { seed: 9 });
  assert.deepEqual([...uni].sort(), [...ids].sort());
});
test('draw: one ticket per canonical character, empty tiers redistribute, uniform ignores recent', () => {
  const DR = ABC.draw;
  assert.throws(() => DR.order([{ id: 'a--1', charId: 'a', series: 'op', star: 3 }, { id: 'a--2', charId: 'a', series: 'op', star: 5 }], 'balanced', { seed: 1 }));
  const only17 = [{ id: 'x--1', charId: 'x', series: 'op', star: 1 }, { id: 'y--1', charId: 'y', series: 'db', star: 7 }];
  for (let k = 1; k < 30; k++) assert.equal(DR.order(only17, 'balanced', { seed: k }).length, 2);   // tiers 2-6 empty: no stall
  const c = Array.from({ length: 50 }, (_, i) => ({ id: 'c' + i + '--b', charId: 'c' + i, series: i % 2 ? 'op' : 'db', star: 4 }));
  assert.deepEqual(DR.order(c, 'uniform', { seed: 3 }), DR.order(c, 'uniform', { seed: 3, recent: new Set(['c1', 'c2']) }));
});
test('every mode (and tight custom pools) plays to a clean end through the same engine', () => {
  const ctx = { charOf: id => ({ charId: byId[id].charId, power: byId[id].game.power }) };
  const configs = ['classic', 'chaos', 'elite', 'underdogs'].map(m => SU.applyMode(def(), m, SIDS))
    .concat([Object.assign(def(), { mode: 'custom', series: ['dn'], team: 4 }), Object.assign(def(), { mode: 'custom', budget: 100, team: 10 }),
      Object.assign(def(), { eligibility: 'anime', version: 'random', team: 3, budget: 10 })]);
  for (const [i, s] of configs.entries()) for (let g = 0; g < 40; g++) {
    const rng = seeded(1000 * i + g + 1);
    const ids = SU.drawOrder(SU.pool(E, s, rng).ids, byId, s, { seed: 1000 * i + g + 1 });
    let st = AU.create({ names: ['A', 'B'], order: ids, rules: SU.rulesOf(s), mode: s.eligibility });
    for (let k = 0; k < 2000 && !st.over; k++) {
      const p = Math.floor(rng() * 2), t = rng();
      const a = t < .5 ? { type: 'bid', p, amt: AU.bidOptions(st, p)[Math.floor(rng() * 4)].amt } : t < .75 ? { type: 'sell' } : t < .82 ? { type: 'gift', p } : t < .92 ? { type: 'pskip', p } : { type: 'mskip' };
      const r = AU.apply(st, a, ctx); if (r.ok) st = r.state;
    }
    assert.ok(st.over, `config ${i} game ${g} did not end`);
    assert.ok(st.players.every(P => P.money >= 0 && P.roster.length <= s.team));
    const all = st.players.flatMap(P => P.roster.map(id => byId[id].charId)); assert.equal(new Set(all).size, all.length);
    if (s.eligibility === 'anime') assert.ok(st.players.flatMap(P => P.roster).every(id => byId[id].anime !== 'not-shown'));
  }
});

console.log(`Setup tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
