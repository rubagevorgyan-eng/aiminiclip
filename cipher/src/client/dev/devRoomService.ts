/**
 * DEVELOPMENT FIXTURE room service: a simulated room that lives in this browser tab only
 * (sessionStorage). It runs the real lobby rules (`server/lobby.ts`) and the real projection, but it
 * is NOT multiplayer: nobody else can join. Loaded only in dev builds; the UI labels it everywhere.
 *
 * Demo codes: EXPRD = expired room, NETDN = connection failure; any other unknown code = not found.
 */
import { projectView } from '../../engine/projection.ts';
import type { ConnectionStatus, RoomConnection } from '../../net/connection.ts';
import type { ClientMessage, ErrorCode } from '../../net/protocol.ts';
import { RoomError, type RoomErrorCode, type RoomService } from '../../net/service.ts';
import { applyLobby, systemMessage } from '../../server/lobby.ts';
import { addGuest, createRoom } from '../../server/room.ts';
import { LIMITS, STORAGE_KEYS } from '../../shared/config.ts';
import { newRoomCode } from '../../shared/ids.ts';
import { seededRng } from '../../shared/random.ts';
import type { ClientView, DuetSide, ModeId, Player, PlayerId, Role, RoomCode, ServerRoom, TeamId } from '../../shared/types.ts';
import { loadSession, saveSession } from '../storage.ts';

export const DEV_CODES = { expired: 'EXPRD', offline: 'NETDN' } as const;
const LATENCY_MS = 450;
const FIXTURE_NAMES = ['Ada', 'Ben', 'Cleo', 'Dmitri', 'Esme', 'Felix', 'Gus', 'Hana', 'Ivo', 'Juno'];

const rooms = (): Record<RoomCode, ServerRoom> => {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEYS.devRooms) ?? '{}');
  } catch {
    return {};
  }
};
const saveRoom = (room: ServerRoom) => sessionStorage.setItem(STORAGE_KEYS.devRooms, JSON.stringify({ ...rooms(), [room.code]: room }));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Dev-only extras the lobby's dev toolbar uses. */
export interface DevControls {
  players(): Player[];
  viewer(): PlayerId | null;
  actAs(id: PlayerId): void;
  addFixturePlayer(seat?: { role: Role; team?: TeamId; side?: DuetSide }): void;
  fillRequiredSeats(): void;
}
export type DevConnection = RoomConnection & { dev: DevControls };

function connect(code: RoomCode, name: string): DevConnection {
  let status: ConnectionStatus = 'connecting';
  let viewer: PlayerId | null = null;
  let room: ServerRoom | null = null;
  const rng = seededRng(`dev:${code}:${Date.now()}`);
  const views = new Set<(v: ClientView) => void>();
  const statuses = new Set<(s: ConnectionStatus) => void>();
  const errors = new Set<(c: ErrorCode, m: string) => void>();
  const failures = new Set<(c: RoomErrorCode, m: string) => void>();
  let lastView: ClientView | null = null;

  const setStatus = (s: ConnectionStatus) => {
    status = s;
    statuses.forEach((l) => l(s));
  };
  const fail = (c: RoomErrorCode, m: string) => {
    setStatus('closed');
    failures.forEach((l) => l(c, m));
  };
  const emit = () => {
    if (!room || !viewer) return;
    saveRoom(room);
    if (!room.players.some((p) => p.id === viewer)) return fail('kicked', 'You were removed from this room by the host.');
    lastView = projectView(room, viewer);
    views.forEach((l) => l(lastView!));
  };
  const as = (id: PlayerId, m: ClientMessage) => room && applyLobby(room, id, m, Date.now(), rng);

  setTimeout(() => {
    if (status === 'closed') return;
    if (code === DEV_CODES.expired) return fail('room_expired', 'This room has expired.');
    if (code === DEV_CODES.offline) return fail('connection_failed', 'Could not reach the room server.');
    room = rooms()[code] ?? null;
    if (!room) return fail('room_not_found', 'No room uses this code.');
    const saved = loadSession(code);
    const known = saved && room.sessions.some((s) => s.playerId === saved.playerId && s.token === saved.token);
    if (known) {
      viewer = saved.playerId;
      const p = room.players.find((x) => x.id === viewer)!;
      p.connected = true;
    } else {
      if (room.players.length >= LIMITS.playersPerRoom) return fail('room_full', 'This room is full.');
      const { player, session } = addGuest(room, name, Date.now());
      saveSession(code, player.id, session.token);
      systemMessage(room, `${player.name} joined.`, Date.now());
      viewer = player.id;
    }
    setStatus('open');
    emit();
  }, LATENCY_MS);

  return {
    room: code,
    status: () => status,
    send(m) {
      if (status !== 'open' || !room || !viewer) return;
      const r = as(viewer, m);
      if (r && !r.ok) errors.forEach((l) => l(r.code, r.message));
      if (r && r.ok && r.start) errors.forEach((l) => l('not_allowed', 'Dev fixture: all roles are filled. Live matches arrive with multiplayer (Step 7); try the engine harness at ?harness.'));
      emit();
      if (m.t === 'leave') setStatus('closed');
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
      if (room && viewer) {
        const p = room.players.find((x) => x.id === viewer);
        if (p) p.connected = false;
        saveRoom(room);
      }
      setStatus('closed');
    },
    dev: {
      players: () => room?.players ?? [],
      viewer: () => viewer,
      actAs(id) {
        viewer = id;
        emit();
      },
      addFixturePlayer(seat) {
        if (!room) return;
        const used = new Set(room.players.map((p) => p.name));
        const label = FIXTURE_NAMES.find((n) => !used.has(`${n} (fixture)`)) ?? `Agent ${room.players.length + 1}`;
        const { player } = addGuest(room, `${label} (fixture)`, Date.now());
        if (seat) as(player.id, { t: 'seat', role: seat.role, team: seat.team ?? null, side: seat.side ?? null });
        emit();
      },
      fillRequiredSeats() {
        if (!room) return;
        const coop = room.settings.mode === 'duet';
        const need = coop
          ? (['north', 'south'] as const).filter((s) => !room!.players.some((p) => p.side === s)).map((side) => ({ role: 'operative' as Role, side }))
          : (['crimson', 'cobalt'] as const).flatMap((team) => [
              ...(room!.players.some((p) => p.team === team && p.role === 'handler') ? [] : [{ role: 'handler' as Role, team }]),
              ...(room!.players.some((p) => p.team === team && p.role === 'operative') ? [] : [{ role: 'operative' as Role, team }]),
            ]);
        need.forEach((s) => this.addFixturePlayer(s));
        emit();
      },
    },
  };
}

export const devRoomService: RoomService = {
  kind: 'dev-fixture',
  async createRoom({ name, mode }: { name: string; mode: ModeId }) {
    await wait(LATENCY_MS);
    const code = newRoomCode();
    const room = createRoom(code, mode, Date.now());
    const { player, session } = addGuest(room, name, Date.now());
    systemMessage(room, `Room ${code} opened by ${player.name}.`, Date.now());
    saveRoom(room);
    saveSession(code, player.id, session.token);
    if (!code) throw new RoomError('connection_failed', 'Could not create a room.');
    return code;
  },
  connect,
};

export const isDevConnection = (c: RoomConnection): c is DevConnection => 'dev' in c;
