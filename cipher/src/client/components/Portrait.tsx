import { useState } from 'react';
import { pickPortrait, type PortraitFamily } from '../../art/portrait.ts';
import type { RevealedIdentity } from '../../shared/types.ts';

/**
 * A revealed card's portrait: the supplied artwork for its slot (public/portraits/, see the manifest),
 * or a consistent generated placeholder silhouette while the original art is missing.
 */
export function Portrait({ identity, seed }: { identity: RevealedIdentity; seed: number }) {
  const pick = pickPortrait(identity, seed);
  const [failed, setFailed] = useState(false);
  if (pick.src && !failed) {
    return <img className="portrait portrait--art" src={`./${pick.src}`} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />;
  }
  return <PlaceholderPortrait family={pick.family} slot={pick.slot} />;
}

const PALETTE: Record<PortraitFamily, { bg: string; light: string; ink: string; skin: string }> = {
  crimson: { bg: '#3a1614', light: '#c86a5f', ink: '#1a0907', skin: '#d9a48f' },
  cobalt: { bg: '#14233a', light: '#6f97cc', ink: '#070d18', skin: '#b9b6c4' },
  civilian: { bg: '#4a473f', light: '#b8b2a0', ink: '#24221d', skin: '#c9bfa8' },
  assassin: { bg: '#0c0d0c', light: '#3a3a36', ink: '#000', skin: '#4a4642' },
  duet: { bg: '#15261b', light: '#7aa685', ink: '#07110a', skin: '#b8bca2' },
};

/**
 * Temporary placeholder: a printed-style head-and-shoulders silhouette with side light and halftone.
 * Varies hat, collar, glasses and facing by slot so cards are distinguishable. Not final artwork.
 */
export function PlaceholderPortrait({ family, slot }: { family: PortraitFamily; slot: number }) {
  const c = PALETTE[family];
  const hat = slot % 4; // 0 fedora, 1 trilby, 2 none (hair), 3 beret
  const collar = Math.floor(slot / 4) % 3; // 0 trench lapels, 1 turtleneck, 2 shirt + tie
  const glasses = slot % 5 === 0;
  const flip = slot % 2 === 1;
  const id = `pp-${family}-${slot}`;
  return (
    <svg className="portrait portrait--placeholder" viewBox="0 0 64 64" aria-hidden="true" data-placeholder={`${family}-${String(slot).padStart(2, '0')}`}>
      <defs>
        <radialGradient id={`${id}-l`} cx={flip ? '75%' : '25%'} cy="30%" r="80%">
          <stop offset="0" stopColor={c.light} stopOpacity="0.85" />
          <stop offset="1" stopColor={c.bg} stopOpacity="1" />
        </radialGradient>
        <pattern id={`${id}-h`} width="3" height="3" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="0.55" fill={c.ink} opacity="0.35" />
        </pattern>
      </defs>
      <rect width="64" height="64" fill={`url(#${id}-l)`} />
      <g transform={flip ? 'translate(64 0) scale(-1 1)' : undefined}>
        {/* shoulders and collar */}
        <path d="M6 64c2-14 12-20 26-20s24 6 26 20z" fill={c.ink} />
        {collar === 0 && <path d="M22 46l10 12 10-12-4-2-6 7-6-7z" fill={c.light} opacity="0.35" />}
        {collar === 1 && <rect x="25" y="40" width="14" height="8" rx="3" fill={c.ink} />}
        {collar === 2 && <path d="M29 46h6l-3 14z" fill={c.light} opacity="0.4" />}
        {/* neck and head */}
        <rect x="28" y="34" width="8" height="10" fill={c.skin} opacity="0.55" />
        <ellipse cx="32" cy="27" rx="10" ry="12" fill={c.skin} opacity="0.7" />
        <path d="M32 15c6 0 10 5 10 12s-4 12-10 12z" fill={c.ink} opacity="0.45" />
        {glasses ? <rect x="23" y="24" width="18" height="4" rx="1.5" fill={c.ink} /> : <path d="M25 26h5M34 26h5" stroke={c.ink} strokeWidth="1.4" opacity="0.7" />}
        {family === 'assassin' && <circle cx="36.5" cy="26" r="0.9" fill="#a44040" />}
        {/* headwear */}
        {hat === 0 && <path d="M15 20c4-1 30-1 34 0-2 2-6 2-8 2l-2-9c-5-3-11-3-15 0l-2 9c-2 0-5 0-7-2z" fill={c.ink} />}
        {hat === 1 && <path d="M18 19h28l-3 2H21zM22 19l2-7c5-2 11-2 16 0l2 7z" fill={c.ink} />}
        {hat === 2 && <path d="M21 25c-1-9 5-13 11-13s12 4 11 13c-2-5-6-7-11-7s-9 2-11 7z" fill={c.ink} />}
        {hat === 3 && <path d="M20 19c2-6 9-8 15-7 6 1 9 4 9 7-7-2-17-2-24 0z" fill={c.ink} />}
      </g>
      <rect width="64" height="64" fill={`url(#${id}-h)`} />
      {import.meta.env.DEV && <text x="61" y="62" textAnchor="end" fontSize="5" fill={c.light} opacity="0.7" fontFamily="monospace">TEMP</text>}
    </svg>
  );
}
