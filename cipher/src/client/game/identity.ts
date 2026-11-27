import { SIDE_LABEL, TEAM_LABEL } from '../../shared/config.ts';
import type { CompetitiveIdentity, DuetIdentity, KeyView, RevealedIdentity, SecretKey, TeamId } from '../../shared/types.ts';

/** Visual tone of an identity. Maps 1:1 to palette tokens (--c-crimson, --c-cobalt, --c-agent, --c-neutral, --c-assassin). */
export type Tone = 'crimson' | 'cobalt' | 'agent' | 'neutral' | 'assassin';

export function toneOf(identity: CompetitiveIdentity | DuetIdentity): Tone {
  switch (identity) {
    case 'crimson':
    case 'cobalt':
    case 'agent':
      return identity;
    case 'civilian':
      return 'neutral';
    case 'mole':
      return 'assassin';
  }
}

export const toneOfReveal = (r: RevealedIdentity): Tone => toneOf(r.identity);

export function identityLabel(r: RevealedIdentity): string {
  switch (r.identity) {
    case 'crimson':
    case 'cobalt':
      return `${r.identity} agent`;
    case 'agent':
      return 'Field agent';
    case 'civilian':
      return 'Civilian';
    case 'mole':
      return 'Mole';
  }
}

/** Key tone for a hidden card, from the key this viewer is allowed to hold (handlers / own Duet side). */
export const keyToneAt = (key: KeyView | null, index: number): Tone | null => (key ? toneOf(key.identities[index]) : null);

export const teamLabel = (t: TeamId) => TEAM_LABEL[t];
export { SIDE_LABEL };

export const pad2 = (n: number) => String(n).padStart(2, '0');
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

/** After a match the server declassifies the whole key; Duet shows a card's strongest identity across both sides. */
export function declassifiedToneAt(key: SecretKey | null, index: number): Tone | null {
  if (!key) return null;
  if (key.kind === 'competitive') return toneOf(key.identities[index]);
  const both = [key.sides.north[index], key.sides.south[index]];
  return both.includes('mole') ? 'assassin' : both.includes('agent') ? 'agent' : 'neutral';
}
