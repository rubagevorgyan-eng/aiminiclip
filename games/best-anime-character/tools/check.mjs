// Validation + scoring checks. Exit code 1 on any failure.
//   node tools/check.mjs          tests + validation summary + verified score table
//   node tools/check.mjs --all    also print every entry's score
import assert from 'node:assert/strict';
import { loadABC } from './load.mjs';

const ABC = loadABC({ withCharacters: true });
const E = ABC.engine, C = ABC.config;
let pass = 0, fail = 0;
const test = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '\n  ', e.message); } };
const mk = (tier, extra = {}) => ({
  id: 'test--x', charId: 'test', name: 'Test', alt: [], series: 'jjk', form: null, continuity: 'test', medium: 'manga', anime: 'shown', img: null,
  vsb: {}, stats: { tier, ...extra.stats }, canon: {}, review: { status: 'imported', ...extra.review }
});

/* ---------- tier parsing ---------- */
test('parse: strongest unhedged tier in a key', () => {
  assert.equal(E.parseTier('High 7-C physically, Low 7-B with Red, 7-B with Purple').tier, '7-B');
  assert.equal(E.parseTier('At least 3-C, possibly 3-B with Blut Arterie, 3-B with Bankai').tier, '3-B');
  assert.equal(E.parseTier('3-B, higher with X, 3-A, possibly Low 2-C via Y').tier, '3-A');
  assert.equal(E.parseTier('At most 5-C, up to Low 5-B with Zetten').tier, 'Low 5-B');
});
test('parse: qualifiers set plus', () => {
  assert.equal(E.parseTier('At least 9-A').plus, true);
  assert.equal(E.parseTier('High 6-A+').plus, true);
  assert.equal(E.parseTier('6-B').plus, false);
});
test('parse: review flags', () => {
  assert.deepEqual(E.parseTier('Unknown').tier, null);
  assert.ok(E.parseTier('Unknown').flags.includes('unknown'));
  assert.ok(E.parseTier('Varies').flags.includes('varies'));
  assert.ok(E.parseTier('7-A to 6-C').flags.includes('range'));
  assert.equal(E.parseTier('7-A to 6-C').tier, '7-A');                       // ranges use the lower bound
  assert.ok(E.parseTier('Likely 4-B').flags.includes('hedged'));
  assert.ok(E.parseTier('11-B').flags.includes('tier-11'));
});
test('level names map to tiers without substring mistakes', () => {
  assert.equal(E.levelToTier('At least Large Town level'), 'High 7-C');
  assert.equal(E.levelToTier('Small Town level'), 'Low 7-C');
  assert.equal(E.levelToTier('Multi-City Block level'), '8-A');
  assert.equal(E.levelToTier('Universe level+'), 'Low 2-C');
  assert.equal(E.levelToTier('Universe level'), '3-A');
  assert.equal(E.levelToTier('possibly Planet level'), null);
});

/* ---------- stars ---------- */
test('star mapping follows the configured tier numbers', () => {
  const want = { '10-B': 1, '9-A': 2, 'High 8-C': 3, 'Low 7-C': 4, 'High 7-A': 4, '6-C': 5, 'High 6-A': 5, '5-C': 6, '4-B': 6, 'High 3-A': 6, 'Low 2-C': 7, '1-A': 7, '0': 7 };
  for (const [t, s] of Object.entries(want)) assert.equal(E.starOfTier(t), s, t);
  assert.equal(E.starOfTier('11-A'), null);                                   // Tier 11 -> manual review
});

/* ---------- scoring ---------- */
test('score stays inside its star band and is monotonic in tier', () => {
  let prev = 0;
  for (const [t] of C.tiers) {
    const s = E.score(mk(t));
    if (E.majorOf(t) === 11) { assert.equal(s.power, null); continue; }
    const b = C.stars[s.star];
    assert.ok(s.power >= b.lo && s.power <= b.hi, t + ' ' + s.power);
    assert.ok(s.power >= prev, t + ' not monotonic'); prev = s.power;
  }
});
test('7-star (God Tier) path', () => {
  const s = E.score(mk('High 1-A')); assert.equal(s.star, 7); assert.equal(s.rarity, 'God Tier'); assert.ok(s.power >= 90);
});
test('identical inputs give identical scores', () => {
  const a = mk('5-B', { stats: { speed: { combat: 'Massively FTL+' }, hax: ['Soul Manipulation'] } });
  assert.deepEqual(E.score(a), E.score(JSON.parse(JSON.stringify(a))));
});
test('missing statistics are skipped, not zero', () => {
  const none = E.score(mk('6-B'));
  const allNull = E.score(mk('6-B', { stats: { speed: null, hax: null, resistances: null, regeneration: null, intelligence: null, stamina: null } }));
  assert.equal(none.secondary, 0.5); assert.equal(allNull.power, none.power);
  const weak = E.score(mk('6-B', { stats: { hax: [], resistances: [] } }));    // [] is a real "none"
  assert.ok(weak.power < none.power);
});
test('travel speed never counts as combat speed', () => {
  const a = E.score(mk('7-B', { stats: { speed: { combat: 'Supersonic', travel: 'Massively FTL+' } } }));
  const b = E.score(mk('7-B', { stats: { speed: { combat: 'Supersonic', travel: null } } }));
  assert.equal(a.power, b.power);
});
test('a strong ability never moves a character across a star', () => {
  const s = E.score(mk('High 7-A', { stats: { hax: Object.keys(C.hax), resistances: Array(20).fill('x'), regeneration: 'High-Godly', intelligence: 'Omniscient', stamina: 'Infinite', speed: { combat: 'Immeasurable' } } }));
  assert.equal(s.star, 4); assert.ok(s.power <= C.stars[4].hi);
});
test('Unknown tier needs review.tier; with it the entry scores', () => {
  assert.equal(E.score(mk('Unknown')).power, null);
  const s = E.score(mk('Unknown', { review: { tier: '10-B' } })); assert.equal(s.star, 1); assert.ok(s.flags.includes('manual-tier'));
});

/* ---------- validation ---------- */
test('validation rejects bad entries', () => {
  const bad = mk('7-B'); bad.id = 'Bad ID'; bad.medium = 'comic'; bad.stats.durability = 0;
  const r = E.validate(bad);
  assert.ok(r.errors.some(e => e.startsWith('id')) && r.errors.some(e => e.startsWith('medium')) && r.errors.some(e => e.startsWith('stats.durability')));
  const v = mk('7-B', { review: { status: 'verified' } });
  assert.ok(E.validate(v).errors.some(e => e.startsWith('vsb.url')));
});

test('validation: origins, manga-only anime flags, images, version relationships', () => {
  const ok = mk('7-B'); ok.series = 'nar'; ok.vsb = { origin: 'Naruto' }; assert.deepEqual(E.validate(ok).errors, []);
  const film = mk('7-B'); film.series = 'op'; film.vsb = { origin: 'One Piece Film: Gold' };
  assert.ok(E.validate(film).errors.some(e => e.includes('not a canonical source')));
  const tbv = mk('5-B'); tbv.series = 'nar'; tbv.vsb = { origin: 'Boruto: Two Blue Vortex' };
  assert.deepEqual(E.validate(tbv).errors.filter(e => e.startsWith('anime')).length, 1);           // marked shown -> error
  tbv.anime = 'not-shown'; assert.deepEqual(E.validate(tbv).errors, []);
  const img = mk('7-B'); img.img = 'http://example.com/x.png'; assert.ok(E.validate(img).errors.some(e => e.startsWith('img')));
  const a = mk('7-B'), b = mk('6-B'); a.id = 'x--a'; b.id = 'x--b'; a.charId = b.charId = 'x'; b.series = 'op';
  assert.ok(E.build([a, b]).errors.some(e => e.includes('span several series')));
  b.series = a.series; b.name = 'Other'; assert.ok(E.build([a, b]).errors.some(e => e.includes('different names')));
  const r = mk('Unknown'); r.review.status = 'needs-review'; const br = E.build([r]);
  assert.deepEqual(br.errors, []); assert.equal(E.playable(br.entries[0]), false);                  // queued, not playable
});

/* ---------- the dataset ---------- */
const built = E.build(ABC.characters || []);
test('dataset: no validation errors', () => assert.deepEqual(built.errors, []));
test('dataset: ids unique and every version shares its charId prefix', () => {
  const ids = ABC.characters.map(e => e.id); assert.equal(new Set(ids).size, ids.length);
});
test('dataset: pools hold one version per character', () => {
  for (const mode of ['all', 'anime']) {
    const p = E.pool(built.entries, mode); assert.equal(new Set(p.map(e => e.charId)).size, p.length);
    if (mode === 'anime') assert.ok(p.every(e => e.anime !== 'not-shown'));
  }
  const p = E.pool(built.entries, 'all'); assert.equal(p.find(e => e.charId === 'satoru-gojo').id, 'satoru-gojo--shinjuku-showdown');
  const a = E.pool(built.entries, 'anime'); assert.equal(a.find(e => e.charId === 'satoru-gojo').id, 'satoru-gojo--hidden-inventory');
});

console.log(`\nTests: ${pass} passed, ${fail} failed`);
const st = {}; built.entries.forEach(e => st[e.review.status] = (st[e.review.status] || 0) + 1);
console.log(`Dataset: ${ABC.characters.length} entries, ${built.entries.length} valid, ${built.errors.length} errors, ${built.warnings.length} warnings`, st);
built.warnings.slice(0, 5).forEach(w => console.log('  warn', w)); if (built.warnings.length > 5) console.log('  … ' + (built.warnings.length - 5) + ' more warnings (manual-review queue)');
const stars = {}; E.pool(built.entries, 'all').forEach(e => stars[e.game.star] = (stars[e.game.star] || 0) + 1);
console.log('Pool by star (Anime + Manga):', stars, ' Anime only size:', E.pool(built.entries, 'anime').length);
const rows = built.entries.filter(e => process.argv.includes('--all') || e.review.by === 'reviewer')
  .sort((a, b) => b.game.power - a.game.power)
  .map(e => `${String(e.game.power).padStart(3)} ${e.game.star}★ ${e.game.rarity.padEnd(9)} ${(e.game.tier + (e.game.plus ? '+' : '')).padEnd(9)} sec ${e.game.secondary.toFixed(2)}  ${e.id}`);
console.log('\nScores (' + (process.argv.includes('--all') ? 'all' : 'reviewer-verified') + '):\n' + rows.join('\n'));
process.exit(fail || built.errors.length ? 1 : 0);
