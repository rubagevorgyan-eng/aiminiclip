/**
 * Live RoomService: talks to the Cipher room server (Cloudflare Worker + Durable Object) over HTTPS
 * and WebSockets. The server is authoritative; this only sends requests and renders the views it gets.
 * Reconnects with backoff and resumes the same seat using the stored guest session.
 */
import type { ConnectionStatus, RoomConnection } from '../net/connection.ts';
import { CLOSE, PROTOCOL_VERSION, type ClientMessage, type ErrorCode, type ServerMessage } from '../net/protocol.ts';
import { RoomError, type RoomErrorCode, type RoomService } from '../net/service.ts';
import { randomId } from '../shared/random.ts';
import type { ClientView, ModeId, RoomCode } from '../shared/types.ts';
import { forgetSession, loadSession, saveSession } from './storage.ts';

const BACKOFF_MS = [500, 1000, 2000, 4000, 8000];
const MAX_RETRIES = 8;
const KEEPALIVE_MS = 25_000;

const FATAL: Record<number, RoomErrorCode> = {
  [CLOSE.notFound]: 'room_not_found',
  [CLOSE.expired]: 'room_expired',
  [CLOSE.kicked]: 'kicked',
  [CLOSE.full]: 'room_full',
  [CLOSE.spectatorsOff]: 'spectators_off',
  [CLOSE.badVersion]: 'bad_version',
};

export function liveRoomService(baseUrl: string): RoomService {
  const http = baseUrl.replace(/\/$/, '');
  const ws = http.replace(/^http/, 'ws');

  return {
    kind: 'live',
    async createRoom({ name, mode }: { name: string; mode: ModeId }) {
      let res: Response;
      try {
        res = await fetch(`${http}/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mode }) });
      } catch {
        throw new RoomError('connection_failed', 'Could not reach the room server.');
      }
      if (!res.ok) throw new RoomError('connection_failed', res.status === 403 ? 'This site is not allowed to open rooms.' : 'Could not create a room. Try again.');
      const body = (await res.json()) as { code: RoomCode; playerId: string; token: string };
      saveSession(body.code, body.playerId, body.token);
      return body.code;
    },
    connect: (code, name) => connect(`${ws}/rooms/${code}/ws`, code, name),
  };
}

function connect(url: string, code: RoomCode, name: string): RoomConnection {
  let status: ConnectionStatus = 'connecting';
  let socket: WebSocket | null = null;
  let retries = 0;
  let everOpened = false;
  let closedByUs = false;
  let keepalive: ReturnType<typeof setInterval> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let lastView: ClientView | null = null;
  const views = new Set<(v: ClientView) => void>();
  const statuses = new Set<(s: ConnectionStatus) => void>();
  const errors = new Set<(c: ErrorCode, m: string) => void>();
  const failures = new Set<(c: RoomErrorCode, m: string) => void>();

  const setStatus = (s: ConnectionStatus) => {
    if (status === s) return;
    status = s;
    statuses.forEach((l) => l(s));
  };
  const fail = (c: RoomErrorCode, m: string) => {
    closedByUs = true;
    clearInterval(keepalive);
    setStatus('closed');
    failures.forEach((l) => l(c, m));
  };

  const open = () => {
    socket = new WebSocket(url);
    socket.onopen = () => {
      const session = loadSession(code);
      socket!.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, room: code, name, ...(session ? { session: { playerId: session.playerId, token: session.token } } : {}) }));
      clearInterval(keepalive);
      keepalive = setInterval(() => socket?.readyState === WebSocket.OPEN && socket.send('{"t":"ping"}'), KEEPALIVE_MS);
    };
    socket.onmessage = (e) => {
      let m: ServerMessage;
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (m.t === 'welcome') {
        saveSession(code, m.playerId, m.token);
        everOpened = true;
        retries = 0;
        setStatus('open');
        lastView = m.view;
        views.forEach((l) => l(m.view));
      } else if (m.t === 'view') {
        lastView = m.view;
        views.forEach((l) => l(m.view));
      } else if (m.t === 'error') {
        errors.forEach((l) => l(m.code, m.message));
      }
    };
    socket.onclose = (e) => {
      clearInterval(keepalive);
      if (closedByUs) return;
      const fatal = FATAL[e.code];
      if (fatal) {
        if (fatal === 'kicked' || fatal === 'room_expired' || fatal === 'room_not_found') forgetSession(code);
        return fail(fatal, e.reason || fatal);
      }
      if (e.code === 1000) return fail('kicked', 'You left the room.');
      retries += 1;
      if (retries > (everOpened ? MAX_RETRIES : 3)) return fail('connection_failed', 'Lost connection to the room.');
      setStatus(everOpened ? 'reconnecting' : 'connecting');
      retryTimer = setTimeout(open, BACKOFF_MS[Math.min(retries - 1, BACKOFF_MS.length - 1)]);
    };
  };
  open();

  return {
    room: code,
    status: () => status,
    send(m: ClientMessage) {
      if (socket?.readyState !== WebSocket.OPEN || status !== 'open') {
        errors.forEach((l) => l('invalid', 'Not connected. Your action was not sent.'));
        return;
      }
      socket.send(JSON.stringify({ ...m, aid: randomId(10) }));
    },
    onView(l) {
      views.add(l);
      if (lastView) l(lastView);
      return () => views.delete(l);
    },
    onStatus(l) {
      statuses.add(l);
      return () => statuses.delete(l);
    },
    onError(l) {
      errors.add(l);
      return () => errors.delete(l);
    },
    onFailure(l) {
      failures.add(l);
      return () => failures.delete(l);
    },
    close() {
      closedByUs = true;
      clearInterval(keepalive);
      clearTimeout(retryTimer);
      socket?.close(1000, 'Closed by client');
      setStatus('closed');
    },
  };
}
