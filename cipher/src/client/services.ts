import type { RoomService } from '../net/service.ts';
import { serverUrl } from '../net/connection.ts';
import { liveRoomService } from './liveRoomService.ts';

/**
 * Picks the room service:
 * - VITE_CIPHER_SERVER set (production build or `npm run dev:live`): the live room server;
 * - otherwise, dev builds use the clearly labeled in-tab fixture service (removed from production);
 * - otherwise none: online rooms show as unavailable.
 */
let pending: Promise<RoomService | null> | null = null;
export function loadRoomService(): Promise<RoomService | null> {
  const url = serverUrl();
  pending ??= url
    ? Promise.resolve(liveRoomService(url))
    : import.meta.env.DEV
      ? import('./dev/devRoomService.ts').then((m) => m.devRoomService)
      : Promise.resolve(null);
  return pending;
}
