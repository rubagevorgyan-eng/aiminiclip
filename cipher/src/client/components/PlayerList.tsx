import type { Player, PlayerId } from '../../shared/types.ts';

const ROLE: Record<Player['role'], string> = { handler: 'Handler', operative: 'Operative', spectator: 'Observer' };

/** Players with role, connection state, host and "you" markers. */
export function PlayerList({ players, hostId, you, compact = false }: { players: readonly Player[]; hostId: PlayerId; you: PlayerId; compact?: boolean }) {
  if (players.length === 0) return <p className="meta">No one seated.</p>;
  const sorted = [...players].sort((a, b) => (a.role === 'handler' ? -1 : 0) - (b.role === 'handler' ? -1 : 0));
  return (
    <ul className={`players ${compact ? 'players--compact' : ''}`}>
      {sorted.map((p) => (
        <li key={p.id} className={`player ${p.connected ? '' : 'is-away'}`}>
          <span className="dot" aria-hidden="true" />
          <span className="player__name">
            {p.name}
            {p.id === you && <span className="player__you"> (you)</span>}
          </span>
          {p.id === hostId && <span className="tag tag--brass" title="Room host">Host</span>}
          {!compact && <span className="tag">{ROLE[p.role]}</span>}
          {compact && p.role === 'handler' && <span className="tag">H</span>}
          <span className="sr-only">{p.connected ? 'connected' : 'reconnecting'}</span>
        </li>
      ))}
    </ul>
  );
}
