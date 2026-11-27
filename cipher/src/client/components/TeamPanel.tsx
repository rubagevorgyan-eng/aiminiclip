import type { Player, PlayerId } from '../../shared/types.ts';
import type { Tone } from '../game/identity.ts';
import { PlayerList } from './PlayerList.tsx';
import { ScoreCounter } from './ScoreCounter.tsx';

/** Compact team (or Duet station) panel: name, agents left, roster, and whose turn it is. */
export function TeamPanel({ tone, title, remaining, total, players, hostId, you, active, extra }: {
  tone: Tone;
  title: string;
  /** Omit both to hide the score (Duet partner panels). */
  remaining?: number;
  total?: number;
  players: readonly Player[];
  hostId: PlayerId;
  you: PlayerId;
  active: boolean;
  extra?: string;
}) {
  return (
    <section className={`team panel tone-${tone} ${active ? 'is-active' : ''}`} aria-label={title}>
      <header className="team__head">
        <h3 className="team__name">{title}</h3>
        {active && <span className="team__turn">On turn</span>}
      </header>
      {total !== undefined && remaining !== undefined && <ScoreCounter remaining={remaining} total={total} tone={tone} label={title} />}
      {extra && <p className="meta team__extra">{extra}</p>}
      <div className="team__roster">
        <PlayerList players={players} hostId={hostId} you={you} compact />
      </div>
    </section>
  );
}
