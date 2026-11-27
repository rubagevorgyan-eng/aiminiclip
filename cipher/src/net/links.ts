import { normalizeRoomCode } from '../shared/ids.ts';
import type { RoomCode } from '../shared/types.ts';

/** Invitation links use a query parameter so they work on a static host without rewrites: /games/cipher/?room=ABCDE */
export function roomFromUrl(href: string): RoomCode | null {
  const raw = new URL(href).searchParams.get('room');
  return raw ? normalizeRoomCode(raw) : null;
}

export function inviteLink(code: RoomCode, href: string): string {
  const url = new URL(href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', code);
  return url.toString();
}
