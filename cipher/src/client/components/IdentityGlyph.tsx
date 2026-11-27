import type { Tone } from '../game/identity.ts';

/**
 * Shape marker for an identity, so cards never rely on color alone:
 * Crimson ▲, Cobalt ■, Duet agent ●, civilian ○ (hollow), assassin ✕.
 */
const SHAPES: Record<Tone, string> = { crimson: 'M6 1 11 10H1z', cobalt: 'M2 2h8v8H2z', agent: 'M6 1.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z', neutral: 'M6 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z', assassin: 'M2 2l8 8M10 2l-8 8' };
export const GLYPH_LABEL: Record<Tone, string> = { crimson: 'triangle', cobalt: 'square', agent: 'circle', neutral: 'hollow circle', assassin: 'cross' };

export function IdentityGlyph({ tone, className = '' }: { tone: Tone; className?: string }) {
  const stroke = tone === 'neutral' || tone === 'assassin';
  return (
    <svg className={`glyph glyph--${tone} ${className}`.trim()} viewBox="0 0 12 12" aria-hidden="true">
      <path d={SHAPES[tone]} fill={stroke ? 'none' : 'currentColor'} stroke={stroke ? 'currentColor' : 'none'} strokeWidth={tone === 'assassin' ? 2 : 1.4} />
    </svg>
  );
}
