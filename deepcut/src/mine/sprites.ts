/** Miner sprite, 12x16, facing right. k outline, Y/y helmet, L lamp, S/s skin, E eye, B/b overalls, W sleeves, K boots. */
export const MINER = [
  '....kkkkk...',
  '...kYYYYYk..',
  '..kYYYYYYYkL',
  '..kyyyyyyyk.',
  '...kSSSSSk..',
  '...kSSESSk..',
  '...kSSSSsk..',
  '....kSSsk...',
  '...kBBBBBk..',
  '..kWBBBBBWk.',
  '..kSBBbBBSk.',
  '...kBBBBBk..',
  '...kBBbBBk..',
  '...kBk.kBk..',
  '..kKKk.kKKk.',
  '..kkkk.kkkk.',
];
export const MINER_PALETTE: Record<string, string> = {
  k: '#14161a', Y: '#f2c14e', y: '#c99a2e', L: '#fff4c2', S: '#e0a878', s: '#b97f55', E: '#14161a',
  B: '#3e6fb0', b: '#2c4f80', W: '#c9ced6', K: '#3a2e26',
};
export const MINER_W = 12;
export const MINER_H = 16;
/** Hand (pickaxe pivot) and lamp positions within the sprite. */
export const HAND = { x: 9, y: 10 };
export const LAMP = { x: 11, y: 2 };
/** Rows above this bob during idle; legs stay planted. */
export const BOB_ROWS = 13;

/** Pickaxe pose angles (radians, 0 = pointing right, positive = clockwise/down). */
export const PICK = { rest: -1.15, windup: -2.5, strike: 0.75, handle: 9, head: 3 };
