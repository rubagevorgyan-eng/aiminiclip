import type { CSSProperties, ReactNode } from 'react';

type Tone = 'red' | 'brass' | 'ink';

/** Rubber-stamp marking ("EYES ONLY", "DECLASSIFIED"...). Purely decorative unless `label` is given. */
export function Stamp({ children, tone = 'red', tilt = -3, large = false, double = false, className = '' }: {
  children: ReactNode;
  tone?: Tone;
  tilt?: number;
  large?: boolean;
  double?: boolean;
  className?: string;
}) {
  const cls = ['stamp', tone !== 'red' && `stamp--${tone}`, large && 'stamp--lg', double && 'stamp--double', className].filter(Boolean).join(' ');
  return (
    <span className={cls} style={{ '--tilt': `${tilt}deg` } as CSSProperties}>
      {children}
    </span>
  );
}

/** Original Cipher markings, kept in one place so the vocabulary stays consistent. */
export const MARKINGS = {
  eyesOnly: 'Eyes only',
  declassified: 'Declassified',
  handler: 'Handler clearance',
  compromised: 'Compromised',
  complete: 'Mission complete',
  transmission: 'Transmission',
  dev: 'Dev fixture',
} as const;
