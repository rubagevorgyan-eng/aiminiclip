import { ZONES } from '../config/game.ts';
import { mulberry32 } from '../utils/random.ts';
import { MINE, ZONE_LOOK, hash2, valueNoise, worldHeight, yForDepth, zoneAtPixel } from './terrain.ts';

export interface Twinkle {
  x: number;
  y: number;
  color: string;
  phase: number;
}
export interface World {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  twinkles: Twinkle[];
  /** Foreground rock silhouettes for the screen edges (left half / right half), scrolled faster for parallax. */
  fore: HTMLCanvasElement;
}

/** Foreground parallax: rows of `fore` advance this many times faster than the world. */
export const FORE_SPEED = 1.35;
export const FORE_W = 30;

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

let cached: World | null = null;

/** Builds the whole mine once into an offscreen low-res canvas (cached). Same seed = same mine. */
export function buildWorld(): World {
  if (cached) return cached;
  cached = generate();
  return cached;
}

function generate(): World {
  const W = MINE.width, H = worldHeight(), S = MINE.seed;
  const dens = W / 96; // decoration counts were tuned at 96px wide
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const px = img.data;
  const set = (x: number, y: number, c: string, a = 1) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const [r, g, b] = hex(c);
    const i = (y * W + x) * 4;
    px[i] = px[i] * (1 - a) + r * a;
    px[i + 1] = px[i + 1] * (1 - a) + g * a;
    px[i + 2] = px[i + 2] * (1 - a) + b * a;
    px[i + 3] = 255;
  };

  // ---- sky (night), distant hills, stars
  for (let y = 0; y < MINE.sky; y++)
    for (let x = 0; x < W; x++) {
      const t = y / MINE.sky;
      const r = 12 + t * 14, g = 16 + t * 18, b = 26 + t * 22;
      const i = (y * W + x) * 4;
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
      if (y < MINE.sky - 16 && hash2(x, y, S + 9) > 0.99) set(x, y, '#cfd6e6', 0.3 + hash2(y, x, S + 10) * 0.5);
    }
  for (let x = 0; x < W; x++) {
    const hill = Math.round(MINE.sky - 6 - valueNoise(x, 0, 18, S + 3) * 12);
    for (let y = hill; y < MINE.sky; y++) set(x, y, '#141a22');
  }

  // ---- rock: per-zone shades from smooth noise + grain, faint strata
  // Two octaves of noise give boulder-sized lumps; comparing with the up-left neighbour lights
  // their upper faces and shades the lower ones, so the rock reads as relief rather than a flat fill.
  const rockN = (x: number, y: number, z: number) => valueNoise(x, y, 9, S + z) * 0.65 + valueNoise(x, y, 3.5, S + 20 + z) * 0.35;
  for (let y = MINE.sky; y < H; y++)
    for (let x = 0; x < W; x++) {
      const z = zoneAtPixel(x, y);
      const look = ZONE_LOOK[z];
      const n = rockN(x, y, z) * 0.9 + hash2(x, y, S) * 0.1;
      const shade = n < 0.4 ? 2 : n < 0.63 ? 0 : 1;
      set(x, y, look.rock[shade]);
      const relief = n - rockN(x - 1, y - 1, z) * 0.9;
      if (relief > 0.04) set(x, y, '#ffffff', 0.07);
      else if (relief < -0.04) set(x, y, '#000000', 0.16);
      const crack = valueNoise(x, y, 15, S + 60); // irregular cracks outline the boulders
      if (Math.abs(crack - 0.5) < 0.011) set(x, y, '#000000', 0.38);
      if (valueNoise(x * 0.3, y * 2.2, 6, S + 40) > 0.88) set(x, y, '#000000', 0.12); // faint strata
      if (hash2(x, y, S + 5) > 0.992) set(x, y, '#000000', 0.45); // pits
      // caverns: dark hollows with a shadowed rim, more of them deeper down
      if (z >= 1) {
        const cave = valueNoise(x, y * 1.6, 28, S + 80);
        const cut = 0.86 - z * 0.015;
        if (cave > cut) set(x, y, '#050608', Math.min(0.78, (cave - cut) * 9));
        else if (cave > cut - 0.02) set(x, y, '#000000', 0.25);
      }
    }
  // topsoil: darker band and pebbles under the grass
  for (let y = MINE.sky + 2; y < MINE.sky + 16; y++)
    for (let x = 0; x < W; x++) {
      set(x, y, '#20140c', 0.28 * (1 - (y - MINE.sky) / 16));
      if (hash2(x, y, S + 77) > 0.985) set(x, y, '#8b7a66', 0.8);
    }

  // ---- grass line
  for (let x = 0; x < W; x++) {
    set(x, MINE.sky, '#3f6b3a');
    set(x, MINE.sky + 1, '#2f5230');
    if (hash2(x, 1, S) > 0.6) set(x, MINE.sky - 1, '#4c7d44');
  }

  const rand = mulberry32(S);
  const inShaft = (x: number) => Math.abs(x - W / 2) <= MINE.shaftHalf + 1;
  const zoneRange = (i: number) => [yForDepth(ZONES[i].from), yForDepth(Math.min(ZONES[i].to, 720))];
  const twinkles: Twinkle[] = [];

  // ---- surface roots
  const root = (x: number, y: number, len: number, depth: number) => {
    for (let i = 0; i < len; i++) {
      if (!inShaft(x)) set(x, y, i < 4 && depth === 0 ? '#6b4a2a' : '#4e3520', depth ? 0.75 : 1);
      y += 1;
      if (rand() < 0.35) x += rand() < 0.5 ? -1 : 1;
      if (depth < 2 && rand() < 0.07) root(x + (rand() < 0.5 ? -1 : 1), y, len * 0.4, depth + 1);
    }
  };
  for (let r = 0; r < 14 * dens; r++) root(Math.floor(rand() * W), MINE.sky + 2, 8 + rand() * 26, 0);

  // ---- deposits per zone (clusters), more and richer deeper down
  ZONES.forEach((_, z) => {
    const look = ZONE_LOOK[z];
    const [y0, y1] = zoneRange(z);
    const clusters = Math.round((16 + z * 3) * dens);
    for (let c = 0; c < clusters; c++) {
      const cx = Math.floor(rand() * W), cy = Math.floor(y0 + 4 + rand() * (y1 - y0 - 8));
      if (inShaft(cx)) continue;
      const size = 1 + Math.floor(rand() * (z === 0 ? 3 : 2.5));
      for (let dy = -size; dy <= size; dy++)
        for (let dx = -size; dx <= size; dx++)
          if (dx * dx + dy * dy <= size * size + rand() * 2) set(cx + dx, cy + dy, look.ore);
      set(cx - 1, cy - 1, look.glint, 0.9);
      if (z >= 3 && rand() < 0.5) twinkles.push({ x: cx - 1, y: cy - 1, color: look.glint, phase: rand() * 6.28 });
    }
  });

  // ---- thin mineral veins in every zone below the surface
  for (let z = 1; z < ZONES.length; z++) {
    const [y0, y1] = zoneRange(z);
    for (let v = 0; v < 6 * dens; v++) {
      let x = Math.floor(rand() * W), y = Math.floor(y0 + rand() * (y1 - y0));
      const dir = rand() < 0.5 ? -1 : 1;
      for (let i = 0; i < 18 + rand() * 20; i++) {
        if (!inShaft(x)) set(x, y, ZONE_LOOK[z].ore, 0.45);
        x += rand() < 0.7 ? dir : 0;
        y += rand() < 0.45 ? 1 : rand() < 0.2 ? -1 : 0;
      }
    }
  }

  // ---- gold veins: glowing random walks
  {
    const [y0, y1] = zoneRange(3);
    for (let v = 0; v < 9 * dens; v++) {
      let x = Math.floor(rand() * W), y = Math.floor(y0 + rand() * (y1 - y0));
      for (let i = 0; i < 40; i++) {
        if (!inShaft(x)) set(x, y, ZONE_LOOK[3].ore, 0.85);
        x += rand() < 0.5 ? -1 : 1;
        y += rand() < 0.6 ? 1 : 0;
      }
    }
  }

  // ---- emerald crystal formations: upward shards
  {
    const [y0, y1] = zoneRange(4);
    for (let c = 0; c < 20 * dens; c++) {
      const bx = Math.floor(rand() * W), by = Math.floor(y0 + 10 + rand() * (y1 - y0 - 12));
      if (inShaft(bx)) continue;
      const shards = 2 + Math.floor(rand() * 3);
      for (let s = 0; s < shards; s++) {
        const sx = bx + s * 2 - shards, h = 3 + Math.floor(rand() * 6), lean = rand() < 0.5 ? -1 : 1;
        for (let i = 0; i < h; i++) {
          const x = sx + Math.round((i / h) * lean);
          set(x, by - i, i === h - 1 ? '#b6f5d9' : '#36d399');
          set(x + 1, by - i, '#1f8a62');
        }
      }
      twinkles.push({ x: bx, y: by - 4, color: '#b6f5d9', phase: rand() * 6.28 });
    }
  }

  // ---- diamond abyss: luminous diamonds with a soft halo
  {
    const [y0, y1] = zoneRange(5);
    for (let d = 0; d < 26 * dens; d++) {
      const x = Math.floor(rand() * W), y = Math.floor(y0 + rand() * (y1 - y0));
      if (inShaft(x)) continue;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= 10) set(x + dx, y + dy, '#67e8f9', 0.06);
      set(x, y - 1, '#67e8f9'); set(x - 1, y, '#67e8f9'); set(x + 1, y, '#2bb5c9'); set(x, y + 1, '#2bb5c9');
      set(x, y, '#ffffff');
      twinkles.push({ x, y, color: '#ffffff', phase: rand() * 6.28 });
    }
  }

  ctx.putImageData(img, 0, 0);

  // ---- headframe over the shaft at the surface (wooden A-frame + wheel)
  const cx = W / 2, top = MINE.sky - 26;
  ctx.fillStyle = '#5b4129';
  for (let y = top; y < MINE.sky; y++) {
    const spread = Math.round(((y - top) / 26) * 10);
    ctx.fillRect(cx - 2 - spread, y, 1, 1);
    ctx.fillRect(cx + 1 + spread, y, 1, 1);
  }
  ctx.fillRect(cx - 8, top + 12, 16, 1);
  ctx.fillRect(cx - 5, top + 6, 10, 1);
  ctx.fillStyle = '#8e939c';
  ctx.fillRect(cx - 3, top - 3, 6, 1); ctx.fillRect(cx - 3, top + 2, 6, 1);
  ctx.fillRect(cx - 4, top - 2, 1, 4); ctx.fillRect(cx + 3, top - 2, 1, 4);
  ctx.fillStyle = '#e6b65c';
  ctx.fillRect(cx - 1, top - 1, 2, 2);

  return { canvas, width: W, height: H, twinkles, fore: buildFore(H) };
}

/**
 * Jagged near-black rock outcrops for the left (x < FORE_W) and right (x >= FORE_W) screen edges.
 * Row r lines up with world row r at the surface and scrolls FORE_SPEED times faster.
 */
function buildFore(worldH: number): HTMLCanvasElement {
  const H = Math.ceil(worldH * FORE_SPEED + 200), S = MINE.seed + 300;
  const c = document.createElement('canvas');
  c.width = FORE_W * 2;
  c.height = H;
  const ctx = c.getContext('2d')!;
  for (let side = 0; side < 2; side++)
    for (let y = MINE.sky + 4; y < H; y++) {
      const ramp = Math.min(1, (y - MINE.sky - 4) / 30); // grows out of the ground
      const w = Math.round(ramp * (3 + valueNoise(side * 500, y, 22, S) * 18 + valueNoise(side * 500, y, 5, S + 1) * 6));
      if (w <= 0) continue;
      const x0 = side ? FORE_W * 2 - w : 0;
      ctx.fillStyle = '#060507';
      ctx.fillRect(x0, y, w, 1);
      ctx.fillStyle = 'rgba(120,110,100,0.18)'; // faint rim catching the lamp
      ctx.fillRect(side ? x0 : x0 + w - 1, y, 1, 1);
    }
  return c;
}
