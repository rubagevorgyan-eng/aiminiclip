/** Central gameplay and theme configuration. Edit values here, not in components. */

export const GAME = {
  roundsPerGame: 7,
  secondsPerQuestion: 25,
  timerWarningSeconds: 5,
  roundResultMs: 1000,
  countdownMs: 3000,
  tickMs: 100,
  maxScore: 700,
} as const;

export type RarityId = 'common' | 'uncommon' | 'notable' | 'rare' | 'legendary' | 'mythic';

export interface RarityTier {
  id: RarityId;
  label: string;
  points: number; // 1 point = 1 meter of depth
  mineral: string;
  color: string;
}

export const RARITY: readonly RarityTier[] = [
  { id: 'common', label: 'Common', points: 10, mineral: 'Coal', color: '#9298A3' },
  { id: 'uncommon', label: 'Uncommon', points: 15, mineral: 'Copper', color: '#C7804A' },
  { id: 'notable', label: 'Notable', points: 30, mineral: 'Silver', color: '#9FB7D6' },
  { id: 'rare', label: 'Rare', points: 60, mineral: 'Gold', color: '#E6B65C' },
  { id: 'legendary', label: 'Legendary', points: 85, mineral: 'Emerald', color: '#36D399' },
  { id: 'mythic', label: 'Mythic', points: 100, mineral: 'Diamond', color: '#67E8F9' },
];

export interface DepthZone {
  name: string;
  from: number; // meters, inclusive
  to: number; // meters, exclusive (last zone inclusive of max)
  title: string; // achievement title for finishing in this zone
}

export const ZONES: readonly DepthZone[] = [
  { name: 'The Surface', from: 0, to: 100, title: 'Surface Scratcher' },
  { name: 'Copper Veins', from: 100, to: 200, title: 'Copper Digger' },
  { name: 'Silver Caverns', from: 200, to: 300, title: 'Silver Seeker' },
  { name: 'Golden Depths', from: 300, to: 400, title: 'Gold Prospector' },
  { name: 'Emerald Hollow', from: 400, to: 550, title: 'Emerald Explorer' },
  { name: 'Diamond Abyss', from: 550, to: 701, title: 'Diamond Master' },
];

export const BRAND = {
  name: 'DEEPCUT',
  tagline: 'The deeper your knowledge, the deeper you go.',
  /** Where the Recess logo and "Exit game" lead (the Recess site home). */
  siteUrl: '/',
} as const;

/** Zone index (0..5) for a depth in meters. */
export function zoneIndexForDepth(m: number): number {
  for (let i = ZONES.length - 1; i >= 0; i--) if (m >= ZONES[i].from) return i;
  return 0;
}

export const rarityIndex = (id: RarityId) => RARITY.findIndex((t) => t.id === id);

export const rarityOf = (id: RarityId): RarityTier => RARITY.find((t) => t.id === id)!;
