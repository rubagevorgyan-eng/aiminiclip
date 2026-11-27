import type { ReactNode } from 'react';
import type { Player, PlayerId } from '../../shared/types.ts';
import type { Tone } from '../game/identity.ts';
import { Button } from './Button.tsx';

export interface SeatSlot {
  label: string;
  hint?: string;
  players: readonly Player[];
  /** Max players for this slot (handler = 1). */
  max?: number;
  /** Shown when the viewer can take this seat. */
  onTake?: () => void;
  takeLabel?: string;
  /** Viewer already sits here. */
  mine?: boolean;
}

/**
 * A compact seating panel (a team, a Duet partner, or the spectator area): slots with players,
 * a "take seat" action, and host actions per player.
 */
export function SeatGroup({ tone, title, subtitle, slots, hostId, you, isHost, onKick, onMakeHost, footer }: {
  tone: Tone | 'observer';
  title: string;
  subtitle?: string;
  slots: SeatSlot[];
  hostId: PlayerId;
  you: PlayerId;
  isHost: boolean;
  onKick: (p: Player) => void;
  onMakeHost: (p: Player) => void;
  footer?: ReactNode;
}) {
  return (
    <section className={`seats panel tone-${tone}`} aria-label={title}>
      <header className="seats__head">
        <h3 className="seats__title">{title}</h3>
        {subtitle && <span className="meta">{subtitle}</span>}
      </header>
      {slots.map((slot) => {
        const full = slot.max !== undefined && slot.players.length >= slot.max;
        return (
          <div key={slot.label} className="slot">
            <div className="slot__head">
              <span className="slot__label">{slot.label}</span>
              {slot.hint && <span className="slot__hint">{slot.hint}</span>}
            </div>
            <ul className="slot__list">
              {slot.players.map((p) => (
                <li key={p.id} className={`seat ${p.connected ? '' : 'is-away'} ${p.id === you ? 'is-you' : ''}`}>
                  <span className="dot" aria-hidden="true" />
                  <span className="seat__name">{p.name}</span>
                  {p.id === you && <span className="tag">You</span>}
                  {p.id === hostId && <span className="tag tag--brass">Host</span>}
                  {!p.connected && <span className="tag">Away</span>}
                  {isHost && p.id !== you && (
                    <span className="seat__actions">
                      <button type="button" className="linkbtn" onClick={() => onMakeHost(p)} aria-label={`Make ${p.name} host`}>Make host</button>
                      <button type="button" className="linkbtn linkbtn--danger" onClick={() => onKick(p)} aria-label={`Remove ${p.name}`}>Remove</button>
                    </span>
                  )}
                </li>
              ))}
              {slot.players.length === 0 && <li className="seat seat--empty">Vacant</li>}
            </ul>
            {slot.onTake && !slot.mine && !full && (
              <Button size="sm" variant="secondary" className="slot__take" onClick={slot.onTake}>{slot.takeLabel ?? `Join as ${slot.label.toLowerCase()}`}</Button>
            )}
            {slot.mine && <span className="slot__mine meta">Your seat</span>}
          </div>
        );
      })}
      {footer}
    </section>
  );
}
