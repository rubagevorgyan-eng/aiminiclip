/**
 * Multi-client integration test against a running room server (real Worker + Durable Objects via
 * `npm run server:test`, which sets a 3 s disconnect grace). Every bot is an independent WebSocket
 * client with its own session. Every message any bot receives is scanned for secret leaks.
 *
 *   npm run server:test        (separate terminal / launch config "cipher-server-test")
 *   npm run test:live
 */
import assert from 'node:assert/strict';
import { canRead } from '../src/engine/chatRules.ts';
import type { ClientView, CompetitiveIdentity, PlayerId, TeamId } from '../src/shared/types.ts';

const HTTP = process.env.CIPHER_TEST_SERVER ?? 'http://localhost:8788';
const WS = HTTP.replace(/^http/, 'ws');
const ORIGIN = 'http://localhost:5175';
const GRACE_MS = 3000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: { name: string; ok: boolean; detail?: string }[] = [];
const allTokens = new Set<string>();
let leakChecks = 0;

// ---------- Bot ----------
class Bot {
  ws!: WebSocket;
  view: ClientView | null = null;
  errors: { code: string; message: string }[] = [];
  closed: { code: number; reason: string } | null = null;
  playerId: PlayerId | null = null;
  token: string | null = null;
  received = 0;
  readonly name: string;
  readonly code: string;
  constructor(name: string, code: string) {
    this.name = name;
    this.code = code;
  }

  connect(session?: { playerId: string; token: string }): Promise<void> {
    this.closed = null;
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${WS}/rooms/${this.code}/ws`, { headers: { Origin: ORIGIN } } as unknown as string[]);
      const timer = setTimeout(() => reject(new Error(`${this.name}: no welcome`)), 5000);
      this.ws.addEventListener('open', () => this.ws.send(JSON.stringify({ t: 'hello', v: 1, room: this.code, name: this.name, ...(session ? { session } : {}) })));
      this.ws.addEventListener('message', (e) => {
        const raw = String(e.data);
        const m = JSON.parse(raw);
        this.received++;
        scanForLeaks(this, raw, m);
        if (m.t === 'welcome') {
          this.playerId = m.playerId;
          this.token = m.token;
          allTokens.add(m.token);
          this.view = m.view;
          clearTimeout(timer);
          resolve();
        } else if (m.t === 'view') this.view = m.view;
        else if (m.t === 'error') this.errors.push({ code: m.code, message: m.message });
      });
      this.ws.addEventListener('close', (e) => {
        this.closed = { code: e.code, reason: e.reason };
        clearTimeout(timer);
        if (!this.playerId) reject(Object.assign(new Error(`${this.name}: closed ${e.code} ${e.reason}`), { closeCode: e.code }));
      });
    });
  }
  send(m: Record<string, unknown>) {
    this.ws.send(JSON.stringify(m));
  }
  act(m: Record<string, unknown>) {
    const match = this.view!.match!;
    this.send({ ...m, match: match.id, rev: match.revision });
  }
  me() {
    return this.view!.room.players.find((p) => p.id === this.playerId)!;
  }
  async until(pred: (v: ClientView) => boolean, what: string, ms = 4000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (this.view && pred(this.view)) return;
      await sleep(25);
    }
    throw new Error(`${this.name}: timed out waiting for ${what}`);
  }
  async error(code: string, ms = 2000) {
    const start = this.errors.length;
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (this.errors.slice(start).some((e) => e.code === code)) return;
      await sleep(25);
    }
    throw new Error(`${this.name}: expected error ${code}, got ${JSON.stringify(this.errors.slice(-3))}`);
  }
  disconnect() {
    this.ws.close(4000, 'test drop');
  }
}

/** Secrets must never reach anyone who is not entitled to them. */
function scanForLeaks(bot: Bot, raw: string, m: { t: string; view?: ClientView }) {
  leakChecks++;
  // The board seed is a string; revealed cards carry a numeric portrait seed, which is public by design.
  assert.ok(!/"seed"\s*:\s*"/.test(raw), `${bot.name} received the board seed`);
  if (m.view?.match) for (const c of m.view.match.cards) if (!c.reveal) assert.ok(!('portrait' in c), 'no portrait on hidden cards');
  assert.ok(!raw.includes('"sessions"'), `${bot.name} received session records`);
  assert.ok(!raw.includes('"portraits"') && !raw.includes('"reveals"'), `${bot.name} received private match fields`);
  for (const t of allTokens) if (t !== bot.token && m.t !== 'welcome') assert.ok(!raw.includes(t), `${bot.name} received another player's token`);
  const v = m.view;
  if (!v) return;
  const me = v.room.players.find((p) => p.id === v.you);
  const completed = v.match?.phase === 'completed';
  if (v.key?.kind === 'competitive') assert.equal(me?.role, 'handler', `${bot.name} (${me?.role}) received the key`);
  if (v.key?.kind === 'cooperative') assert.ok(me?.role !== 'spectator' && me?.side === v.key.side, `${bot.name} received a Duet key that is not theirs`);
  if (!completed) assert.ok(!raw.includes('"sides"'), `${bot.name} received both Duet keys during play`);
  if (v.match?.declassified) assert.ok(completed, `${bot.name} received the declassified key before the end`);
  if (v.match) for (const c of v.match.cards) if (c.reveal) assert.ok(c.reveal.identity, 'revealed cards carry identity');
  // Chat isolation: every message delivered must be readable by this viewer.
  for (const c of v.room.chat) assert.ok(canRead(c.channel, me ?? null), `${bot.name} received ${c.channel} chat`);
  if (!completed && me?.role !== 'handler' && !(me?.side && me.role !== 'spectator')) assert.ok(!raw.includes('"identities"'), `${bot.name} saw identities`);
}

async function createRoom(name: string, mode = 'classic') {
  const res = await fetch(`${HTTP}/rooms`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mode }) });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { code: string; playerId: string; token: string };
  allTokens.add(body.token);
  const host = new Bot(name, body.code);
  await host.connect({ playerId: body.playerId, token: body.token });
  return host;
}

/** Room with Ada (host, crimson handler), Ben+Cleo (crimson ops), Dmitri (cobalt handler), Esme (cobalt op), Gus (observer). */
async function seatedRoom() {
  const ada = await createRoom('Ada');
  const [ben, cleo, dmitri, esme, gus] = ['Ben', 'Cleo', 'Dmitri', 'Esme', 'Gus'].map((n) => new Bot(n, ada.code));
  for (const b of [ben, cleo, dmitri, esme, gus]) await b.connect();
  ada.send({ t: 'seat', role: 'handler', team: 'crimson' });
  ben.send({ t: 'seat', role: 'operative', team: 'crimson' });
  cleo.send({ t: 'seat', role: 'operative', team: 'crimson' });
  dmitri.send({ t: 'seat', role: 'handler', team: 'cobalt' });
  esme.send({ t: 'seat', role: 'operative', team: 'cobalt' });
  await ada.until((v) => v.room.players.filter((p) => p.role !== 'spectator').length === 5, 'seats');
  return { ada, ben, cleo, dmitri, esme, gus, all: [ada, ben, cleo, dmitri, esme, gus] };
}

async function startMatch(r: Awaited<ReturnType<typeof seatedRoom>>) {
  r.ada.send({ t: 'settings', startingTeam: 'crimson' });
  await r.ada.until((v) => v.room.settings.startingTeam === 'crimson', 'setting');
  r.ada.send({ t: 'start' });
  for (const b of r.all) await b.until((v) => !!v.match, 'match start');
}

const handlerKey = (b: Bot) => (b.view!.key as { identities: CompetitiveIdentity[] }).identities;
const hiddenOf = (key: CompetitiveIdentity[], v: ClientView, id: CompetitiveIdentity) => key.map((x, i) => (x === id && !v.match!.cards[i].reveal ? i : -1)).filter((i) => i >= 0);

async function run(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`✔ ${name}`);
  } catch (err) {
    results.push({ name, ok: false, detail: (err as Error).message });
    console.log(`✖ ${name}\n   ${(err as Error).message}`);
  }
}

// ---------- Scenarios ----------
await run('room creation, invite join, projections per role', async () => {
  const r = await seatedRoom();
  await startMatch(r);
  assert.equal(r.ada.view!.key?.kind, 'competitive');
  assert.equal(r.dmitri.view!.key?.kind, 'competitive');
  for (const b of [r.ben, r.cleo, r.esme, r.gus]) assert.equal(b.view!.key, null, `${b.name} has no key`);
  assert.equal(r.gus.me().role, 'spectator');
  assert.equal(new Set(r.all.map((b) => b.playerId)).size, 6, 'six distinct players');
});

await run('unauthorized actions are rejected (roles come from the server, not the client)', async () => {
  const r = await seatedRoom();
  await startMatch(r);
  r.ben.act({ t: 'clue', word: 'ORBIT', count: 1, role: 'handler' }); // claimed role ignored
  await r.ben.error('not_allowed');
  r.dmitri.act({ t: 'clue', word: 'ORBIT', count: 1 });
  await r.dmitri.error('not_your_turn');
  r.gus.act({ t: 'confirm', card: 0 });
  await r.gus.error('wrong_phase');
  r.ben.send({ t: 'kick', player: r.ada.playerId });
  await r.ben.error('not_allowed');
  r.esme.send({ t: 'settings', mode: 'custom' });
  await r.esme.error('not_allowed');
  r.ben.send({ t: 'seat', role: 'operative', team: 'cobalt' });
  await r.ben.error('not_allowed');
  assert.ok(r.all.every((b) => b.view!.match!.revision === 0), 'nothing changed');
});

await run('impersonation: a room code or name is not enough to take a seat', async () => {
  const r = await seatedRoom();
  const fake = new Bot('Ada', r.ada.code);
  await fake.connect({ playerId: r.ada.playerId!, token: 'x'.repeat(32) });
  assert.notEqual(fake.playerId, r.ada.playerId, 'wrong token joins as a new guest');
  assert.equal(fake.me().role, 'spectator');
  assert.notEqual(fake.me().name, 'Ada', 'duplicate names are disambiguated');
  assert.equal(r.ada.view!.room.host.hostId, r.ada.playerId);
});

await run('simultaneous guesses: exactly one card is revealed', async () => {
  const r = await seatedRoom();
  await startMatch(r);
  r.ada.act({ t: 'clue', word: 'ORBIT', count: 2 });
  await r.ben.until((v) => v.match!.phase === 'guessing', 'guessing');
  const key = handlerKey(r.ada);
  const [a, b] = hiddenOf(key, r.ada.view!, 'crimson');
  const rev = r.ben.view!.match!.revision;
  const id = r.ben.view!.match!.id;
  r.ben.send({ t: 'confirm', card: a, match: id, rev });
  r.cleo.send({ t: 'confirm', card: b, match: id, rev });
  await sleep(500);
  const revealed = r.ada.view!.match!.cards.filter((c) => c.reveal).length;
  assert.equal(revealed, 1, `revealed ${revealed}`);
  assert.equal(r.ada.view!.match!.revision, rev + 1);
  assert.ok([...r.ben.errors, ...r.cleo.errors].some((e) => e.code === 'stale'), 'the loser was told it was stale');
});

await run('duplicate action ids are applied once', async () => {
  const r = await seatedRoom();
  await startMatch(r);
  r.ada.act({ t: 'clue', word: 'ORBIT', count: 2 });
  await r.ben.until((v) => v.match!.phase === 'guessing', 'guessing');
  const m = r.ben.view!.match!;
  const msg = JSON.stringify({ t: 'suggest', card: 3, on: true, match: m.id, rev: m.revision, aid: 'dup-1' });
  r.ben.ws.send(msg);
  r.ben.ws.send(msg);
  await sleep(400);
  assert.equal(r.ben.view!.match!.revision, m.revision + 1, 'applied once');
  assert.equal(r.ben.view!.match!.suggestions.filter((s) => s.by === r.ben.playerId).length, 1);
});

await run('refresh / reconnect restores the seat and authoritative state', async () => {
  const r = await seatedRoom();
  await startMatch(r);
  r.ada.act({ t: 'clue', word: 'ORBIT', count: 2 });
  await r.ben.until((v) => v.match!.phase === 'guessing', 'guessing');
  const session = { playerId: r.ben.playerId!, token: r.ben.token! };
  const rev = r.ben.view!.match!.revision;
  r.ben.disconnect();
  await r.ada.until((v) => !v.room.players.find((p) => p.id === session.playerId)!.connected, 'Ben away');
  const again = new Bot('Ben', r.ada.code);
  await again.connect(session);
  assert.equal(again.playerId, session.playerId);
  assert.equal(again.me().role, 'operative');
  assert.equal(again.me().team, 'crimson');
  assert.equal(again.view!.match!.revision, rev);
  assert.equal(again.view!.key, null);
  await r.ada.until((v) => v.room.players.find((p) => p.id === session.playerId)!.connected, 'Ben back');
});

await run('stale and previous-match actions are rejected; rematch keeps the room code', async () => {
  const r = await seatedRoom();
  await startMatch(r);
  const first = r.ben.view!.match!;
  r.ada.act({ t: 'clue', word: 'ORBIT', count: 1 });
  await r.ben.until((v) => v.match!.phase === 'guessing', 'guessing');
  r.ben.send({ t: 'confirm', card: 0, match: first.id, rev: first.revision });
  await r.ben.error('stale');
  // End the match fast: Ben reveals the mole.
  const mole = handlerKey(r.ada).indexOf('mole');
  r.ben.act({ t: 'confirm', card: mole });
  for (const b of r.all) await b.until((v) => v.match!.phase === 'completed', 'completed');
  assert.ok(r.ben.view!.match!.declassified, 'declassified after the end');
  r.ben.act({ t: 'confirm', card: 1 });
  await r.ben.error('match_over');
  r.ben.send({ t: 'rematch' });
  await r.ben.error('not_allowed');
  r.ada.send({ t: 'rematch' });
  await r.ben.until((v) => v.match!.id !== first.id, 'rematch');
  assert.equal(r.ben.view!.room.code, r.ada.code);
  assert.equal(r.ben.view!.key, null, 'operative still has no key in the rematch');
  r.ben.send({ t: 'confirm', card: 1, match: first.id, rev: 0 });
  await r.ben.error('wrong_match');
  const words1 = new Set(first.cards.map((c) => c.word));
  const overlap = r.ben.view!.match!.cards.filter((c) => words1.has(c.word)).length;
  assert.equal(overlap, 0, 'rematch avoids the previous board');
});

await run('complete Classic match between independent clients', async () => {
  const r = await seatedRoom();
  await startMatch(r);
  const handlers: Record<TeamId, Bot> = { crimson: r.ada, cobalt: r.dmitri };
  const ops: Record<TeamId, Bot> = { crimson: r.ben, cobalt: r.esme };
  let i = 0;
  while (r.ada.view!.match!.phase !== 'completed' && i++ < 40) {
    const m = r.ada.view!.match!;
    const team = (m.turn!.owner as { team: TeamId }).team;
    if (m.phase === 'awaiting_clue') {
      handlers[team].act({ t: 'clue', word: `CODE${i}`.replace(/\d/g, (d) => 'ABCDEFGHIJ'[+d]), count: null });
      await r.ada.until((v) => v.match!.revision > m.revision, 'clue');
      continue;
    }
    // Operatives guess two of their own agents (known here only because the test reads its handler's view), then a civilian.
    const key = handlerKey(handlers[team]);
    const own = hiddenOf(key, r.ada.view!, team);
    const civ = hiddenOf(key, r.ada.view!, 'civilian');
    const target = i % 3 === 0 && civ.length ? civ[0] : own[0];
    ops[team].act({ t: 'confirm', card: target });
    await r.ada.until((v) => v.match!.revision > m.revision, 'guess');
  }
  const done = r.ada.view!.match!;
  assert.equal(done.phase, 'completed');
  assert.equal(done.result!.reason, 'all_agents_found');
  const winner = (done.result!.outcome as { team: TeamId }).team;
  assert.equal(done.remaining[winner], 0);
  for (const b of r.all) assert.equal(b.view!.match!.result!.outcome.kind, 'team_win');
  assert.ok(done.result!.stats.teams.crimson!.guesses > 0);
});

await run('mid-match newcomers spectate and cannot grab an occupied seat', async () => {
  const r = await seatedRoom();
  await startMatch(r);
  const late = new Bot('Late', r.ada.code);
  await late.connect();
  assert.equal(late.me().role, 'spectator');
  assert.equal(late.view!.key, null);
  late.send({ t: 'seat', role: 'operative', team: 'crimson' });
  await late.error('not_allowed');
  late.send({ t: 'seat', role: 'handler', team: 'crimson' });
  await late.error('not_allowed');
});

await run('spectators off: mid-match newcomers are turned away', async () => {
  const r = await seatedRoom();
  r.gus.send({ t: 'leave' });
  await r.ada.until((v) => v.room.players.length === 5, 'gus left');
  r.ada.send({ t: 'settings', spectatorsAllowed: false });
  await r.ada.until((v) => !v.room.settings.spectatorsAllowed, 'spectators off');
  await startMatch({ ...r, all: [r.ada, r.ben, r.cleo, r.dmitri, r.esme] });
  const late = new Bot('Late', r.ada.code);
  await assert.rejects(late.connect(), (e: Error & { closeCode?: number }) => e.closeCode === 4402);
});

await run('required role leaves: auto-pause, fair replacement, resume; returning handler cannot guess', async () => {
  const r = await seatedRoom();
  await startMatch(r);
  const adaSession = { playerId: r.ada.playerId!, token: r.ada.token! };
  r.ada.disconnect();
  await r.ben.until((v) => v.match!.phase === 'paused' && !!v.room.pauseReason, 'auto-pause', GRACE_MS + 4000);
  assert.match(r.ben.view!.room.pauseReason!, /Crimson Bureau needs a handler/);
  r.ben.act({ t: 'confirm', card: 0 });
  await r.ben.error('wrong_phase');
  r.esme.send({ t: 'seat', role: 'handler', team: 'crimson' });
  await r.esme.error('not_allowed'); // no switching bureaus
  r.ben.send({ t: 'seat', role: 'handler', team: 'crimson' });
  await r.ben.until((v) => v.match!.phase !== 'paused', 'resume');
  assert.equal(r.ben.view!.key?.kind, 'competitive', 'new handler now holds the key');
  const back = new Bot('Ada', r.ada.code);
  await back.connect(adaSession);
  assert.equal(back.me().role, 'spectator', 'replaced handler returns as observer');
  assert.equal(back.view!.key, null);
  back.send({ t: 'seat', role: 'operative', team: 'crimson' });
  await back.error('not_allowed'); // has seen the key
});

await run('host migration after the disconnect grace', async () => {
  const r = await seatedRoom();
  r.ada.disconnect();
  await r.ben.until((v) => v.room.host.hostId !== r.ada.playerId, 'new host', GRACE_MS + 4000);
  assert.equal(r.ben.view!.room.host.hostId, r.ben.playerId, 'longest-seated connected player');
  r.ben.send({ t: 'settings', mode: 'custom' });
  await r.ben.until((v) => v.room.settings.mode === 'custom', 'new host can change settings');
});

await run('input limits: malformed, oversized, flooding', async () => {
  const ada = await createRoom('Ada');
  ada.ws.send('{not json');
  await ada.error('invalid');
  ada.send({ t: 'seat', role: 'overlord', team: 'crimson' });
  await ada.error('invalid');
  for (let k = 0; k < 40; k++) ada.send({ t: 'rename', name: `Ada${k % 3}` });
  await ada.error('rate_limited');
  ada.ws.send(JSON.stringify({ t: 'chat', text: 'x'.repeat(20_000) })); // over the 16 KB cap
  await sleep(500);
  assert.equal(ada.closed?.code, 1009, 'oversized message closes the socket');
});

await run('unknown room codes and foreign origins are refused', async () => {
  const ghost = new Bot('Ghost', 'ZZZZZ');
  await assert.rejects(ghost.connect(), (e: Error & { closeCode?: number }) => e.closeCode === 4404);
  const res = await fetch(`${HTTP}/rooms`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{"name":"x"}' });
  assert.equal(res.status, 403);
});

await run('Duet: private keys per partner, judged by the clue-giver, played to victory', async () => {
  const a = await createRoom('PartnerA', 'duet');
  const b = new Bot('PartnerB', a.code);
  const watcher = new Bot('Watcher', a.code);
  await b.connect();
  await watcher.connect();
  a.send({ t: 'seat', role: 'operative', side: 'north' });
  b.send({ t: 'seat', role: 'operative', side: 'south' });
  await a.until((v) => v.room.players.filter((p) => p.side).length === 2, 'partners seated');
  a.send({ t: 'start' });
  for (const x of [a, b, watcher]) await x.until((v) => !!v.match, 'duet start');
  const ka = a.view!.key as { kind: 'cooperative'; side: string; identities: string[] };
  const kb = b.view!.key as { kind: 'cooperative'; side: string; identities: string[] };
  assert.equal(ka.side, 'north');
  assert.equal(kb.side, 'south');
  assert.equal(watcher.view!.key, null);
  assert.equal(ka.identities.filter((x) => x === 'agent').length, 9);
  assert.equal(ka.identities.filter((x, i) => x === 'agent' && kb.identities[i] === 'agent').length, 3);
  const keys: Record<string, string[]> = { north: ka.identities, south: kb.identities };
  const bots: Record<string, Bot> = { north: a, south: b };
  let n = 0;
  while (a.view!.match!.phase !== 'completed' && n++ < 60) {
    const m = a.view!.match!;
    const giver = (m.turn!.owner as { side: string }).side;
    const guesser = giver === 'north' ? 'south' : 'north';
    if (m.phase === 'awaiting_clue') {
      bots[giver].act({ t: 'clue', word: 'ORBIT', count: null });
    } else {
      // The guessing partner reads the giver's key here only because this is a test harness.
      const card = keys[giver].findIndex((x, i) => x === 'agent' && !m.cards[i].reveal);
      if (card < 0) bots[guesser].act({ t: 'end_turn' });
      else bots[guesser].act({ t: 'confirm', card });
    }
    await a.until((v) => v.match!.revision > m.revision, 'duet progress');
  }
  const done = a.view!.match!;
  assert.equal(done.phase, 'completed');
  assert.deepEqual(done.result!.outcome, { kind: 'cooperative_win' });
  assert.equal(done.result!.stats.cooperative!.agentsFound, 15);
  assert.ok(watcher.view!.match!.declassified, 'keys declassified to everyone only at the end');
});

async function customRoom(settings: Record<string, unknown>) {
  const r = await seatedRoom();
  r.ada.send({ t: 'settings', mode: 'custom', ...settings });
  await r.ada.until((v) => v.room.settings.mode === 'custom', 'custom mode');
  await sleep(150);
  return r;
}

await run('Custom: every board size 5×5–10×10 starts with the right composition', async () => {
  for (const size of [5, 6, 7, 8, 9, 10]) {
    const r = await customRoom({ boardSize: size, moles: 2 });
    await r.ada.until((v) => v.room.settings.boardSize === size, 'size');
    r.ada.send({ t: 'start' });
    await r.ben.until((v) => !!v.match, `start ${size}`);
    assert.equal(r.ben.view!.match!.cards.length, size * size);
    assert.equal(r.ben.view!.key, null);
    const key = handlerKey(r.ada);
    assert.equal(key.filter((x) => x === 'mole').length, 2);
    const second = Math.floor(((size * size - 2) * 35) / 100);
    const counts = [r.ada.view!.match!.startingTeam!, r.ada.view!.match!.startingTeam === 'crimson' ? 'cobalt' : 'crimson'].map((t) => key.filter((x) => x === t).length);
    assert.deepEqual(counts, [second + 1, second], `${size}×${size}`);
    for (const b of r.all) b.ws.close();
  }
});

await run('Custom: invalid settings rejected or reported; non-host blocked; locked during play', async () => {
  const r = await customRoom({ boardSize: 6 });
  r.ada.send({ t: 'settings', moles: 7 });
  await r.ada.error('invalid');
  r.ada.send({ t: 'settings', duetTokens: 15 });
  await r.ada.error('invalid');
  r.ben.send({ t: 'settings', boardSize: 9 });
  await r.ben.error('not_allowed');
  r.ada.send({ t: 'settings', manualLayout: { starting: 9, second: 8, civilians: 7, moles: 1 } }); // 25 ≠ 36
  await r.ada.until((v) => !!v.room.settings.manualLayout, 'manual stored');
  r.ada.send({ t: 'start' });
  await r.ada.error('not_allowed');
  assert.deepEqual(r.ada.view!.room.settings.manualLayout, { starting: 9, second: 8, civilians: 7, moles: 1 }, 'kept as chosen');
  r.ada.send({ t: 'settings', manualLayout: { starting: 12, second: 11, civilians: 10, moles: 3 } });
  await r.ada.until((v) => v.room.settings.manualLayout?.starting === 12, 'fixed');
  r.ada.send({ t: 'start' });
  await r.ben.until((v) => !!v.match, 'start');
  r.ada.send({ t: 'settings', boardSize: 10 });
  await r.ada.error('not_allowed');
});

await run('Custom: imported words, manual 7×7, no bonus guess, no special clues, no suggestions, complete match', async () => {
  const list = Array.from({ length: 60 }, (_, i) => `ALPHA${'BCDEFGHIJKLMNOPQRSTUVWXYZ'[i % 25]}${'ABCDEFGHIJ'[Math.floor(i / 25)]}`);
  const r = await customRoom({ boardSize: 7, manualLayout: { starting: 18, second: 17, civilians: 13, moles: 1 }, wordPacks: ['custom'], customWords: [...list, 'lantern', 'LANTERN', 'bad word'], bonusGuess: false, specialClues: false, suggestions: false });
  await r.ada.until((v) => v.room.settings.customWords.length > 0, 'words saved');
  assert.equal(r.ada.view!.room.settings.customWords.length, 61, 'deduplicated and invalid entries dropped server-side');
  r.ada.send({ t: 'start' });
  for (const b of r.all) await b.until((v) => !!v.match, 'start');
  const words = new Set([...list, 'LANTERN']);
  assert.ok(r.ben.view!.match!.cards.every((c) => words.has(c.word)), 'board comes only from the imported list');
  assert.deepEqual(r.ben.view!.match!.rules, { suggestions: false, bonusGuess: false, specialClues: false, tokens: 9 });
  const team0 = (r.ada.view!.match!.turn!.owner as { team: TeamId }).team;
  const h0 = team0 === 'crimson' ? r.ada : r.dmitri;
  const o0 = team0 === 'crimson' ? r.ben : r.esme;
  h0.act({ t: 'clue', word: 'ORBIT', count: 0 });
  await h0.error('invalid');
  h0.act({ t: 'clue', word: 'ORBIT', count: 1 });
  await o0.until((v) => v.match!.phase === 'guessing', 'guessing');
  assert.equal(o0.view!.match!.turn!.guessesAllowed, 1, 'no bonus guess');
  o0.act({ t: 'suggest', card: 0, on: true });
  await o0.error('not_allowed');
  // Play out the rest with numbered clues only.
  const handlers: Record<TeamId, Bot> = { crimson: r.ada, cobalt: r.dmitri };
  const ops: Record<TeamId, Bot> = { crimson: r.ben, cobalt: r.esme };
  for (let i = 0; i < 200 && r.ada.view!.match!.phase !== 'completed'; i++) {
    const m = r.ada.view!.match!;
    const team = (m.turn!.owner as { team: TeamId }).team;
    if (m.phase === 'awaiting_clue') handlers[team].act({ t: 'clue', word: 'ORBIT', count: 9 });
    else ops[team].act({ t: 'confirm', card: hiddenOf(handlerKey(handlers[team]), r.ada.view!, team)[0] });
    await r.ada.until((v) => v.match!.revision > m.revision, 'progress');
  }
  assert.equal(r.ada.view!.match!.result!.reason, 'all_agents_found');
});

await run('Custom: server-enforced countdown passes the turn at the deadline (30 s)', async () => {
  const r = await customRoom({ timer: { clueSeconds: 30, guessSeconds: 30 } });
  r.ada.send({ t: 'start' });
  await r.ben.until((v) => !!v.match, 'start');
  const v0 = r.ben.view!;
  assert.ok(v0.serverNow && v0.match!.turn!.deadline, 'deadline and server clock sent');
  assert.ok(Math.abs(v0.match!.turn!.deadline! - v0.serverNow! - 30_000) < 2000);
  const team = (v0.match!.turn!.owner as { team: TeamId }).team;
  await r.ben.until((v) => (v.match!.turn!.owner as { team: TeamId }).team !== team, 'timeout passes turn', 36_000);
  const last = r.ben.view!.match!.history.at(-1)!;
  assert.ok(last.type === 'end_turn' && last.reason === 'timeout');
});

await run('Custom cooperative: Duet engine with 10 tokens, private keys, chosen packs', async () => {
  const a = await createRoom('CoA', 'custom');
  const b = new Bot('CoB', a.code);
  const w = new Bot('CoWatch', a.code);
  await b.connect();
  await w.connect();
  a.send({ t: 'settings', customKind: 'cooperative', duetTokens: 10, wordPacks: ['gaming', 'entertainment'] });
  await a.until((v) => v.room.settings.customKind === 'cooperative', 'coop');
  a.send({ t: 'seat', role: 'operative', side: 'north' });
  b.send({ t: 'seat', role: 'operative', side: 'south' });
  await a.until((v) => v.room.players.filter((p) => p.side).length === 2, 'seated');
  a.send({ t: 'start' });
  for (const x of [a, b, w]) await x.until((v) => !!v.match, 'start');
  assert.equal(a.view!.match!.cards.length, 25);
  assert.equal(a.view!.match!.turn!.turnsLeft, 10);
  assert.equal((a.view!.key as { side: string }).side, 'north');
  assert.equal((b.view!.key as { side: string }).side, 'south');
  assert.equal(w.view!.key, null);
});

await run('Comms: team chat isolated, handlers silent in play, observers isolated, global synchronized', async () => {
  const r = await seatedRoom();
  await startMatch(r);
  r.ben.send({ t: 'chat', text: 'crimson-only plan', channel: 'team:crimson' });
  await r.ada.until((v) => v.room.chat.some((c) => c.text === 'crimson-only plan'), 'crimson handler reads team chat');
  await r.cleo.until((v) => v.room.chat.some((c) => c.text === 'crimson-only plan'), 'teammate receives');
  r.ada.send({ t: 'chat', text: 'psst', channel: 'team:crimson' });
  await r.ada.error('not_allowed');
  r.dmitri.send({ t: 'chat', text: 'psst', channel: 'global' });
  await r.dmitri.error('not_allowed');
  r.gus.send({ t: 'chat', text: 'hey players', channel: 'global' });
  await r.gus.error('not_allowed');
  r.gus.send({ t: 'chat', text: 'observer aside', channel: 'spectators' });
  await r.gus.until((v) => v.room.chat.some((c) => c.text === 'observer aside'), 'observer chat');
  r.esme.send({ t: 'chat', text: 'good luck all', channel: 'global' });
  for (const b of r.all) await b.until((v) => v.room.chat.some((c) => c.text === 'good luck all'), `${b.name} gets global`);
  await sleep(200);
  for (const b of [r.dmitri, r.esme, r.gus]) assert.ok(!b.view!.room.chat.some((c) => c.text === 'crimson-only plan'), `${b.name} never sees crimson chat`);
  for (const b of [r.ada, r.ben, r.cleo, r.dmitri, r.esme]) assert.ok(!b.view!.room.chat.some((c) => c.text === 'observer aside'), `${b.name} never sees observer chat`);
  r.ada.send({ t: 'mute', player: r.ben.playerId, on: true });
  await r.ben.until((v) => !!v.room.players.find((p) => p.id === r.ben.playerId)!.muted, 'muted');
  r.ben.send({ t: 'chat', text: 'still here', channel: 'global' });
  await r.ben.error('not_allowed');
});

await run('Suggestions: two teammates at once both land, rivals never see them, cleared on turn change', async () => {
  const r = await seatedRoom();
  await startMatch(r);
  r.ada.act({ t: 'clue', word: 'ORBIT', count: 2 });
  await r.ben.until((v) => v.match!.phase === 'guessing', 'guessing');
  await r.cleo.until((v) => v.match!.phase === 'guessing', 'guessing');
  const m = r.ben.view!.match!;
  const card = hiddenOf(handlerKey(r.ada), r.ada.view!, 'civilian')[0];
  r.ben.send({ t: 'suggest', card, on: true, match: m.id, rev: m.revision });
  r.cleo.send({ t: 'suggest', card, on: true, match: m.id, rev: m.revision });
  await r.ben.until((v) => v.match!.suggestions.filter((x) => x.card === card).length === 2, 'both suggestions');
  await r.ada.until((v) => v.match!.suggestions.length === 2, 'handler sees teammates');
  assert.equal(r.esme.view!.match!.suggestions.length, 0, 'rival operatives never see them');
  assert.equal(r.ben.view!.match!.cards[card].reveal, null, 'advisory only');
  r.ben.act({ t: 'confirm', card });
  await r.ben.until((v) => v.match!.phase === 'awaiting_clue', 'turn over');
  assert.equal(r.ben.view!.match!.suggestions.length, 0, 'cleared');
  r.cleo.send({ t: 'suggest', card: hiddenOf(handlerKey(r.ada), r.ada.view!, 'crimson')[0], on: true, match: m.id, rev: m.revision });
  await r.cleo.error('stale');
});

await run('History: clues with their guesses and outcomes match what every client saw', async () => {
  const r = await seatedRoom();
  await startMatch(r);
  r.ada.act({ t: 'clue', word: 'ORBIT', count: 2 });
  await r.ben.until((v) => v.match!.phase === 'guessing', 'guessing');
  const own = hiddenOf(handlerKey(r.ada), r.ada.view!, 'crimson')[0];
  r.ben.act({ t: 'confirm', card: own });
  await r.ben.until((v) => !!v.match!.cards[own].reveal, 'reveal');
  r.ben.act({ t: 'end_turn' });
  await r.gus.until((v) => v.match!.phase === 'awaiting_clue', 'turn change');
  const views = r.all.map((b) => JSON.stringify(b.view!.match!.history));
  assert.ok(views.every((h) => h === views[0]), 'identical public history on every client');
  const h = r.gus.view!.match!.history;
  assert.deepEqual(h.map((e) => e.type), ['clue', 'guess', 'end_turn']);
  assert.ok(h[1].type === 'guess' && h[1].guess.card === own && h[1].guess.result.identity === 'crimson');
});

await run('Duet over the network: tokens run out, sudden death, a wrong guess loses', async () => {
  const a = await createRoom('SdA', 'duet');
  const b = new Bot('SdB', a.code);
  await b.connect();
  a.send({ t: 'seat', role: 'operative', side: 'north' });
  b.send({ t: 'seat', role: 'operative', side: 'south' });
  await a.until((v) => v.room.players.filter((p) => p.side).length === 2, 'seated');
  a.send({ t: 'start' });
  await b.until((v) => !!v.match, 'start');
  const keys: Record<string, string[]> = { north: (a.view!.key as { identities: string[] }).identities, south: (b.view!.key as { identities: string[] }).identities };
  const bots: Record<string, Bot> = { north: a, south: b };
  for (let t = 0; t < 9; t++) {
    const m = a.view!.match!;
    const giver = (m.turn!.owner as { side: string }).side;
    const guesser = giver === 'north' ? 'south' : 'north';
    bots[giver].act({ t: 'clue', word: 'ORBIT', count: 1 });
    await a.until((v) => v.match!.phase === 'guessing', 'guessing');
    const mm = a.view!.match!;
    const civ = keys[giver].findIndex((x, i) => x === 'civilian' && !mm.cards[i].reveal && !(mm.cards[i].civilianFor ?? []).includes(giver as never));
    bots[guesser].act({ t: 'confirm', card: civ });
    await a.until((v) => v.match!.revision > mm.revision, 'civilian');
  }
  assert.equal(a.view!.match!.phase, 'sudden_death');
  assert.equal(a.view!.match!.turn!.turnsLeft, 0);
  a.act({ t: 'clue', word: 'LATE', count: 1 });
  await a.error('wrong_phase');
  const m = a.view!.match!;
  const wrong = keys.south.findIndex((x, i) => x === 'civilian' && !m.cards[i].reveal && !(m.cards[i].civilianFor ?? []).includes('south'));
  a.act({ t: 'confirm', card: wrong }); // A guesses on B's key in sudden death
  await a.until((v) => v.match!.phase === 'completed', 'loss');
  assert.deepEqual(a.view!.match!.result!.outcome, { kind: 'cooperative_loss' });
  assert.equal(a.view!.match!.result!.stats.cooperative!.suddenDeath, true);
  assert.equal(a.view!.match!.result!.stats.cooperative!.tokensUsed, 9);
});

await run('New operation with role rotation: same link, fresh match, new handlers hold the new key only', async () => {
  const r = await seatedRoom();
  await startMatch(r);
  const first = r.ada.view!.match!;
  r.ada.act({ t: 'clue', word: 'ORBIT', count: 1 });
  await r.ben.until((v) => v.match!.phase === 'guessing', 'guessing');
  r.ben.act({ t: 'confirm', card: handlerKey(r.ada).indexOf('mole') });
  await r.ada.until((v) => v.match!.phase === 'completed', 'over');
  r.ada.send({ t: 'rematch', rotate: true });
  for (const b of r.all) await b.until((v) => v.match!.id !== first.id, 'new operation');
  const m = r.ben.view!.match!;
  assert.deepEqual([m.revision, m.history.length, m.suggestions.length, m.cards.filter((c) => c.reveal).length, m.result, m.declassified], [0, 0, 0, 0, null, null]);
  assert.equal(r.ben.view!.room.code, r.ada.code, 'same invitation');
  const handlerIds = r.ada.view!.room.players.filter((p) => p.role === 'handler').map((p) => p.id);
  assert.ok(!handlerIds.includes(r.ada.playerId!) && !handlerIds.includes(r.dmitri.playerId!), 'handlers rotated');
  assert.equal(r.ada.view!.key, null, 'the former handler has no key now');
  const newHandlers = r.all.filter((b) => handlerIds.includes(b.playerId!));
  for (const h of newHandlers) assert.equal(h.view!.key?.kind, 'competitive');
});

await run('Random starting team across independently created rooms (secure server randomness)', async () => {
  const starts = new Set<string>();
  for (let i = 0; i < 8 && starts.size < 2; i++) {
    const r = await seatedRoom();
    r.ada.send({ t: 'start' });
    await r.ben.until((v) => !!v.match, 'start');
    starts.add(r.ben.view!.match!.startingTeam!);
    assert.equal(r.ben.view!.match!.turn!.deadline, null, 'unlimited timer by default');
    for (const b of r.all) b.ws.close();
  }
  assert.deepEqual([...starts].sort(), ['cobalt', 'crimson']);
});

// ---------- Report ----------
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} scenarios passed · ${leakChecks} messages scanned for leaks`);
process.exit(passed === results.length ? 0 : 1);
