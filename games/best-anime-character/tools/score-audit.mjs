// Scoring audit: does the Step 3 formula separate characters inside tiers, stay monotonic across tiers, and which
// entries are conditional / hax-heavy / stat-less / multi-continuity? Read-only.   node tools/score-audit.mjs
import { loadABC } from './load.mjs';
const ABC = loadABC({ withCharacters: true }), ENG = ABC.engine, C = ABC.config;
const B = ENG.build(ABC.characters), P = B.entries.filter(ENG.playable);
const tierIdx = t => ENG.tierIndex(t);
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

/* 1. monotonic: median power per VS subtier must not drop as the tier rises */
const byTier = new Map();
for (const e of P) { const k = e.game.tier; if (!byTier.has(k)) byTier.set(k, []); byTier.get(k).push(e.game.power); }
const tiers = [...byTier.keys()].sort((a, b) => tierIdx(a) - tierIdx(b));
let prev = -1, breaks = [];
for (const t of tiers) { const m = med(byTier.get(t)); if (m < prev) breaks.push(t); prev = m; }
/* overlap between neighbouring subtiers: share of pairs where the lower subtier scores higher */
let inv = 0, pairs = 0;
for (let i = 1; i < tiers.length; i++) for (const a of byTier.get(tiers[i - 1])) for (const b of byTier.get(tiers[i])) { pairs++; if (a > b) inv++; }

/* 2. spread inside each star */
const stars = {};
for (const e of P) { const s = e.game.star; (stars[s] = stars[s] || []).push(e); }
const starRows = Object.entries(stars).map(([s, es]) => {
  const p = es.map(e => e.game.power), distinct = new Set(p).size;
  const noStats = es.filter(e => Object.values(e.game.factors || {}).every(v => v == null)).length;
  return `${s}★ n=${es.length} power ${Math.min(...p)}–${Math.max(...p)} (band ${C.stars[s].lo}–${C.stars[s].hi}), ${distinct} distinct values, ${noStats} with no secondary stats`;
});
/* largest same-subtier groups and how many share one score */
const crowd = tiers.map(t => [t, byTier.get(t)]).sort((a, b) => b[1].length - a[1].length).slice(0, 5)
  .map(([t, p]) => { const c = {}; p.forEach(x => c[x] = (c[x] || 0) + 1); const top = Math.max(...Object.values(c)); return `${t}: ${p.length} entries, ${new Set(p).size} distinct scores, largest tie ${top}`; });

/* 3. cases to review */
const plus = P.filter(e => e.game.plus).length;
const hedged = P.filter(e => (e.game.flags || []).includes('hedged')).length;
const haxHeavy = P.filter(e => e.game.factors && e.game.factors.hax >= 0.9).length;
const multiCont = new Map();
for (const e of P) { const k = e.charId; if (!multiCont.has(k)) multiCont.set(k, new Set()); multiCont.get(k).add(/continuity\)$/.test(e.continuity) ? e.continuity : 'main'); }
const mc = [...multiCont].filter(([, s]) => s.size > 1).length;
const outdated = P.filter(e => (e.review.notes || []).some(n => /outdated/.test(n))).length;

console.log('Monotonic medians across', tiers.length, 'subtiers:', breaks.length ? 'breaks at ' + breaks.join(', ') : 'yes');
console.log(`Neighbouring-subtier inversions: ${(100 * inv / pairs).toFixed(1)}% of ${pairs} pairs (secondary stats may reorder adjacent subtiers by design)`);
console.log(starRows.join('\n'));
console.log('Most crowded subtiers:\n  ' + crowd.join('\n  '));
console.log(`Conditional ("+"/at least/higher): ${plus}; hedged tier text: ${hedged}; hax factor ≥ 0.9: ${haxHeavy}; characters with versions in several continuities: ${mc}; VS-outdated pages: ${outdated}`);
