/** Portrait families, slot counts (the target collection: 68) and art direction. */
export type PortraitFamily = 'crimson' | 'cobalt' | 'civilian' | 'assassin' | 'duet';

export const PORTRAIT_FAMILIES: Record<PortraitFamily, { target: number; label: string }> = {
  crimson: { target: 16, label: 'Crimson agent' },
  cobalt: { target: 16, label: 'Cobalt agent' },
  civilian: { target: 12, label: 'Civilian' },
  assassin: { target: 8, label: 'Assassin' },
  duet: { target: 16, label: 'Duet agent' },
};
