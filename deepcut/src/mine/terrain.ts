import { RARITY, ZONES, zoneIndexForDepth } from '../config/game.ts';

/** World scale in low-res pixels. The scene is drawn at this resolution and scaled up (pixel art). */
export const MINE = {
  width: 96, // low-res px
  pxPerMeter: 2,
  sky: 48, // px of sky above 0m
  extraMeters: 24, // rock drawn below the max depth
  shaftHalf: 6, // shaft is 12px wide
  seed: 20251126,
} as const;

export const worldHeight = () => MINE.sky + (ZONES[ZONES.length - 1].to + MINE.extraMeters) * MINE.pxPerMeter;
export const yForDepth = (m: number) => MINE.sky + m * MINE.pxPerMeter;

/** Rock shades (3) per zone, deposit color comes from the matching rarity tier. */
export const ZONE_LOOK = [
  { rock: ['#5a3d2b', '#6b4a33', '#4a3224'], ore: '#1c1d21', glint: RARITY[0].color }, // Surface: dirt, coal
  { rock: ['#5e4636', '#6e5240', '#4d3a2d'], ore: RARITY[1].color, glint: '#f0b383' }, // Copper Veins
  { rock: ['#3d434c', '#474e58', '#353a42'], ore: RARITY[2].color, glint: '#e8f0fb' }, // Silver Caverns
  { rock: ['#2e2a26', '#38332d', '#26231f'], ore: RARITY[3].color, glint: '#fff0c4' }, // Golden Depths
  { rock: ['#1f2a27', '#26332f', '#19221f'], ore: RARITY[4].color, glint: '#b6f5d9' }, // Emerald Hollow
  { rock: ['#16131c', '#1d1925', '#110f16'], ore: RARITY[5].color, glint: '#ffffff' }, // Diamond Abyss
] as const;

export const zoneIndexAt = zoneIndexForDepth;

export { mulberry32 } from '../utils/random.ts';

/** Stateless hash of integer coords to [0, 1). */
export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise on a coarse grid (cell px), in [0, 1). */
export function valueNoise(x: number, y: number, cell: number, seed: number): number {
  const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
  const fx = x / cell - gx, fy = y / cell - gy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(gx, gy, seed), b = hash2(gx + 1, gy, seed), c = hash2(gx, gy + 1, seed), d = hash2(gx + 1, gy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Zone at a world pixel, with a jittered, dithered boundary so zones blend naturally. */
export function zoneAtPixel(x: number, y: number): number {
  const m = (y - MINE.sky) / MINE.pxPerMeter;
  const wobble = (valueNoise(x, 0, 10, MINE.seed + 1) - 0.5) * 8 + (hash2(x, y, MINE.seed + 2) - 0.5) * 5;
  return zoneIndexAt(Math.max(0, m + wobble));
}

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
