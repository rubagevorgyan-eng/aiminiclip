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
}

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
  for (let y = MINE.sky; y < H; y++)
    for (let x = 0; x < W; x++) {
      const z = zoneAtPixel(x, y);
      const look = ZONE_LOOK[z];
      const n = valueNoise(x, y, 7, S + z) * 0.75 + hash2(x, y, S) * 0.25;
      const shade = n < 0.38 ? 2 : n < 0.68 ? 0 : 1;
      set(x, y, look.rock[shade]);
      if (valueNoise(x * 0.3, y * 2.2, 6, S + 40) > 0.86) set(x, y, '#000000', 0.18); // strata lines
      if (hash2(x, y, S + 5) > 0.992) set(x, y, '#000000', 0.45); // pits
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
  for (let r = 0; r < 10 * dens; r++) {
    let x = Math.floor(rand() * W), y = MINE.sky + 2;
    const len = 8 + rand() * 26;
    for (let i = 0; i < len; i++) {
      if (!inShaft(x)) set(x, y, i < 4 ? '#6b4a2a' : '#4e3520');
      y += 1;
      if (rand() < 0.35) x += rand() < 0.5 ? -1 : 1;
    }
  }

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
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(x + dx, y + dy, '#67e8f9', 0.08);
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

  return { canvas, width: W, height: H, twinkles };
}
