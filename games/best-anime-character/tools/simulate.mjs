// Selection simulation: seeded matches through the real pool + draw code. Prints a compact summary and writes
// tools/sim-results.json. Exit 1 if a hard rule breaks (duplicates, out-of-range tiers, wrong eligibility).
//   node tools/simulate.mjs [--matches 400] [--draws 30]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { loadABC } from './load.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ABC = loadABC({ withCharacters: true });
for (const f of ['setup.js', 'draw.js']) vm.runInThisContext(readFileSync(join(HERE, '..', 'data', f), 'utf8'));
const SU = ABC.setup, DR = ABC.draw, B = ABC.engine.build(ABC.characters), E = B.entries, byId = B.byId;
const SIDS = Object.keys(ABC.config.series), W = ABC.config.draw.starWeights;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : +process.argv[i + 1]; };
const MATCHES = arg('--matches', 400), DRAWS = arg('--draws', 30);
const def = p => SU.normalize(Object.assign({}, p), SIDS);
let hard = 0; const fail = m => { hard++; console.log('HARD FAIL:', m); };
const pct = x => (100 * x).toFixed(1) + '%';

/* run `matches` seeded matches for settings s; return the first `draws` ids of each */
function run(s, { matches = MATCHES, draws = DRAWS, recent = null, seed0 = 1 } = {}) {
  const out = [];
  for (let m = 0; m < matches; m++) {
    const seed = (seed0 * 7919 + m * 104729) >>> 0;
    const ids = SU.pool(E, s, DR.rng(seed)).ids;
    const order = SU.drawOrder(ids, byId, s, { seed: (seed ^ 0x9E3779B9) >>> 0, recent });
    if (new Set(order.map(id => byId[id].charId)).size !== order.length) fail('duplicate canonical character in an order');
    if (order.length !== ids.length) fail('order length differs from pool');
    out.push(order.slice(0, draws));
  }
  return out;
}
const tiers = rows => { const c = {}; let n = 0; for (const r of rows) for (const id of r) { c[byId[id].game.star] = (c[byId[id].game.star] || 0) + 1; n++; } return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v / n])); };
const series = rows => { const c = {}; let n = 0; for (const r of rows) for (const id of r) { c[byId[id].series] = (c[byId[id].series] || 0) + 1; n++; } return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v / n])); };
const sameRate = rows => { let s = 0, n = 0; for (const r of rows) for (let i = 1; i < r.length; i++) { n++; if (byId[r[i]].series === byId[r[i - 1]].series) s++; } return n ? s / n : 0; };
const poolOf = s => SU.pool(E, s, () => 0).ids;
const shareInPool = (s, key) => { const ids = poolOf(s), c = {}; for (const id of ids) c[key(byId[id])] = (c[key(byId[id])] || 0) + 1; return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v / ids.length])); };
const R = {};

/* 1. Classic */
{
  const s = def({}), rows = run(s), t = tiers(rows), sr = series(rows), pool = shareInPool(s, e => e.series);
  const indep = Object.values(sr).reduce((a, p) => a + p * p, 0);
  const freq = {}; for (const r of rows) for (const id of r) freq[byId[id].charId] = (freq[byId[id].charId] || 0) + 1;
  const fs = Object.values(freq), poolN = poolOf(s).length;
  R.classic = { draws: rows.length * DRAWS, tierObserved: t, tierTarget: W, seriesObserved: sr, seriesPoolShare: pool,
    sameSeriesRate: sameRate(rows), sameSeriesIfIndependent: indep, charactersSeen: fs.length, poolSize: poolN,
    maxCharacterRate: Math.max(...fs) / rows.length, meanCharacterRate: fs.reduce((a, b) => a + b, 0) / poolN / rows.length };
  for (const k of Object.keys(W)) if (Math.abs((t[k] || 0) - W[k]) > 0.03) fail(`classic tier ${k}: ${pct(t[k] || 0)} vs target ${pct(W[k])}`);
}
/* 2. Chaos: uniform -> tiers follow pool shares, no series balancing */
{
  const s = SU.applyMode(def({}), 'chaos', SIDS), rows = run(s), t = tiers(rows), pool = shareInPool(s, e => String(e.game.star));
  R.chaos = { tierObserved: t, tierPoolShare: pool, sameSeriesRate: sameRate(rows), sameSeriesIfIndependent: Object.values(shareInPool(s, e => e.series)).reduce((a, p) => a + p * p, 0) };
  for (const k of Object.keys(pool)) if (Math.abs((t[k] || 0) - pool[k]) > 0.025) fail(`chaos tier ${k}: ${pct(t[k] || 0)} vs pool ${pct(pool[k])}`);
}
/* 3. Elite / Underdogs: only their tiers, Classic weights renormalised */
for (const [mode, lo, hi] of [['elite', 5, 7], ['underdogs', 1, 4]]) {
  const s = SU.applyMode(def({}), mode, SIDS), rows = run(s), t = tiers(rows);
  const keys = Object.keys(W).filter(k => k >= lo && k <= hi), tot = keys.reduce((a, k) => a + W[k], 0);
  R[mode] = { tierObserved: t, tierTarget: Object.fromEntries(keys.map(k => [k, W[k] / tot])) };
  for (const k of Object.keys(t)) if (k < lo || k > hi) fail(`${mode}: drew ${k}★`);
  for (const k of keys) if (Math.abs((t[k] || 0) - W[k] / tot) > 0.04) fail(`${mode} tier ${k}: ${pct(t[k] || 0)} vs ${pct(W[k] / tot)}`);
}
/* 4. Anime only */
{
  const s = def({ eligibility: 'anime' }), rows = run(s, { matches: 150 });
  if (rows.flat().some(id => !['shown', 'anime-only'].includes(byId[id].anime))) fail('anime only drew a non-anime version');
  R.animeOnly = { poolSize: poolOf(s).length, tierObserved: tiers(rows) };
}
/* 5. Narrow tiers 6-7 */
{
  const s = def({ mode: 'custom', minStar: 6, maxStar: 7 }), rows = run(s, { matches: 200 }), t = tiers(rows);
  R.narrow67 = { tierObserved: t, tierTarget: { 6: W[6] / (W[6] + W[7]), 7: W[7] / (W[6] + W[7]) } };
  if (Object.keys(t).some(k => k < 6)) fail('narrow range leaked');
}
/* 6. One series */
{
  const s = def({ mode: 'custom', series: ['op'] }), rows = run(s, { matches: 150 });
  if (rows.flat().some(id => byId[id].series !== 'op')) fail('one-series pool leaked');
  R.oneSeries = { series: 'op', poolSize: poolOf(s).length, tierObserved: tiers(rows) };
}
/* 7. Tiny pool, full exhaustion */
{
  const s = def({ mode: 'custom', series: ['vin'] }), n = poolOf(s).length, rows = run(s, { matches: 200, draws: 1000 });
  if (rows.some(r => r.length !== n)) fail('tiny pool not fully drawn');
  R.tinyPool = { series: 'vin', poolSize: n, fullOrders: rows.length };
}
/* 8. Random version preference: only eligible versions, one per character, spread across versions */
{
  const s = def({ version: 'random' }), counts = {};
  for (let m = 0; m < 300; m++) for (const id of SU.pool(E, s, DR.rng(m + 1)).ids) if (byId[id].charId === 'son-goku') counts[id] = (counts[id] || 0) + 1;
  const elig = E.filter(e => e.charId === 'son-goku' && ABC.engine.playable(e)).map(e => e.id);
  if (Object.keys(counts).some(id => !elig.includes(id))) fail('random version picked an ineligible version');
  R.randomVersion = { character: 'son-goku', eligibleVersions: elig.length, picks: counts };
}
/* 9. Recent-character penalty (balanced only) */
{
  const s = def({}), all = poolOf(s).map(id => byId[id].charId), rnd = DR.rng(77);
  const recent = new Set(all.filter(() => rnd() < 0.2));
  const rate = rows => rows.flat().filter(id => recent.has(byId[id].charId)).length / rows.flat().length;
  const without = rate(run(s, { seed0: 5 })), withP = rate(run(s, { seed0: 5, recent }));
  const chaos = SU.applyMode(s, 'chaos', SIDS);
  const cw = rate(run(chaos, { seed0: 5 })), cwp = rate(run(chaos, { seed0: 5, recent }));
  R.recentPenalty = { recentShareOfPool: recent.size / all.length, classicWithout: without, classicWith: withP, chaosWithout: cw, chaosWith: cwp };
  if (!(withP < without * 0.8)) fail('recent penalty has no effect in Classic');
  if (Math.abs(cw - cwp) > 1e-9) fail('recent penalty leaked into Chaos');
}
/* 10. Fairness: the order never depends on anything but settings + seed */
{
  const s = def({}), ids = poolOf(s);
  const a = SU.drawOrder(ids, byId, s, { seed: 42 }), b = SU.drawOrder(ids.slice().reverse(), byId, s, { seed: 42 });
  R.insertionOrderIndependent = JSON.stringify(a) === JSON.stringify(b);
  if (!R.insertionOrderIndependent) fail('order depends on database insertion order');
}
/* timing */
{ const s = def({}), ids = poolOf(s), t0 = performance.now(); for (let i = 0; i < 20; i++) SU.drawOrder(ids, byId, s, { seed: i }); R.msPerFullOrder = +((performance.now() - t0) / 20).toFixed(1); }

writeFileSync(join(HERE, 'sim-results.json'), JSON.stringify(R, null, 1));
const fmt = o => Object.entries(o).map(([k, v]) => `${k}:${pct(v)}`).join(' ');
console.log(`Classic  ${R.classic.draws} draws (${MATCHES}×${DRAWS})  tiers ${fmt(R.classic.tierObserved)}`);
console.log(`         same-series next draw ${pct(R.classic.sameSeriesRate)} (independent sampling would give ${pct(R.classic.sameSeriesIfIndependent)})`);
const sr = Object.entries(R.classic.seriesObserved).sort((a, b) => b[1] - a[1]);
console.log(`         series high ${sr.slice(0, 3).map(([k, v]) => `${k} ${pct(v)} (pool ${pct(R.classic.seriesPoolShare[k])})`).join(', ')}; low ${sr.slice(-3).map(([k, v]) => `${k} ${pct(v)} (pool ${pct(R.classic.seriesPoolShare[k])})`).join(', ')}`);
console.log(`         ${R.classic.charactersSeen}/${R.classic.poolSize} characters seen; busiest character in ${pct(R.classic.maxCharacterRate)} of matches`);
console.log(`Chaos    tiers ${fmt(R.chaos.tierObserved)}  (pool ${fmt(R.chaos.tierPoolShare)})`);
console.log(`Elite    ${fmt(R.elite.tierObserved)}   target ${fmt(R.elite.tierTarget)}`);
console.log(`Underdog ${fmt(R.underdogs.tierObserved)}   target ${fmt(R.underdogs.tierTarget)}`);
console.log(`Anime only pool ${R.animeOnly.poolSize}: ${fmt(R.animeOnly.tierObserved)}`);
console.log(`6–7★ only: ${fmt(R.narrow67.tierObserved)} target ${fmt(R.narrow67.tierTarget)} | one series (op, ${R.oneSeries.poolSize}) ok | tiny pool (vin, ${R.tinyPool.poolSize}) fully drawn ${R.tinyPool.fullOrders}×`);
console.log(`Random version (son-goku, ${R.randomVersion.eligibleVersions} eligible): ${JSON.stringify(R.randomVersion.picks)}`);
console.log(`Recent penalty: recent = ${pct(R.recentPenalty.recentShareOfPool)} of pool -> Classic ${pct(R.recentPenalty.classicWithout)} → ${pct(R.recentPenalty.classicWith)}; Chaos ${pct(R.recentPenalty.chaosWithout)} → ${pct(R.recentPenalty.chaosWith)}`);
console.log(`Insertion-order independent: ${R.insertionOrderIndependent} | full order of ${R.classic.poolSize}: ${R.msPerFullOrder} ms`);
console.log(hard ? `\n${hard} HARD FAILURES` : '\nAll hard rules held.');
process.exit(hard ? 1 : 0);
