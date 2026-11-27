import type { ModeId, RoomCode } from '../shared/types.ts';
import type { RoomConnection } from './connection.ts';

/** Why entering a room failed. Each maps to its own screen in the room flow. */
export type RoomErrorCode =
  | 'invalid_code' // malformed code (checked before any network call)
  | 'room_not_found'
  | 'room_expired'
  | 'room_full'
  | 'spectators_off'
  | 'kicked'
  | 'bad_version'
  | 'connection_failed'
  | 'unavailable'; // no room server configured

export class RoomError extends Error {
  readonly code: RoomErrorCode;
  constructor(code: RoomErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Everything the menu and lobby need from the multiplayer backend.
 * `live` is the real room server (multiplayer stage); `dev-fixture` is the in-tab development
 * simulation, only available in dev builds and always labeled in the UI.
 */
export interface RoomService {
  readonly kind: 'live' | 'dev-fixture';
  /** Creates a private room with the caller as host; resolves with its code. */
  createRoom(input: { name: string; mode: ModeId }): Promise<RoomCode>;
  /** Opens a connection; it reports `connecting`, then a view, or an error code via `onError`/`onFailure`. */
  connect(code: RoomCode, name: string): RoomConnection;
}
