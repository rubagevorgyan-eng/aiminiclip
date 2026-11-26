import { useEffect, useState } from 'react';
import { useSettings } from '../storage/settings.ts';

/** Animates 0 -> target with ease-out. Instant under reduced motion. */
export function useCountUp(target: number, ms = 1300): number {
  const { reduceMotion } = useSettings();
  const reduced = reduceMotion || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [v, setV] = useState(reduced ? target : 0);
  useEffect(() => {
    if (reduced) return setV(target);
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduced]);
  return v;
}
