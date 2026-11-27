import { useEffect, useState } from 'react';
import { normalizeRoomCode } from '../shared/ids.ts';
import type { RoomCode } from '../shared/types.ts';

/**
 * Cipher routes, all on /games/cipher/: the menu, and a room via ?room=CODE (invitation links).
 * A malformed code keeps its raw text so the room flow can show an "invalid code" state.
 */
export type Route = { name: 'home' } | { name: 'room'; code: RoomCode } | { name: 'invalid-room'; raw: string };

const read = (): Route => {
  const raw = new URL(location.href).searchParams.get('room');
  if (raw === null) return { name: 'home' };
  const code = normalizeRoomCode(raw);
  return code ? { name: 'room', code } : { name: 'invalid-room', raw };
};

export function navigate(route: { name: 'home' } | { name: 'room'; code: RoomCode }) {
  const url = new URL(location.href);
  url.search = route.name === 'room' ? `?room=${route.code}` : '';
  url.hash = '';
  history.pushState(null, '', url);
  dispatchEvent(new PopStateEvent('popstate'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    addEventListener('popstate', on);
    return () => removeEventListener('popstate', on);
  }, []);
  return route;
}
