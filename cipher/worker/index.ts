/**
 * Cipher room server entry (Cloudflare Worker).
 *   POST /rooms               create a private room -> { code, playerId, token }
 *   GET  /rooms/:code/ws      WebSocket into that room's Durable Object
 *   GET  /health
 * Only origins in ALLOWED_ORIGINS may create rooms or open sockets.
 */
import { CLOSE } from '../src/net/protocol.ts';
import { newRoomCode, normalizeRoomCode } from '../src/shared/ids.ts';
export { RoomObject } from './room.ts';

export interface Env {
  ROOMS: DurableObjectNamespace;
  ALLOWED_ORIGINS: string;
  GRACE_OVERRIDE_MS: string;
}

const allowed = (env: Env, origin: string | null) => !!origin && env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).includes(origin);
const cors = (origin: string) => ({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600', Vary: 'Origin' });
const json = (body: unknown, status: number, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin');
    if (url.pathname === '/health') return json({ ok: true }, 200);
    if (!allowed(env, origin)) return json({ error: 'origin_not_allowed' }, 403);
    const headers = cors(origin!);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    if (url.pathname === '/rooms' && req.method === 'POST') {
      const body = await req.text();
      if (body.length > 1024) return json({ error: 'too_large' }, 413, headers);
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = newRoomCode();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const res = await stub.fetch(`https://room/${code}/init`, { method: 'POST', body });
        if (res.status === 409) continue; // code already used: try another
        return new Response(res.body, { status: res.status, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      }
      return json({ error: 'busy' }, 503, headers);
    }

    const ws = url.pathname.match(/^\/rooms\/([^/]+)\/ws$/);
    if (ws && req.method === 'GET') {
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected_websocket' }, 426, headers);
      const code = normalizeRoomCode(ws[1]);
      if (!code) return closeWith(CLOSE.notFound, 'Invalid room code');
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      return stub.fetch(new Request(`https://room/${code}/ws`, req));
    }
    return json({ error: 'not_found' }, 404, headers);
  },
};

/** Accepts the socket only to close it with an application code the client understands. */
function closeWith(code: number, reason: string): Response {
  const pair = new WebSocketPair();
  pair[1].accept();
  setTimeout(() => pair[1].close(code, reason), 0);
  return new Response(null, { status: 101, webSocket: pair[0] });
}
