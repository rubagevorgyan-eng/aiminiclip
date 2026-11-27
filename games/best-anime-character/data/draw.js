/* $20 Best Anime Character — character selection (appearance order). Pure; no DOM; seeded RNG supported.
   Input: one already-resolved version per canonical character (setup.pool did the eligibility filtering and the
   version choice), so characters with many transformations get exactly one ticket each.
   The whole order is fixed at match start from the match's settings + seed + data snapshot. It never looks at
   players, money, scores or who is winning, and it is never shown to players. */
(function (g) {
  const ABC = g.ABC = g.ABC || {};

  /* mulberry32: small, fast, reproducible */
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const newSeed = () => (Math.random() * 4294967296) >>> 0;
  function pickWeighted(items, weight, r) {
    let total = 0; for (const it of items) total += weight(it);
    if (!(total > 0)) return items[Math.floor(r() * items.length)];
    let x = r() * total;
    for (const it of items) { x -= weight(it); if (x < 0) return it; }
    return items[items.length - 1];
  }

  /* Chaos / uniform: every eligible character equally likely at every step (= a uniform shuffle). */
  function uniform(cands, r) {
    const a = cands.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /* Balanced weighted sampling without replacement (Classic, Elite, Underdogs, Custom-balanced).
     Each step: (1) tier by starWeights, renormalised over tiers that still have characters (tiers outside the
     configured range simply have none); (2) series inside that tier by
       size^exponent × freshness × (same-series factor if it was the last series and another series is available);
     (3) character inside tier+series, uniform except recent characters × recentFactor. */
  function balanced(cands, r, opts = {}) {
    const D = Object.assign({}, ABC.config.draw, opts.config || {});
    const recent = opts.recent || new Set();
    const buckets = new Map();                     // star -> Map(series -> [cands])
    for (const c of cands) {
      if (!buckets.has(c.star)) buckets.set(c.star, new Map());
      const m = buckets.get(c.star); if (!m.has(c.series)) m.set(c.series, []); m.get(c.series).push(c);
    }
    // stable order inside buckets (no dependence on database insertion order beyond a sort by id)
    for (const m of buckets.values()) for (const list of m.values()) list.sort((a, b) => (a.id < b.id ? -1 : 1));
    const seen = new Map(), out = [];
    let last = null, left = cands.length;
    while (left > 0) {
      const tiers = [...buckets.keys()].filter(t => buckets.get(t).size).sort((a, b) => a - b);
      const tier = pickWeighted(tiers, t => D.starWeights[t] || 0, r);
      const m = buckets.get(tier), series = [...m.keys()].sort();
      const fewest = Math.min(...series.map(s => seen.get(s) || 0));
      const others = series.some(s => s !== last);
      const nT = series.reduce((a, x) => a + m.get(x).length, 0), sumW = series.reduce((a, x) => a + Math.pow(m.get(x).length, D.seriesSizeExponent), 0);
      const sizeW = x => { const n = m.get(x).length; return Math.min(Math.pow(n, D.seriesSizeExponent), D.maxCharacterBoost * n * sumW / nT); };
      const s = pickWeighted(series, x => sizeW(x) /
        (1 + D.freshness * ((seen.get(x) || 0) - fewest)) * (x === last && others ? D.sameSeriesFactor : 1), r);
      const list = m.get(s);
      const c = pickWeighted(list, x => recent.has(x.charId) ? D.recentFactor : 1, r);
      list.splice(list.indexOf(c), 1);
      if (!list.length) m.delete(s);
      if (!m.size) buckets.delete(tier);
      out.push(c); seen.set(s, (seen.get(s) || 0) + 1); last = s; left--;
    }
    return out;
  }

  /* cands: [{id, charId, series, star}] — one per canonical character. Returns entry ids in appearance order. */
  function order(cands, method, { seed = newSeed(), recent = null, config = null } = {}) {
    const ids = new Set(cands.map(c => c.charId));
    if (ids.size !== cands.length) throw new Error('draw.order: more than one version of a character');
    const r = rng(seed);
    const list = method === 'uniform' ? uniform(cands, r) : balanced(cands, r, { recent, config });
    return list.map(c => c.id);
  }

  /* Recent-character history across completed matches (bounded; newest first). */
  function remember(history, charIds, max = ABC.config.draw.recentMax) {
    const out = [...new Set([...charIds, ...(history || [])])];
    return out.slice(0, max);
  }

  ABC.draw = { rng, newSeed, pickWeighted, uniform, balanced, order, remember };
})(typeof window !== 'undefined' ? window : globalThis);
