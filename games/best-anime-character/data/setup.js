/* $20 Anime Battle — match setup: modes, settings, pool filtering, validation, persistence.
   Pure (no DOM). Settings are separate from live match state: a match copies what it needs at start. */
(function (g) {
  const ABC = g.ABC = g.ABC || {};
  const SETTINGS_V = 1;

  /* Classic defaults = the established rules. */
  const DEFAULTS = {
    v: SETTINGS_V, mode: 'classic', names: ['', ''],
    budget: 20, team: 5, skips: 3, master: 5,
    eligibility: 'all',            // 'all' = Anime + Manga + Manhwa, 'anime' = Anime only
    series: null,                  // null = every series in config; else array of series ids
    minStar: 1, maxStar: 7,
    version: 'strongest',          // 'strongest' | 'random' | 'base'
    unreviewed: false,
    info: 'open',                  // 'open' | 'blind' (scores hidden) | 'mystery' (identity hidden until resolved)
    blindStars: true,              // Blind: show stars
    clues: { series: true, power: true, ability: true, stars: false, role: false },   // Mystery clues
    timer: 0, timerBid: 'reset', timerExpire: 'sell',   // seconds (0 = off) | after a bid: reset/extend/none | at zero: sell/wait             // true = also allow machine-flagged / tier-only entries awaiting manual review
    draw: 'balanced'               // 'balanced' (weighted tiers + series balancing, data/draw.js) | 'uniform'
  };
  /* Modes = a patch over the settings. Changing a patched field moves the match to Custom. */
  const MODES = {
    classic: { label: 'Classic', desc: 'Standard $20 auction. Balanced series mix.', patch: { budget: 20, team: 5, skips: 3, master: 5, minStar: 1, maxStar: 7, draw: 'balanced', info: 'open' } },
    chaos: { label: 'Chaos', desc: 'Any eligible character, fully random order.', patch: { budget: 20, team: 5, skips: 3, master: 5, minStar: 1, maxStar: 7, draw: 'uniform', info: 'open' } },
    elite: { label: 'Elite', desc: 'Only 5★ and up.', patch: { minStar: 5, maxStar: 7, draw: 'balanced', info: 'open' } },
    underdogs: { label: 'Underdogs', desc: 'Only 4★ and below.', patch: { minStar: 1, maxStar: 4, draw: 'balanced', info: 'open' } },
    blind: { label: 'Blind', desc: 'Classic rules. Power and VS tiers hidden until the end.', patch: { budget: 20, team: 5, skips: 3, master: 5, minStar: 1, maxStar: 7, draw: 'balanced', info: 'blind' } },
    mystery: { label: 'Mystery', desc: 'Bid on clues. Who it is shows when sold.', patch: { budget: 20, team: 5, skips: 3, master: 5, minStar: 1, maxStar: 7, draw: 'balanced', info: 'mystery' } },
    custom: { label: 'Custom', desc: 'Your budget, team size, series and stars.', patch: {} }
  };
  const BUDGETS = [10, 20, 30, 50, 100], TEAMS = [3, 5, 7, 10], TIMERS = [0, 10, 15, 30, 60];
  const LIMITS = { budget: [1, 1000], team: [1, 10], skips: [0, 10], master: [0, 20], star: [1, 7] };

  const int = (v, d) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : d; };
  const clamp = (v, [lo, hi]) => Math.max(lo, Math.min(hi, v));

  /* Coerce anything (old saves, form input) into a well-formed settings object. */
  function normalize(raw, seriesIds) {
    const s = Object.assign({}, DEFAULTS, raw && typeof raw === 'object' ? raw : {});
    const out = {
      v: SETTINGS_V,
      mode: MODES[s.mode] ? s.mode : 'classic',
      names: [0, 1].map(i => String((s.names || [])[i] ?? '').slice(0, 16)),
      budget: clamp(int(s.budget, 20), LIMITS.budget), team: clamp(int(s.team, 5), LIMITS.team),
      skips: clamp(int(s.skips, 3), LIMITS.skips), master: clamp(int(s.master, 5), LIMITS.master),
      eligibility: s.eligibility === 'anime' ? 'anime' : 'all',
      series: Array.isArray(s.series) ? [...new Set(s.series.filter(x => seriesIds.includes(x)))] : null,
      minStar: clamp(int(s.minStar, 1), LIMITS.star), maxStar: clamp(int(s.maxStar, 7), LIMITS.star),
      version: ['strongest', 'random', 'base'].includes(s.version) ? s.version : 'strongest',
      unreviewed: s.unreviewed === true,
      info: ['open', 'blind', 'mystery'].includes(s.info) ? s.info : 'open',
      blindStars: s.blindStars !== false,
      clues: Object.fromEntries(['series', 'power', 'ability', 'stars', 'role'].map(k => [k, s.clues && typeof s.clues[k] === 'boolean' ? s.clues[k] : DEFAULTS.clues[k]])),
      timer: [0, 10, 15, 30, 60].includes(int(s.timer, 0)) ? int(s.timer, 0) : 0,
      timerBid: ['reset', 'extend', 'none'].includes(s.timerBid) ? s.timerBid : 'reset',
      timerExpire: s.timerExpire === 'wait' ? 'wait' : 'sell',
      draw: s.draw === 'uniform' ? 'uniform' : 'balanced'
    };
    if (out.series && out.series.length === seriesIds.length) out.series = null;
    return out;
  }
  /* Older saves: v0 had only prefs.mode ('all' | 'anime'). */
  function migrate(saved, legacyPrefs, seriesIds) {
    if (saved && saved.v === SETTINGS_V) return normalize(saved, seriesIds);
    const base = Object.assign({}, saved && typeof saved === 'object' ? saved : {});
    if (legacyPrefs && (legacyPrefs.mode === 'anime' || legacyPrefs.mode === 'all') && !base.eligibility) base.eligibility = legacyPrefs.mode;
    return normalize(base, seriesIds);
  }
  function applyMode(settings, mode, seriesIds) {
    return normalize(Object.assign({}, settings, MODES[mode].patch, { mode }), seriesIds);
  }
  /* After a manual edit: stay in the mode only if its patch still holds. */
  function settle(settings, seriesIds) {
    const m = MODES[settings.mode], s = normalize(settings, seriesIds);
    if (m && Object.entries(m.patch).some(([k, v]) => s[k] !== v)) s.mode = 'custom';
    return s;
  }

  /* ---------- pool ---------- */
  /* Filters work on VERSIONS: eligibility and star range first, then one version per canonical character. */
  function eligibleVersions(entries, s) {
    const lo = Math.min(s.minStar, s.maxStar), hi = Math.max(s.minStar, s.maxStar);
    const playable = ABC.engine ? ABC.engine.playable : (e => e.review.status === 'verified');
    return entries.filter(e => (s.unreviewed ? e.game && e.game.power != null : playable(e)) &&
      (!s.series || s.series.includes(e.series)) && (s.eligibility !== 'anime' || e.anime === 'shown' || e.anime === 'anime-only') &&
      e.game.star >= lo && e.game.star <= hi);
  }
  function groupByChar(versions) {
    const m = new Map();
    for (const e of versions) { if (!m.has(e.charId)) m.set(e.charId, []); m.get(e.charId).push(e); }
    for (const list of m.values()) list.sort((a, b) => b.game.power - a.game.power || (a.id < b.id ? -1 : 1));
    return m;
  }
  /* rng: () => [0,1). 'random' picks a version per character; 'base' uses formType 'base' when recorded. */
  function pool(entries, s, rng = Math.random) {
    const groups = groupByChar(eligibleVersions(entries, s));
    const ids = [], stats = { characters: groups.size, baseRecorded: 0, baseMissing: 0 };
    for (const list of groups.values()) {
      let pick = list[0];
      if (s.version === 'random') pick = list[Math.floor(rng() * list.length)];
      else if (s.version === 'base') {
        const b = list.find(e => e.formType === 'base');
        if (b) { pick = b; stats.baseRecorded++; } else stats.baseMissing++;
      }
      ids.push(pick.id);
    }
    return { ids, stats };
  }
  /* Unique characters per series under the current filters (series selection itself ignored). */
  function seriesCounts(entries, s) {
    const all = Object.assign({}, s, { series: null });
    const out = {};
    for (const [cid, list] of groupByChar(eligibleVersions(entries, all))) out[list[0].series] = (out[list[0].series] || 0) + 1;
    return out;
  }
  /* Appearance order: see data/draw.js. Classic/Elite/Underdogs/Custom-balanced use balanced weighted sampling;
     Chaos and Custom-uniform use a uniform shuffle. The replay penalty applies to balanced draws only. */
  function drawOrder(ids, byId, s, { seed, recent } = {}) {
    const cands = ids.map(id => ({ id, charId: byId[id].charId, series: byId[id].series, star: byId[id].game.star }));
    return ABC.draw.order(cands, s.draw === 'uniform' ? 'uniform' : 'balanced', { seed, recent: s.draw === 'uniform' ? null : recent });
  }

  /* ---------- validation ---------- */
  function validate(s, entries, seriesIds) {
    const errors = [], warnings = [];
    if (s.series && !s.series.length) errors.push('Pick at least one series.');
    if (s.minStar > s.maxStar) errors.push('Minimum star tier is above the maximum.');
    const { stats } = pool(entries, s, () => 0);
    const n = stats.characters, need = 2 * s.team, spare = 2 * s.skips + s.master;
    if (n < need) errors.push(`Not enough characters: both teams need ${need} unique characters but this setup has ${n}. Add series, widen the star range or shrink the teams.`);
    else if (n < need + spare) warnings.push(`Tight pool: ${n} characters for ${need} slots plus up to ${spare} skips. The match may end before teams fill.`);
    if (s.budget < s.team) warnings.push(`$${s.budget} can't fill ${s.team} slots at $1 each; some characters will have to be gifts.`);
    if (s.info === 'mystery' && !Object.values(s.clues).some(Boolean)) warnings.push('Mystery with no clues: players bid completely blind.');
    if (s.version === 'base' && stats.baseMissing) warnings.push(`Base forms are recorded for ${stats.baseRecorded} of ${n} characters; the rest use their strongest form.`);
    return { ok: !errors.length, errors, warnings, count: n, need };
  }
  /* Rules handed to the auction engine at match start (copied, so later edits never touch a live match). */
  const rulesOf = s => ({ startMoney: s.budget, maxRoster: s.team, playerSkips: s.skips, masterSkips: s.master });

  ABC.setup = { SETTINGS_V, DEFAULTS, MODES, BUDGETS, TEAMS, TIMERS, LIMITS, normalize, migrate, applyMode, settle, eligibleVersions, pool, seriesCounts, drawOrder, validate, rulesOf };
})(typeof window !== 'undefined' ? window : globalThis);
