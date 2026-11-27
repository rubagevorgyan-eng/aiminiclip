/* $20 Best Anime Character — data engine: tier parsing, star mapping, deterministic scoring, validation, pools.
   Pure functions over ABC.config and entry objects; no DOM, no network. Shared by the page and tools/check.mjs. */
(function (g) {
  const ABC = g.ABC = g.ABC || {};
  const cfg = () => ABC.config;

  /* ---------- tiers ---------- */
  let TIER_IDX = null;
  function tierTable() {
    if (!TIER_IDX) { TIER_IDX = new Map(); cfg().tiers.forEach(([t], i) => TIER_IDX.set(t.toLowerCase(), i)); }
    return TIER_IDX;
  }
  const tierIndex = t => { const i = tierTable().get(String(t).toLowerCase()); return i === undefined ? -1 : i; };
  const majorOf = t => t === '0' ? 0 : parseInt(String(t).replace(/^(Low|High)\s+/i, ''), 10);
  const TOKEN = /\b((?:Low|High)\s+)?(1[01]|[0-9])-([ABC])\b|(?:^|[^\w-])(0)(?![\w-])/g;

  /* Parse a VS Battles tier text for ONE profile key.
     Returns {tier, plus, flags[]}: tier = strongest tier stated without hedging; flags explain anything needing review. */
  function parseTier(text) {
    const out = { tier: null, plus: false, flags: [], raw: text == null ? null : String(text) };
    if (text == null || !String(text).trim()) { out.flags.push('missing'); return out; }
    const s = String(text).replace(/\{\{|\}\}/g, ' ');
    if (/^\s*~/.test(s)) out.flags.push('estimate');
    if (/\bunknown\b/i.test(s)) out.flags.push('unknown');  // downgraded to partial-unknown below when a tier is stated
    if (/\bvaries\b/i.test(s)) out.flags.push('varies');
    if (/\b(likely|possibly|potentially|probably)\b/i.test(s)) out.flags.push('hedged');
    const toks = [];
    let m; TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(s))) {
      const t = m[4] ? '0' : ((m[1] ? (m[1].trim().toLowerCase() === 'low' ? 'Low ' : 'High ') : '') + m[2] + '-' + m[3]);
      const before = s.slice(Math.max(0, m.index - 24), m.index).toLowerCase();
      toks.push({ t, i: tierIndex(t), at: m.index, hedge: /(likely|possibly|potentially|probably|at most)\s*$/.test(before) });
    }
    if (!toks.length) { if (!out.flags.includes('unknown') && !out.flags.includes('varies')) out.flags.push('unparsed'); return out; }
    if (out.flags.includes('unknown')) out.flags[out.flags.indexOf('unknown')] = 'partial-unknown';
    if (toks.some(x => x.i < 0)) out.flags.push('unknown-tier-token');
    if (toks.some(x => x.hedge)) out.flags.push('hedged');
    if (/\d-[ABC]\+?\s+to\s+(?:(?:Low|High)\s+)?\d-[ABC]/i.test(s)) out.flags.push('range');
    if (toks.some(x => majorOf(x.t) === 11)) out.flags.push('tier-11');
    let pick;
    if (out.flags.includes('range')) pick = toks.filter(x => x.i >= 0)[0];               // ranges: lower bound
    else pick = toks.filter(x => x.i >= 0 && !x.hedge).sort((a, b) => b.i - a.i)[0];       // strongest unhedged
    if (!pick) return out;
    out.tier = pick.t;
    const after = s.slice(pick.at + pick.t.length, pick.at + pick.t.length + 3);
    if (/^\+/.test(after) || /at least\s*$/i.test(s.slice(Math.max(0, pick.at - 12), pick.at)) ||
        /\b(far |much |even |likely )?higher\b/i.test(s.slice(pick.at))) out.plus = true;
    return out;
  }

  /* AP / durability text uses level names ("Large Town level"); return the strongest unhedged one as a tier. */
  function levelToTier(text) {
    if (!text) return null;
    const s = String(text), low = s.toLowerCase();
    let best = -1;
    cfg().tiers.forEach(([t, name], i) => {
      const n = name.toLowerCase();
      let k = low.indexOf(n);
      while (k >= 0) {
        const pre = low.slice(Math.max(0, k - 9), k);
        const tail = low.slice(k + n.length, k + n.length + 1);
        const prefixed = /(small|large|multi-|high|low|brown|complex|dwarf)\s?$/.test(pre) && !n.startsWith(pre.trim().split(/\s/).pop());
        const hedged = /(likely|possibly|potentially|probably|at most)\s*'*$/.test(low.slice(Math.max(0, k - 22), k));
        const plusMismatch = !n.endsWith('+') && tail === '+' && cfg().tiers.some(([, nn]) => nn.toLowerCase() === n + '+');
        if (!prefixed && !hedged && !plusMismatch && /[^a-z]|^$/.test(low.slice(k - 1, k) || ' ')) best = Math.max(best, i);
        k = low.indexOf(n, k + 1);
      }
    });
    return best < 0 ? null : cfg().tiers[best][0];
  }

  function starOfTier(t) {
    if (t == null || tierIndex(t) < 0) return null;
    const maj = majorOf(t);
    for (const [k, v] of Object.entries(cfg().stars)) if (v.majors.includes(maj)) return +k;
    return null;
  }
  function tierPosition(t, plus) {
    const star = starOfTier(t), majors = cfg().stars[star].majors;
    const inStar = cfg().tiers.map(r => r[0]).filter(x => majors.includes(majorOf(x)));
    const n = inStar.length, i = inStar.indexOf(t);
    const step = n > 1 ? 1 / (n - 1) : 0;
    return Math.min(1, (n > 1 ? i * step : 0.5) + (plus ? cfg().scoring.plusStep * step : 0));
  }

  /* ---------- secondary factors (each 0..1 or null) ---------- */
  const clamp01 = x => Math.max(0, Math.min(1, x));
  function ladderRank(text, ladder) {
    if (!text) return -1;
    let best = -1;
    ladder.forEach((name, i) => {
      const re = new RegExp('(^|[^A-Za-z-])' + name.replace(/[+]/g, '\\+').replace(/[-]/g, '\\-') + '(?![A-Za-z+-])', 'i');
      if (re.test(text)) best = Math.max(best, i);
    });
    return best;
  }
  /* Combat speed = the class tied to "combat"/"reaction" wording; travel/flight speed text is cut off first. */
  function combatSpeedText(sp) {
    if (!sp) return null;
    if (typeof sp === 'object') return sp.combat || null;
    return String(sp);
  }
  function factors(e, star, tier) {
    const c = cfg(), st = e.stats || {}, f = {};
    const sp = combatSpeedText(st.speed);
    const r = ladderRank(sp, c.speedLadder);
    f.speed = r < 0 ? null : clamp01(0.5 + (r - c.speedLadder.indexOf(c.speedExpected[star])) / 12);
    const du = st.durabilityTier ? tierIndex(st.durabilityTier) : -1;
    f.durability = (du >= 0 && tier) ? clamp01(1 + Math.min(0, du - tierIndex(tier)) * 0.25) : null;
    f.hax = Array.isArray(st.hax) ? clamp01(st.hax.reduce((t, h) => t + (c.hax[h] || 0), 0) / 3) : null;
    f.resistances = Array.isArray(st.resistances) ? clamp01(st.resistances.length / c.resistFull) : null;
    if (st.regeneration === 'none') f.regeneration = 0;
    else { const rr = ladderRank(st.regeneration, c.regenLadder); f.regeneration = rr < 0 ? null : rr / (c.regenLadder.length - 1); }
    const ir = ladderRank(st.intelligence, c.intelLadder);
    f.intelligence = ir < 0 ? null : ir / (c.intelLadder.length - 1);
    let sv = null; if (st.stamina) for (const [w, v] of c.staminaWords) if (new RegExp('\\b' + w + '\\b', 'i').test(st.stamina)) { sv = v; break; }
    f.stamina = sv;
    const lim = e.review && e.review.grades && e.review.grades.limitations;
    f.limitations = typeof lim === 'number' ? clamp01(lim) : null;
    return f;
  }

  /* ---------- score ---------- */
  function score(e) {
    const c = cfg(), rv = e.review || {};
    const parsed = parseTier(rv.tier || (e.stats && e.stats.tier));
    const res = { tier: parsed.tier, plus: rv.tier ? !!rv.plus : parsed.plus, flags: parsed.flags.slice(), star: null, power: null, rarity: null, color: null, factors: null, secondary: null };
    if (rv.tier) res.flags = ['manual-tier'];
    if (!parsed.tier) { res.flags.push('no-score'); return res; }
    const star = starOfTier(parsed.tier);
    if (star == null) { res.flags.push('manual-review-tier'); return res; }
    const band = c.stars[star], span = band.hi - band.lo;
    const fx = factors(e, star, parsed.tier);
    let wsum = 0, acc = 0;
    for (const [k, w] of Object.entries(c.weights)) if (fx[k] != null) { wsum += w; acc += w * fx[k]; }
    const secondary = wsum ? acc / wsum : 0.5;
    const pos = tierPosition(parsed.tier, res.plus);
    const power = Math.max(band.lo, Math.min(band.hi, band.lo + Math.round(span * (c.scoring.tierShare * pos + c.scoring.secondaryShare * secondary))));
    Object.assign(res, { star, power, rarity: band.name, color: band.color, factors: fx, secondary: Math.round(secondary * 1000) / 1000, position: Math.round(pos * 1000) / 1000 });
    return res;
  }

  /* ---------- validation ---------- */
  const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?$/;
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const isStrOrNull = v => v === null || typeof v === 'string';
  function validate(e) {
    const c = cfg(), err = [], warn = [];
    const need = (k, ok, msg) => { if (!ok) err.push(k + ': ' + msg); };
    need('id', typeof e.id === 'string' && SLUG.test(e.id), 'lowercase slug, "char--version" form');
    need('charId', typeof e.charId === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(e.charId), 'lowercase slug');
    need('id', typeof e.id === 'string' && (e.id === e.charId || e.id.startsWith(e.charId + '--')), 'must start with charId');
    need('name', typeof e.name === 'string' && e.name.trim().length > 0, 'required');
    need('alt', Array.isArray(e.alt) && e.alt.every(x => typeof x === 'string'), 'string array');
    need('roles', e.roles === undefined || (Array.isArray(e.roles) && e.roles.every(x => typeof x === 'string')), 'string array');
    need('series', !!c.series[e.series], 'unknown series id');
    need('form', isStrOrNull(e.form), 'string or null');
    need('formType', e.formType === undefined || [null, 'base', 'transformation', 'version'].includes(e.formType), 'base | transformation | version | null (null = not recorded)');
    need('continuity', typeof e.continuity === 'string' && e.continuity.length > 0, 'required');
    need('medium', c.media.includes(e.medium), c.media.join(' | '));
    need('anime', c.animeStatus.includes(e.anime), c.animeStatus.join(' | '));
    need('img', e.img === null || (typeof e.img === 'string' && (/^https:\/\/s4\.anilist\.co\/file\/anilistcdn\/character\/(large|medium)\/[\w.-]+$/.test(e.img) ||
      /^https:\/\/static\.wikia\.nocookie\.net\/vsbattles\/images\/[0-9a-f]\/[0-9a-f]{2}\/[^\s"'<>]+$/.test(e.img))), 'null, an AniList character image or a VS Battles file URL');
    need('imgMatch', e.imgMatch == null || ['key', 'single', 'latest', 'base', 'portrait'].includes(e.imgMatch), 'key | single | latest | base | portrait | null');
    need('imgSource', e.imgSource == null || (e.imgSource === 'vsbattles' ? !!e.imgPage : e.imgSource === 'anilist'), 'vsbattles (with imgPage) | anilist | null');
    const st = e.stats;
    need('stats', st && typeof st === 'object', 'required object (values may be null)');
    if (st) {
      for (const k of ['tier', 'ap', 'durability', 'durabilityTier', 'durabilityTier', 'striking', 'lifting', 'stamina', 'range', 'intelligence', 'experience', 'regeneration', 'weaknesses'])
        need('stats.' + k, st[k] === undefined || isStrOrNull(st[k]), 'string or null (never 0)');
      if (st.speed !== undefined && st.speed !== null) need('stats.speed', typeof st.speed === 'object' && ['combat', 'reaction', 'travel'].every(k => isStrOrNull(st.speed[k] ?? null)), '{combat, reaction, travel}');
      for (const k of ['abilities', 'hax', 'resistances']) need('stats.' + k, st[k] === undefined || st[k] === null || (Array.isArray(st[k]) && st[k].every(x => typeof x === 'string')), 'string array or null');
      if (Array.isArray(st.hax)) st.hax.forEach(h => { if (!(h in c.hax)) warn.push('stats.hax: "' + h + '" has no hax weight'); });
    }
    const v = e.vsb || {};
    need('vsb.url', v.url == null || /^https:\/\/vsbattles\.fandom\.com\/wiki\/\S+$/.test(v.url), 'VS Battles wiki URL or null');
    const ser = c.series[e.series];
    if (ser && v.origin != null) {
      need('vsb.origin', (ser.canon || []).includes(v.origin), 'origin "' + v.origin + '" is not a canonical source for ' + ser.name + ' (continuity)');
      need('anime', !((ser.mangaOnly || []).includes(v.origin) && (e.anime === 'shown' || e.anime === 'anime-only')), 'manga-exclusive source "' + v.origin + '" marked as shown in the anime');
    }
    const rv = e.review || {};
    need('review.status', c.statuses.includes(rv.status), c.statuses.join(' | '));
    need('review.date', rv.date == null || DATE.test(rv.date), 'YYYY-MM-DD');
    if (rv.status === 'verified') {
      need('vsb.url', !!v.url, 'required when verified');
      need('vsb.revid', Number.isInteger(v.revid), 'required when verified (MediaWiki revision id)');
      need('vsb.key', typeof v.key === 'string', 'required when verified (profile key, "" if the page has none)');
      need('review.date', !!rv.date, 'required when verified');
    }
    const sc = score(e);
    if (sc.power == null && rv.status === 'needs-review') warn.push('score: no tier yet (' + sc.flags.join(', ') + ') — manual review');
    else if (sc.power == null && rv.status !== 'excluded') err.push('score: no tier to score (' + sc.flags.join(', ') + ') — add review.tier with a note or set status excluded');
    const review = ['estimate', 'unknown', 'varies', 'hedged', 'range', 'tier-11', 'unknown-tier-token', 'unparsed'].filter(f => sc.flags.includes(f));
    const acknowledged = rv.status === 'verified' && (rv.notes || []).some(n => /^Tier text flags/.test(n));
    if (review.length && !rv.tier && !acknowledged && rv.status !== 'needs-review' && rv.status !== 'legacy') warn.push('tier needs manual review: ' + review.join(', '));
    return { errors: err, warnings: warn, score: sc };
  }

  /* ---------- build + pools ---------- */
  function build(list) {
    const entries = [], byId = {}, errors = [], warnings = [];
    for (const e of list || []) {
      const r = validate(e);
      if (byId[e.id]) r.errors.push('id: duplicate');
      r.errors.forEach(x => errors.push(e.id + ' — ' + x));
      r.warnings.forEach(x => warnings.push(e.id + ' — ' + x));
      if (r.errors.length || e.review.status === 'excluded') continue;
      const x = Object.assign({}, e, { game: r.score });
      entries.push(x); byId[e.id] = x;
    }
    // version relationships: every version of a canonical character shares name and series
    const byChar = new Map();
    for (const e of list || []) { if (!byChar.has(e.charId)) byChar.set(e.charId, []); byChar.get(e.charId).push(e); }
    for (const [cid, vs] of byChar) {
      if (new Set(vs.map(v => v.series)).size > 1) errors.push(cid + ' — versions span several series (incompatible continuity)');
      if (new Set(vs.map(v => v.name)).size > 1) errors.push(cid + ' — versions have different names: ' + [...new Set(vs.map(v => v.name))].join(' / '));
    }
    // possible duplicate canonical characters: same name + series under different charIds
    const seen = new Map();
    for (const [cid, vs] of byChar) { const k = vs[0].series + '|' + vs[0].name.toLowerCase(); if (seen.has(k)) warnings.push(cid + ' — same name and series as ' + seen.get(k) + ' (possible duplicate)'); else seen.set(k, cid); }
    return { entries, byId, errors, warnings };
  }
  /* One entry per canonical character: the strongest eligible version unless `pick[charId]` names one.
     Appearance probability is uniform per character and never depends on power. */
  function pool(entries, mode, pick) {
    const best = new Map();
    for (const e of entries) {
      if (mode === 'anime' && e.anime === 'not-shown') continue;
      const chosen = pick && pick[e.charId];
      const cur = best.get(e.charId);
      if (chosen) { if (e.id === chosen) best.set(e.charId, e); continue; }
      if (!cur || e.game.power > cur.game.power || (e.game.power === cur.game.power && e.id < cur.id)) best.set(e.charId, e);
    }
    return [...best.values()];
  }

  const playable = e => e.review && e.review.status === 'verified' && e.game && e.game.power != null;
  ABC.engine = { playable, levelToTier, parseTier, tierIndex, majorOf, starOfTier, tierPosition, factors, score, validate, build, pool, ladderRank };
})(typeof window !== 'undefined' ? window : globalThis);
