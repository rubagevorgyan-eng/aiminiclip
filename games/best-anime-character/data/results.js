/* $20 Anime Battle — end-of-match results. Pure (no DOM).
   summarize() turns a finished match state into a self-contained summary: every character's name, series, form,
   stars, power and VS tier are copied in, so stored results never change when the database is updated later.
   Winner = the existing rule (auction.rank): total power, then strongest single character, then money left; equal on
   all three = draw. Awards and statistics are presentation only and never affect the winner. */
(function (g) {
  const ABC = g.ABC = g.ABC || {};
  const HISTORY_V = 1, HISTORY_MAX = 50, HIGH_TIER_MIN = 6;   // "legendary team" counts 6★ and 7★

  /* info(id) -> {charId,name,series,seriesName,form,star,rarity,power,tier,img,medium,anime} using the match snapshot */
  function summarize(state, info, { modeLabel = '', now = Date.now() } = {}) {
    const A = ABC.auction, ctx = { charOf: id => ({ charId: info(id).charId, power: info(id).power }) };
    const P = state.players, fate = state.fate, ev = state.events;
    const card = id => { const c = info(id), f = fate[id] || {}; return Object.assign({ id }, c, { price: f.gift ? 0 : (f.price || 0), gift: !!f.gift, round: roundOf(ev, id) }); };
    const players = P.map((pl, p) => {
      const roster = pl.roster.map(card).sort((a, b) => b.power - a.power || a.round - b.round);
      const bought = roster.filter(c => !c.gift), gifts = roster.filter(c => c.gift);
      const spent = bought.reduce((t, c) => t + c.price, 0);
      return { name: pl.name, power: roster.reduce((t, c) => t + c.power, 0), balance: pl.money, spent, roster,
        purchased: bought.length, gifted: gifts.length, skipsUsed: state.rules.playerSkips - pl.skips, skipsLeft: pl.skips,
        bids: ev.filter(e => e.t === 'bid' && e.p === p).length, wins: ev.filter(e => e.t === 'sold' && e.p === p).length };
    });
    const w = A.rank(state, ctx);
    const rounds = A.rounds(state).map(r => ({ round: r.round, id: r.id, char: info(r.id), bids: r.bids.slice(),
      result: r.result ? { t: r.result.t, p: r.result.p, price: r.result.price, kind: r.result.kind, voided: r.result.voided || null } : null }));
    const s = {
      v: HISTORY_V, id: state.matchId || ('m' + (state.setup && state.setup.seed || 0).toString(36) + '-' + now.toString(36)),
      date: new Date(now).toISOString(), mode: state.setup && state.setup.mode || 'classic', modeLabel,
      config: state.setup ? { budget: state.rules.startMoney, team: state.rules.maxRoster, skips: state.rules.playerSkips, master: state.rules.masterSkips,
        eligibility: state.setup.eligibility, info: state.setup.info || 'open', minStar: state.setup.minStar, maxStar: state.setup.maxStar,
        version: state.setup.version, series: state.setup.series } : null,
      end: state.end, winner: w, draw: w < 0, players,
      tiebreak: players[0].power === players[1].power ? (w < 0 ? 'draw' : 'tiebreak') : null,
      diff: Math.abs(players[0].power - players[1].power),
      totals: { revealed: ev.filter(e => e.t === 'reveal').length, auctions: ev.filter(e => e.t === 'sold').length,
        bids: ev.filter(e => e.t === 'bid').length, gifts: ev.filter(e => e.t === 'gift').length,
        playerSkips: ev.filter(e => e.t === 'skip' && e.kind === 'player').length,
        masterSkipsUsed: state.rules.masterSkips - state.master, masterSkipsLeft: state.master, unsold: ev.filter(e => e.t === 'unsold').length },
      rounds
    };
    s.awards = awards(s);
    s.stats = stats(s);
    return s;
  }
  const roundOf = (ev, id) => { const e = ev.find(x => x.t === 'reveal' && x.id === id); return e ? e.round : 0; };

  /* ties: every tied holder is listed (no hidden tiebreak) */
  function best(items, score) {
    let top = -Infinity, out = [];
    for (const it of items) { const v = score(it); if (!(v > -Infinity) || Number.isNaN(v)) continue; if (v > top) { top = v; out = [it]; } else if (v === top) out.push(it); }
    return out.length ? { value: top, items: out } : null;
  }
  function awards(s) {
    const all = s.players.flatMap((P, p) => P.roster.map(c => Object.assign({ p }, c)));
    const bought = all.filter(c => !c.gift && c.price > 0), gifts = all.filter(c => c.gift);
    const out = [];
    const add = (key, title, b, fmt) => { if (b) out.push({ key, title, value: b.value, tie: b.items.length > 1, items: b.items.map(fmt) }); };
    const ch = c => ({ kind: 'char', p: c.p, id: c.id, name: c.name, power: c.power, price: c.price, gift: c.gift });
    add('mvp', 'Match MVP', best(all, c => c.power), ch);
    add('bargain', 'Best Bargain', best(bought, c => c.power / c.price), ch);
    add('expensive', 'Most Expensive Purchase', best(bought, c => c.price), ch);
    add('efficient', 'Most Efficient Bidder', best(s.players.map((P, p) => ({ p, P })).filter(x => x.P.spent > 0),
      x => x.P.roster.filter(c => !c.gift).reduce((t, c) => t + c.power, 0) / x.P.spent), x => ({ kind: 'player', p: x.p, name: x.P.name }));
    add('war', 'Biggest Bidding War', best(s.rounds.filter(r => r.result && r.result.t === 'sold' && r.bids.length > 1), r => r.bids.length),
      r => ({ kind: 'round', p: r.result.p, round: r.round, id: r.id, name: r.char.name, bids: r.bids.length, price: r.result.price }));
    const legendary = s.players.map((P, p) => ({ p, P, n: P.roster.filter(c => c.star >= HIGH_TIER_MIN).length })).filter(x => x.n > 0);
    add('legendary', 'Most Legendary Team', best(legendary, x => x.n), x => ({ kind: 'player', p: x.p, name: x.P.name, n: x.n }));
    add('gift', 'Best Gift', best(gifts, c => c.power), ch);
    return out;
  }
  function stats(s) {
    return s.players.map(P => {
      const bought = P.roster.filter(c => !c.gift), gifts = P.roster.filter(c => c.gift);
      const stars = [1, 2, 3, 4, 5, 6, 7].map(n => P.roster.filter(c => c.star === n).length);
      const series = {}; P.roster.forEach(c => { series[c.seriesName] = (series[c.seriesName] || 0) + 1; });
      const pw = P.roster.map(c => c.power);
      const boughtPower = bought.reduce((t, c) => t + c.power, 0);
      return { powers: pw, min: pw.length ? Math.min(...pw) : null, max: pw.length ? Math.max(...pw) : null,
        avg: pw.length ? Math.round(10 * pw.reduce((a, b) => a + b, 0) / pw.length) / 10 : null, stars, series,
        spent: P.spent, avgPrice: bought.length ? Math.round(10 * P.spent / bought.length) / 10 : null,
        powerPerDollar: P.spent > 0 ? Math.round(100 * boughtPower / P.spent) / 100 : null,
        giftedPower: gifts.reduce((t, c) => t + c.power, 0),
        highest: bought.length ? bought.slice().sort((a, b) => b.price - a.price)[0] : null,
        bids: P.bids, wins: P.wins, skipsUsed: P.skipsUsed, skipsLeft: P.skipsLeft };
    });
  }
  /* proportion bar; zero combined power -> even split */
  const share = (a, b) => (a + b > 0 ? a / (a + b) : 0.5);

  /* history filters over summary rounds */
  function filterRounds(rounds, f) {
    if (f === 'p0' || f === 'p1') { const p = +f[1]; return rounds.filter(r => r.bids.some(b => b.p === p) || (r.result && r.result.p === p)); }
    if (f === 'buy') return rounds.filter(r => r.result && r.result.t === 'sold');
    if (f === 'gift') return rounds.filter(r => r.result && r.result.t === 'gift');
    if (f === 'skip') return rounds.filter(r => r.result && (r.result.t === 'skip' || r.result.t === 'unsold'));
    return rounds;
  }

  /* bounded local history (newest first; same match id replaces the old entry, e.g. after undo + finish) */
  function addToHistory(list, summary, max = HISTORY_MAX) {
    return [summary, ...(Array.isArray(list) ? list : []).filter(m => m && m.id !== summary.id)].slice(0, max);
  }
  function readHistory(raw) {
    try { const d = typeof raw === 'string' ? JSON.parse(raw) : raw; return d && d.v === HISTORY_V && Array.isArray(d.matches) ? d.matches.filter(m => m && m.v === HISTORY_V && Array.isArray(m.players)) : []; }
    catch (e) { return []; }
  }
  const writeHistory = list => JSON.stringify({ v: HISTORY_V, matches: list });

  ABC.results = { HISTORY_V, HISTORY_MAX, HIGH_TIER_MIN, summarize, awards, stats, share, filterRounds, addToHistory, readHistory, writeHistory };
})(typeof window !== 'undefined' ? window : globalThis);
