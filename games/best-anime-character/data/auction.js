/* $20 Best Anime Character — auction rules. Pure state transitions + structured events; no DOM.
   Every action goes through apply(state, action, ctx) which returns a NEW state, or the old one with a reason.
   ctx.charOf(entryId) -> { charId, power }  (from the character data).
   Used by the page and by tools/test-auction.mjs. */
(function (g) {
  const ABC = g.ABC = g.ABC || {};
  const RULES = { startMoney: 20, maxRoster: 5, playerSkips: 3, masterSkips: 5, increments: [1, 2, 5] };
  const clone = s => JSON.parse(JSON.stringify(s));

  const REASONS = {
    over: 'The match is over.', stale: 'That button was for an earlier moment. Try again.',
    full: 'Team complete. No more characters for this player.', leader: 'You already hold the high bid.',
    funds: 'Not enough money for that bid.', low: 'A bid has to beat the current high bid.', amount: 'Invalid bid amount.',
    'no-bid': 'Nobody has bid yet.', 'no-skips': 'No skips left.', 'bidding-started': 'Skips only work before anyone bids.',
    'no-master': 'No master skips left.', duplicate: 'That character is already on a team.', unknown: 'Unknown action.'
  };

  function create({ names, order, mode = 'all', rules = {} }) {
    const r = Object.assign({}, RULES, rules);
    const s = {
      v: 4, mode, rules: r,
      players: names.map(n => ({ name: n, money: r.startMoney, roster: [], skips: r.playerSkips })),
      master: r.masterSkips, order: order.slice(), pos: 0, bid: { amt: 0, by: -1, seq: 0 },
      fate: {}, events: [], over: false, end: null
    };
    s.events.push({ t: 'start', mode, players: names.slice(), rules: r, size: order.length });
    if (!order.length) finish(s, 'pool-exhausted');
    else s.events.push({ t: 'reveal', round: 1, id: order[0] });
    return s;
  }

  const round = s => s.pos + 1;
  const current = s => (s.over ? null : s.order[s.pos] ?? null);
  const isFull = (s, p) => s.players[p].roster.length >= s.rules.maxRoster;
  const power = (s, p, ctx) => s.players[p].roster.reduce((t, id) => t + ctx.charOf(id).power, 0);
  const spent = (s, p) => s.players[p].roster.reduce((t, id) => t + (s.fate[id] && !s.fate[id].gift ? s.fate[id].price : 0), 0);
  const nextBid = s => s.bid.amt + 1;
  const canBuy = (s, p) => !isFull(s, p) && s.players[p].money >= nextBid(s);
  const anyBuyer = s => s.players.some((P, p) => !isFull(s, p) && P.money >= 1);

  function canBid(s, p, amt) {
    if (s.over) return 'over';
    const P = s.players[p];
    if (!Number.isInteger(amt) || amt < 1) return 'amount';
    if (isFull(s, p)) return 'full';
    if (s.bid.by === p) return 'leader';
    if (amt <= s.bid.amt) return 'low';
    if (amt > P.money) return 'funds';
    return null;
  }
  /* The bid buttons for player p: high+increment for each increment, plus all-in. */
  function bidOptions(s, p) {
    const base = s.bid.amt, money = s.players[p].money;
    const opts = s.rules.increments.map(i => ({ label: '+$' + i, amt: base + i }));
    opts.push({ label: 'All', amt: money, all: true });
    return opts.map(o => Object.assign(o, { why: canBid(s, p, o.amt) }));
  }
  /* Bidding status shown on each dashboard. */
  function status(s, p) {
    if (isFull(s, p)) return 'complete';
    if (s.over) return 'done';
    if (s.bid.by === p) return 'leading';
    const bidThisRound = s.events.some(e => e.t === 'bid' && e.round === round(s) && e.p === p);
    if (s.players[p].money < nextBid(s)) return 'cant-afford';
    return bidThisRound ? 'outbid' : 'can-bid';
  }
  function skipWhy(s, p) {
    if (s.over) return 'over';
    if (s.players[p].skips < 1) return 'no-skips';
    if (s.bid.by >= 0) return 'bidding-started';
    return null;
  }
  const giftWhy = (s, p) => s.over ? 'over' : isFull(s, p) ? 'full' : null;
  const sellWhy = s => s.over ? 'over' : s.bid.by < 0 ? 'no-bid' : null;
  const mskipWhy = s => s.over ? 'over' : s.master < 1 ? 'no-master' : null;

  /* End the match. Only a character that was already revealed and left unresolved is recorded as unsold;
     the next, never-revealed character stays hidden. */
  function finish(s, reason) {
    const id = s.order[s.pos];
    const revealed = id != null && s.events.some(e => e.t === 'reveal' && e.id === id);
    if (revealed && !s.fate[id]) { s.fate[id] = { unsold: true }; s.events.push({ t: 'unsold', round: round(s), id, reason }); }
    s.over = true; s.end = reason; s.bid = { amt: 0, by: -1, seq: s.bid.seq };
    s.events.push({ t: 'end', round: round(s), reason });
  }
  function advance(s) {
    s.bid = { amt: 0, by: -1, seq: s.bid.seq + 1 };          // no stale bid survives a round
    s.pos++;
    if (s.players.every((P, p) => isFull(s, p))) return finish(s, 'teams-complete');
    if (s.pos >= s.order.length) return finish(s, 'pool-exhausted');
    if (!anyBuyer(s)) return finish(s, 'no-buyers');         // nobody left who can afford a $1 bid
    s.events.push({ t: 'reveal', round: round(s), id: s.order[s.pos] });
  }
  function assign(s, p, id, ctx) {
    const cid = ctx.charOf(id).charId;
    for (const P of s.players) for (const x of P.roster) if (x === id || ctx.charOf(x).charId === cid) return 'duplicate';
    if (isFull(s, p)) return 'full';
    s.players[p].roster.push(id);
    return null;
  }

  /* action: {type:'bid',p,amt} | {type:'sell',seq} | {type:'gift',p} | {type:'pskip',p} | {type:'mskip'}
     Optional action.round / action.seq guard against stale clicks. */
  function apply(state, a, ctx) {
    const fail = reason => ({ ok: false, reason, message: REASONS[reason] || reason, state });
    if (state.over) return fail('over');
    if (a.round != null && a.round !== round(state)) return fail('stale');
    if (a.seq != null && a.seq !== state.bid.seq) return fail('stale');
    const s = clone(state), id = current(s), r = round(s);
    let why;
    switch (a.type) {
      case 'bid': {
        if ((why = canBid(s, a.p, a.amt))) return fail(why);
        const prev = s.bid.by;
        s.bid = { amt: a.amt, by: a.p, seq: s.bid.seq + 1 };
        s.events.push({ t: 'bid', round: r, id, p: a.p, amt: a.amt, prev });
        break;
      }
      case 'sell': {
        if ((why = sellWhy(s))) return fail(why);
        const p = s.bid.by, price = s.bid.amt, P = s.players[p];
        if (price > P.money) return fail('funds');               // cannot happen via canBid; guards negative balances
        if ((why = assign(s, p, id, ctx))) return fail(why);
        P.money -= price;
        s.fate[id] = { p, price };
        s.events.push({ t: 'sold', round: r, id, p, price, power: ctx.charOf(id).power });
        advance(s); break;
      }
      case 'gift': {
        if ((why = giftWhy(s, a.p))) return fail(why);
        if ((why = assign(s, a.p, id, ctx))) return fail(why);
        const voided = s.bid.by >= 0 ? { p: s.bid.by, amt: s.bid.amt } : null;
        s.fate[id] = { p: a.p, price: 0, gift: true };
        s.events.push({ t: 'gift', round: r, id, p: a.p, power: ctx.charOf(id).power, voided });
        advance(s); break;
      }
      case 'pskip': {
        if ((why = skipWhy(s, a.p))) return fail(why);
        s.players[a.p].skips--;
        s.fate[id] = { skip: 'p' + a.p };
        s.events.push({ t: 'skip', round: r, id, kind: 'player', p: a.p });
        advance(s); break;
      }
      case 'mskip': {
        if ((why = mskipWhy(s))) return fail(why);
        const voided = s.bid.by >= 0 ? { p: s.bid.by, amt: s.bid.amt } : null;
        s.master--;
        s.fate[id] = { skip: 'host' };
        s.events.push({ t: 'skip', round: r, id, kind: 'master', voided });
        advance(s); break;
      }
      default: return fail('unknown');
    }
    return { ok: true, state: s, events: s.events.slice(state.events.length) };
  }

  /* Winner (unchanged rule): total power, then best single character, then money left. -1 = dead even. */
  function rank(s, ctx) {
    const k = p => [power(s, p, ctx), Math.max(0, ...s.players[p].roster.map(id => ctx.charOf(id).power)), s.players[p].money];
    const a = k(0), b = k(1);
    for (let i = 0; i < 3; i++) { if (a[i] > b[i]) return 0; if (b[i] > a[i]) return 1; }
    return -1;
  }
  /* Rounds for the history view: only rounds already revealed. */
  function rounds(s) {
    const out = new Map();
    for (const e of s.events) {
      if (e.round == null || e.t === 'end') continue;
      if (!out.has(e.round)) out.set(e.round, { round: e.round, id: e.id, bids: [], result: null });
      const R = out.get(e.round);
      if (e.t === 'bid') R.bids.push({ p: e.p, amt: e.amt });
      else if (['sold', 'gift', 'skip', 'unsold'].includes(e.t)) R.result = e;
    }
    return [...out.values()];
  }

  ABC.auction = { RULES, REASONS, create, apply, current, round, isFull, power, spent, nextBid, canBid, canBuy, bidOptions, status,
    skipWhy, giftWhy, sellWhy, mskipWhy, rank, rounds };
})(typeof window !== 'undefined' ? window : globalThis);
