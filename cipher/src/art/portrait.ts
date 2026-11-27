/**
 * Portrait selection. A portrait is chosen only when a card is publicly revealed:
 * - family from the revealed identity (crimson / cobalt / civilian / assassin; Duet agents -> duet);
 * - slot from the card's random portrait seed (drawn by the engine with the board's secure RNG,
 *   independent of the word and of other cards).
 * Unrevealed cards carry no seed, so nothing identity-dependent exists on the client before a reveal.
 */
import type { RevealedIdentity } from '../shared/types.ts';
import { PORTRAIT_FAMILIES, type PortraitFamily } from './families.ts';
import manifest from './portraits.manifest.json' with { type: 'json' };

export { PORTRAIT_FAMILIES, type PortraitFamily };

export function familyFor(identity: RevealedIdentity): PortraitFamily {
  switch (identity.identity) {
    case 'crimson': case 'cobalt': return identity.identity;
    case 'agent': return 'duet';
    case 'civilian': return 'civilian';
    case 'mole': return 'assassin';
  }
}

export interface PortraitPick { family: PortraitFamily; slot: number; src: string | null }

export function pickPortrait(identity: RevealedIdentity, seed: number): PortraitPick {
  const family = familyFor(identity);
  const slot = (Math.abs(Math.trunc(seed)) % PORTRAIT_FAMILIES[family].target) + 1;
  const src = (manifest.families as Record<string, { slots: Record<string, string> }>)[family]?.slots[String(slot)] ?? null;
  return { family, slot, src };
}

export const portraitFileName = (family: PortraitFamily, slot: number) => `${family}-${String(slot).padStart(2, '0')}.webp`;
export const portraitStatus = () => ({ supplied: manifest.supplied, target: manifest.target });
