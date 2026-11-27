import type { Tone } from '../game/identity.ts';

/** Agents left to find: a large number plus a pip track (a bar on big boards). */
export function ScoreCounter({ remaining, total, tone, label }: { remaining: number; total: number; tone: Tone; label: string }) {
  const found = total - remaining;
  return (
    <div className={`score tone-${tone}`} aria-label={`${label}: ${remaining} of ${total} agents left`}>
      <span className="score__num">{remaining}</span>
      <span className="score__of">/{total}</span>
      {total <= 20 ? (
        <span className="score__pips" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <i key={i} className={i < found ? 'is-found' : ''} />
          ))}
        </span>
      ) : (
        <span className="score__bar" aria-hidden="true">
          <i style={{ width: `${(found / total) * 100}%` }} />
        </span>
      )}
    </div>
  );
}
