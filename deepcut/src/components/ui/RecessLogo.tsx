import { useEffect, useRef } from 'react';
import { useSettings } from '../../storage/settings.ts';

/**
 * The Recess "swing" logo (same design as the site's assets/logo.js): the R hangs from a bar and
 * swings with fading ghost copies. Self-contained so DEEPCUT also works when hosted on its own.
 */
const GHOSTS = [4, 3, 2, 1, 0];

export function RecessLogo() {
  const { reduceMotion } = useSettings();
  const groups = useRef<(SVGGElement | null)[]>([]);

  useEffect(() => {
    const calm = reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ang = (t: number, lag: number) => (calm ? 10 : 13 * Math.sin(((t / 1000 - lag) * Math.PI * 2) / 2.4));
    let raf = 0;
    const frame = (t: number) => {
      groups.current.forEach((g, i) => g?.setAttribute('transform', `rotate(${ang(t, GHOSTS[i] * 0.06)} 24 5)`));
      if (!calm) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reduceMotion]);

  return (
    <svg className="recess-logo" viewBox="0 0 172 56" role="img" aria-label="Recess">
      <path d="M2 5 H50" stroke="#3a3f55" strokeWidth={2} fill="none" />
      {GHOSTS.map((k, i) => (
        <g key={k} ref={(el) => (groups.current[i] = el)} opacity={k ? 0.1 + 0.08 * (4 - k) : 1}>
          <path d="M15 5 V40 M33 5 V40" stroke="#f1ede6" strokeWidth={1.2} fill="none" />
          <path d="M11 41 H37" stroke="#ff4d2e" strokeWidth={2.4} fill="none" />
          <text x={24} y={38} textAnchor="middle" fontFamily='"Archivo Black","Arial Black",sans-serif' fontSize={30} fill="none" stroke="#ff4d2e" strokeWidth={1.4}>
            R
          </text>
        </g>
      ))}
      <text x={50} y={50} fontFamily='"Archivo Black","Arial Black",sans-serif' fontSize={31} fill="none" stroke="#f1ede6" strokeWidth={1.3} letterSpacing={-0.5}>
        ECESS
      </text>
    </svg>
  );
}
