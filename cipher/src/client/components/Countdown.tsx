import { useEffect, useState } from 'react';

/**
 * Display-only countdown to a server deadline. `skew` = server clock − local clock at the moment the
 * view arrived, so a wrong device clock does not change what players see. The server alone ends turns.
 */
export function Countdown({ deadline, skew }: { deadline: number; skew: number }) {
  const [now, setNow] = useState(() => Date.now() + skew);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + skew), 250);
    return () => clearInterval(id);
  }, [skew]);
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <span className={`countdown mono ${left <= 10 ? 'is-low' : ''}`} role="timer" aria-label={`${left} seconds left`}>
      {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
    </span>
  );
}
