import type { ClientView, RoomCode } from '../shared/types.ts';
import type { ClientMessage, ErrorCode } from './protocol.ts';
import type { RoomErrorCode } from './service.ts';

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

/**
 * Client side of a room connection. The WebSocket implementation (with reconnect and the
 * stored guest session) arrives with the multiplayer stage; UI code depends only on this interface.
 */
export interface RoomConnection {
  readonly room: RoomCode;
  status(): ConnectionStatus;
  send(message: ClientMessage): void;
  onView(listener: (view: ClientView) => void): () => void;
  onStatus(listener: (status: ConnectionStatus) => void): () => void;
  /** Rejected actions (the room stays open), e.g. "Crimson already has a handler". */
  onError(listener: (code: ErrorCode, message: string) => void): () => void;
  /** The connection could not be (re)established or was ended by the room; status becomes `closed`. */
  onFailure(listener: (code: RoomErrorCode, message: string) => void): () => void;
  close(): void;
}

/** Where the room server lives. Set at build time (VITE_CIPHER_SERVER); unset = online play unavailable. */
export function serverUrl(): string | null {
  const url = import.meta.env.VITE_CIPHER_SERVER as string | undefined;
  return url ? url.replace(/\/$/, '') : null;
}
