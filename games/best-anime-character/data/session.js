/* $20 Anime Battle — match session helpers. Pure (no DOM): save format, bounded undo, timer arithmetic,
   hidden-information rules and Mystery clues. Used by the page and by tools/test-session.mjs. */
(function (g) {
  const ABC = g.ABC = g.ABC || {};
  const SAVE_V = 5, UNDO_MAX = 40;

  /* ---------- save / restore ---------- */
  /* A save holds the full match state (config, seed, order of version ids, score snapshot, rosters, bids, events,
     timer, pause) plus a bounded undo stack. Every field is re-checked on load; anything off -> null (start fresh). */
  function pack(state, undo) {
    return JSON.stringify({ v: SAVE_V, savedAt: Date.now(), state, undo: (undo || []).slice(-UNDO_MAX) });
  }
  function unpack(raw, knownId) {
    let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return { ok: false, reason: 'corrupted' }; }
    if (!d || typeof d !== 'object') return { ok: false, reason: 'empty' };
    if (d.v !== SAVE_V) return { ok: false, reason: 'incompatible version ' + d.v };
    const s = d.state, ok = st => st && st.v === 4 && Array.isArray(st.players) && st.players.length === 2 && Array.isArray(st.order) &&
      st.snap && st.order.every(id => knownId(id) && Array.isArray(st.snap[id])) && Number.isInteger(st.pos) && st.bid && Array.isArray(st.events);
    if (!ok(s)) return { ok: false, reason: 'invalid or references unknown characters' };
    const okUndo = u => u && u.v === 4 && Array.isArray(u.players) && u.players.length === 2 && Number.isInteger(u.pos) && u.bid && Array.isArray(u.events) && u.pos < s.order.length + 1;
    const undo = Array.isArray(d.undo) ? d.undo.filter(okUndo) : [];
    return { ok: true, state: s, undo, savedAt: d.savedAt };
  }
  /* Undo stack: whole-state snapshots minus the parts that never change during a match (draw order, score snapshot,
     setup), which are restored from the live match. Restores are all-or-nothing and the upcoming sequence never
     changes. Keeping the fixed parts out keeps a 40-step save small (it was ~2.7 MB with them). */
  const FIXED = ['order', 'snap', 'setup', 'matchId'];
  function pushUndo(stack, state) {
    const e = JSON.parse(JSON.stringify(state)); for (const k of FIXED) delete e[k];
    const s = stack.concat([e]); return s.length > UNDO_MAX ? s.slice(-UNDO_MAX) : s;
  }
  function restoreUndo(entry, current) {
    const s = JSON.parse(JSON.stringify(entry));
    for (const k of FIXED) if (current && current[k] !== undefined) s[k] = JSON.parse(JSON.stringify(current[k]));
    return s;
  }
  /* Mystery: undoing a sale/gift would put an already-revealed character back on the block as a "mystery". */
  function undoBlockedReason(state, prev) {
    if (!prev) return 'Nothing to undo.';
    if (state.setup && state.setup.info === 'mystery') {
      const revealedSince = state.events.slice(prev.events.length).some(e => e.t === 'sold' || e.t === 'gift');
      if (revealedSince) return 'Mystery Auction: this would hide a character everyone has already seen, so it can\'t be undone.';
    }
    return null;
  }

  /* ---------- timer (elapsed-time based; never trusts interval regularity) ---------- */
  /* t = {dur, left, at, running, round, fired}: `left` ms remaining as of wall-clock `at` when running. */
  const timerNew = (durS, round, now, running = true) => ({ dur: durS * 1000, left: durS * 1000, at: now, running, round, fired: false });
  const timerLeft = (t, now) => !t ? null : Math.max(0, t.running ? t.left - (now - t.at) : t.left);
  const timerPause = (t, now) => t && t.running ? Object.assign({}, t, { left: timerLeft(t, now), at: now, running: false }) : t;
  const timerResume = (t, now) => t && !t.running && !t.fired ? Object.assign({}, t, { at: now, running: true }) : t;
  function timerOnBid(t, policy, now) {
    if (!t || t.fired) return t;
    if (policy === 'reset') return Object.assign({}, t, { left: t.dur, at: now });
    if (policy === 'extend') return Object.assign({}, t, { left: Math.min(t.dur, timerLeft(t, now) + 5000), at: now });
    return t;
  }
  /* What to do at zero. 'sell' = sell to the high bidder if there is one; with no bid, or with 'wait', the timer
     stops and the host decides. Never auto-buys without a valid bid. */
  function timerExpiry(state, setting) {
    if (state.bid.by >= 0 && setting === 'sell') return { action: { type: 'sell', seq: state.bid.seq, round: state.pos + 1 }, note: 'Time! Sold to the high bidder.' };
    return { action: null, note: state.bid.by >= 0 ? 'Time! Host confirms the sale.' : 'Time! No bids — host decides (gift or skip).' };
  }

  /* ---------- hidden information ---------- */
  /* What the screen may show right now. At the end of a match everything is revealed. */
  function visibility(setup, over) {
    const info = setup && setup.info || 'open';
    if (over || info === 'open') return { info: 'open', identity: true, art: true, form: true, power: true, stars: true, tier: true, stats: true, teamPower: true, list: true };
    if (info === 'blind') return { info, identity: true, art: true, form: true, power: false, stars: setup.blindStars !== false, tier: false, stats: false, teamPower: false, list: false };
    return { info: 'mystery', identity: false, art: false, form: false, power: false, stars: false, tier: false, stats: false, teamPower: false, list: false,
      resolvedPower: false };
  }

  /* ---------- Mystery clues (only from the entry's own verified fields) ---------- */
  const BROAD = s => s <= 1 ? 'Human level' : s <= 3 ? 'Superhuman (wall to city-block)' : s <= 5 ? 'Destructive (town to continent)' : s <= 6 ? 'Cosmic (moon to universe)' : 'Beyond universal';
  /* VS Battles ability page names -> broad style. First matching groups win, in this order. */
  const ABILITY_GROUPS = [
    ['Space & time', /Spatial|Time |Time$|Teleportation|Portal|BFR|Dimensional/],
    ['Mind & soul', /Mind|Soul|Illusion|Memory|Telepathy|Possession/],
    ['Elemental', /Fire|Ice|Water|Lightning|Electricity|Wind|Air |Earth|Elemental|Plant|Light Manipulation|Darkness|Magma|Sound/],
    ['Summoning', /Summoning|Necromancy|Creation|Duplication|Clone/],
    ['Transformation', /Transformation|Shapeshifting|Size Manipulation|Statistics Amplification/],
    ['Weapons & martial arts', /Weapon|Martial|Swordsman|Blade|Marksmanship|Acrobatics|Pressure Points/],
    ['Energy', /Energy|Aura|Ki |Chakra|Magic|Explosion|Forcefield/],
    ['Regeneration & durability', /Regeneration|Immortality|Damage Reduction|Invulnerability/],
    ['Intellect & stealth', /Genius|Stealth|Social Influencing|Information Analysis|Precognition/]
  ];
  function abilityStyle(e) {
    const list = (e.stats && e.stats.abilities) || [];
    const hits = [];
    for (const [label, re] of ABILITY_GROUPS) if (list.some(a => re.test(a + ' '))) hits.push(label);
    return hits.slice(0, 2);
  }
  /* opts: {series, power, ability, stars, role} booleans. Returns [{k,label,value}] — "not recorded" when unknown. */
  function clues(e, opts, seriesName, stars) {
    const out = [];
    if (opts.series) out.push({ k: 'series', label: 'Series', value: seriesName });
    if (opts.power) out.push({ k: 'power', label: 'Power class', value: BROAD(stars) });
    if (opts.stars) out.push({ k: 'stars', label: 'Stars', value: '★'.repeat(stars) });
    if (opts.ability) { const a = abilityStyle(e); out.push({ k: 'ability', label: 'Fighting style', value: a.length ? a.join(' · ') : 'Not recorded' }); }
    if (opts.role) out.push({ k: 'role', label: 'Role', value: (e.roles && e.roles[0]) || 'Not recorded' });
    return out;
  }

  /* ---------- fullscreen support ---------- */
  const fullscreenMode = doc => doc && doc.fullscreenEnabled && doc.documentElement && typeof doc.documentElement.requestFullscreen === 'function' ? 'native' : 'focus';

  ABC.session = { SAVE_V, UNDO_MAX, pack, unpack, pushUndo, restoreUndo, undoBlockedReason, timerNew, timerLeft, timerPause, timerResume, timerOnBid, timerExpiry,
    visibility, clues, abilityStyle, BROAD, fullscreenMode };
})(typeof window !== 'undefined' ? window : globalThis);
