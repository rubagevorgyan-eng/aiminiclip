/**
 * DEVELOPMENT ONLY: toolbar for the fixture room service (dev builds only; removed from production).
 * Adds fixture players and lets you act as any of them to test host and non-host views.
 */
import { useEffect, useState } from 'react';
import type { RoomConnection } from '../../net/connection.ts';
import { Button } from '../components/Button.tsx';
import { Stamp } from '../components/Stamp.tsx';
import { DEV_CODES, isDevConnection } from './devRoomService.ts';
import './lab.css';

export default function DevLobbyTools({ connection }: { connection: RoomConnection }) {
  const [, force] = useState(0);
  useEffect(() => connection.onView(() => force((n) => n + 1)), [connection]);
  if (!isDevConnection(connection)) return null;
  const dev = connection.dev;
  const players = dev.players();
  return (
    <div className="lab__banner devtools" role="note">
      <Stamp tone="brass" tilt={0}>Dev fixture</Stamp>
      <span>Simulated room in this tab only. This is not real multiplayer. Demo codes: {DEV_CODES.expired} (expired), {DEV_CODES.offline} (no signal).</span>
      <span className="devtools__actions">
        <Button size="sm" variant="secondary" onClick={() => dev.addFixturePlayer()}>+ Fixture player</Button>
        <Button size="sm" variant="secondary" onClick={() => dev.fillRequiredSeats()}>Fill required seats</Button>
        <label className="devtools__as">
          Act as
          <select className="select" value={dev.viewer() ?? ''} onChange={(e) => dev.actAs(e.target.value)}>
            {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </span>
    </div>
  );
}
