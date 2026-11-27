/**
 * RoomObject: the authoritative state for one room. Durable Objects process one event at a time, so
 * every message is applied atomically against the latest revision (two simultaneous guesses: the
 * second is rejected as stale). State is persisted after every change; sockets use the hibernation
 * API, so idle rooms cost nothing. Logs never include room state.
 */
import { DurableObject } from 'cloudflare:workers';
import { projectView } from '../src/engine/projection.ts';
import { CLOSE, MAX_MESSAGE_BYTES, type ErrorCode, type ServerMessage } from '../src/net/protocol.ts';
import { parseClientMessage } from '../src/net/validate.ts';
import { disconnected, handle, hello, housekeeping } from '../src/server/live.ts';
import { systemMessage } from '../src/server/lobby.ts';
import { addGuest, createRoom } from '../src/server/room.ts';
import { cryptoRng } from '../src/shared/random.ts';
import { cleanName } from '../src/shared/text.ts';
import type { ModeId, PlayerId, ServerRoom } from '../src/shared/types.ts';
import { defaultBank } from '../src/vocab/index.ts';
import type { Env } from './index.ts';

interface Attachment { playerId: PlayerId | null; joinedAt: number }

const HELLO_TIMEOUT_MS = 10_000;
/** Token bucket per socket: burst 20, refill 8 per second. */
const BUCKET = { size: 20, perSecond: 8 };
const CHAT = { burst: 5, windowMs: 10_000 };
const FAILURE_CLOSE: Partial<Record<ErrorCode, number>> = { bad_version: CLOSE.badVersion, room_full: CLOSE.full, spectators_off: CLOSE.spectatorsOff, kicked: CLOSE.kicked };

export class RoomObject extends DurableObject<Env> {
  private room: ServerRoom | null = null;
  private expired = false;
  private buckets = new WeakMap<WebSocket, { tokens: number; at: number }>();
  private chatTimes = new Map<PlayerId, number[]>();
  private seenActions = new Map<PlayerId, string[]>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<ServerRoom>('room')) ?? null;
      this.expired = (await ctx.storage.get<number>('expiredAt')) !== undefined;
    });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const code = url.pathname.split('/')[1];
    if (url.pathname.endsWith('/init') && req.method === 'POST') return this.init(code, await req.text());
    if (url.pathname.endsWith('/ws')) return this.accept();
    return new Response('not found', { status: 404 });
  }

  /** Creates the room with its first guest as host (called once per new code). */
  private async init(code: string, body: string): Promise<Response> {
    if (this.room || this.expired) return new Response('{"error":"exists"}', { status: 409 });
    let input: { name?: unknown; mode?: unknown };
    try {
      input = JSON.parse(body);
    } catch {
      return new Response('{"error":"invalid"}', { status: 400 });
    }
    const mode: ModeId = input.mode === 'duet' || input.mode === 'custom' ? input.mode : 'classic';
    const name = cleanName(input.name);
    if (!name) return new Response('{"error":"name_required"}', { status: 400 });
    const now = Date.now();
    const room = createRoom(code, mode, now);
    const { player, session } = addGuest(room, name, now);
    player.connected = false; // connected once the socket says hello
    session.disconnectedAt = now;
    systemMessage(room, `Room ${code} opened by ${player.name}.`, now);
    this.room = room;
    await this.save();
    return new Response(JSON.stringify({ code, playerId: player.id, token: session.token }), { status: 201 });
  }

  private accept(): Response {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    if (!this.room) {
      // Not a hibernating socket: accept, then close with a code the client maps to a room state.
      server.accept();
      const [code, reason] = this.expired ? [CLOSE.expired, 'Room expired'] : [CLOSE.notFound, 'Room not found'];
      setTimeout(() => server.close(code, reason), 0);
      return new Response(null, { status: 101, webSocket: client });
    }
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId: null, joinedAt: Date.now() } satisfies Attachment);
    void this.schedule(Date.now() + HELLO_TIMEOUT_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const room = this.room;
    if (!room) return ws.close(this.expired ? CLOSE.expired : CLOSE.notFound, 'Room unavailable');
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) return ws.close(CLOSE.tooBig, 'Message too large');
    if (!this.allow(ws)) return this.send(ws, { t: 'error', code: 'rate_limited', message: 'Slow down: too many actions.' });
    const m = parseClientMessage(raw);
    if (!m) return this.send(ws, { t: 'error', code: 'invalid', message: 'Malformed message.' });
    const att = ws.deserializeAttachment() as Attachment;
    const now = Date.now();

    if (!att.playerId) {
      if (m.t !== 'hello') return ws.close(CLOSE.invalid, 'Say hello first');
      if (m.room !== room.code) return ws.close(CLOSE.notFound, 'Wrong room');
      const r = hello(room, m, now);
      if (!r.ok) return ws.close(FAILURE_CLOSE[r.code] ?? CLOSE.invalid, r.message);
      ws.serializeAttachment({ ...att, playerId: r.playerId } satisfies Attachment);
      await this.save();
      this.send(ws, { t: 'welcome', playerId: r.playerId, token: r.token, view: projectView(room, r.playerId, Date.now()) });
      this.broadcast(ws);
      return this.reschedule();
    }

    if (m.aid && this.duplicate(att.playerId, m.aid)) return; // retried action already applied
    if (m.t === 'chat' && !this.chatAllowed(att.playerId, now)) return this.send(ws, { t: 'error', code: 'rate_limited', message: 'Chat is limited to 5 messages per 10 seconds.' });
    if (m.t === 'ping') return this.send(ws, { t: 'pong', at: typeof m.at === 'number' ? m.at : 0, serverNow: now });

    const r = handle(room, att.playerId, m, { bank: defaultBank(), rng: cryptoRng, now });
    if (!r.ok) {
      if (r.close) return ws.close(FAILURE_CLOSE[r.code] ?? CLOSE.kicked, r.message);
      return this.send(ws, { t: 'error', code: r.code, message: r.message });
    }
    if (!r.changed) return;
    await this.save();
    this.broadcast();
    if (m.t === 'leave') ws.close(1000, 'Left the room');
    this.closeRemoved();
    await this.reschedule();
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.dropped(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.dropped(ws);
  }

  private async dropped(ws: WebSocket) {
    const att = ws.deserializeAttachment() as Attachment | null;
    const room = this.room;
    if (!room || !att?.playerId) return;
    // Another tab of the same player may still be connected.
    const stillHere = this.ctx.getWebSockets().some((s) => s !== ws && (s.deserializeAttachment() as Attachment | null)?.playerId === att.playerId);
    if (stillHere) return;
    if (disconnected(room, att.playerId, Date.now())) {
      await this.save();
      this.broadcast(ws);
      await this.reschedule();
    }
  }

  async alarm(): Promise<void> {
    const room = this.room;
    if (!room) return;
    const now = Date.now();
    // Close sockets that never said hello.
    for (const s of this.ctx.getWebSockets()) {
      const att = s.deserializeAttachment() as Attachment | null;
      if (att && !att.playerId && now - att.joinedAt >= HELLO_TIMEOUT_MS) s.close(CLOSE.helloTimeout, 'No hello');
    }
    const h = housekeeping(room, now, this.graceOverride());
    if (h.expired) {
      for (const s of this.ctx.getWebSockets()) s.close(CLOSE.expired, 'Room expired');
      await this.ctx.storage.deleteAll();
      await this.ctx.storage.put('expiredAt', now); // tombstone: the code now reports "expired"
      this.room = null;
      this.expired = true;
      return;
    }
    if (h.changed) {
      await this.save();
      this.broadcast();
    }
    if (h.next) await this.schedule(h.next);
  }

  // ---------- helpers ----------
  private graceOverride(): number | undefined {
    const v = parseInt(this.env.GRACE_OVERRIDE_MS, 10);
    return Number.isFinite(v) && v > 0 ? v : undefined;
  }

  private async reschedule() {
    if (!this.room) return;
    const h = housekeeping(structuredClone(this.room), Date.now(), this.graceOverride());
    if (h.changed) await this.schedule(Date.now() + 50); // something is already due (e.g. a required role left)
    else if (h.next) await this.schedule(h.next);
  }

  private async schedule(at: number) {
    const current = await this.ctx.storage.getAlarm();
    if (current === null || at < current) await this.ctx.storage.setAlarm(at);
  }

  private async save() {
    if (this.room) await this.ctx.storage.put('room', this.room);
  }

  private send(ws: WebSocket, m: ServerMessage) {
    try {
      ws.send(JSON.stringify(m));
    } catch {
      /* socket already closed */
    }
  }

  /** Sends each connected player a view built for that player only. */
  private broadcast(except?: WebSocket) {
    const room = this.room;
    if (!room) return;
    for (const s of this.ctx.getWebSockets()) {
      if (s === except) continue;
      const att = s.deserializeAttachment() as Attachment | null;
      if (att?.playerId && room.players.some((p) => p.id === att.playerId)) this.send(s, { t: 'view', view: projectView(room, att.playerId, Date.now()) });
    }
  }

  /** Closes sockets of players who are no longer in the room (removed or left). */
  private closeRemoved() {
    const room = this.room;
    if (!room) return;
    for (const s of this.ctx.getWebSockets()) {
      const att = s.deserializeAttachment() as Attachment | null;
      if (att?.playerId && !room.players.some((p) => p.id === att.playerId)) s.close(CLOSE.kicked, 'Removed from the room');
    }
  }

  private allow(ws: WebSocket): boolean {
    const now = Date.now();
    const b = this.buckets.get(ws) ?? { tokens: BUCKET.size, at: now };
    b.tokens = Math.min(BUCKET.size, b.tokens + ((now - b.at) / 1000) * BUCKET.perSecond);
    b.at = now;
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    this.buckets.set(ws, b);
    return ok;
  }

  private chatAllowed(playerId: PlayerId, now: number): boolean {
    const times = (this.chatTimes.get(playerId) ?? []).filter((t) => now - t < CHAT.windowMs);
    if (times.length >= CHAT.burst) return false;
    times.push(now);
    this.chatTimes.set(playerId, times);
    return true;
  }

  private duplicate(playerId: PlayerId, aid: string): boolean {
    const seen = this.seenActions.get(playerId) ?? [];
    if (seen.includes(aid)) return true;
    seen.push(aid);
    this.seenActions.set(playerId, seen.slice(-50));
    return false;
  }
}
