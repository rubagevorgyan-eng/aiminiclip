import { RARITY, ZONES } from '../config/game.ts';
import { HAND, LAMP, BOB_ROWS, MINER, MINER_H, MINER_PALETTE, MINER_W, PICK } from './sprites.ts';
import { MINE, ZONE_LOOK, easeInOutCubic, yForDepth, zoneIndexAt } from './terrain.ts';
import { buildWorld, type World } from './world.ts';

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; glow: boolean }
interface Tween { from: number; to: number; start: number; dur: number }
interface Swing { start: number; tier: number; target: number; struck: boolean }

const SWING = { windup: 150, strike: 110, hold: 120, recover: 260 };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface MineHud { depth: (m: number) => void; zone: (index: number) => void }

/**
 * Canvas renderer for the mine. Runs its own animation loop; the game only tells it
 * "dig to depth X with tier T" or "reset". It never blocks or times gameplay.
 */
export class MineRenderer {
  private world: World;
  private buf: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private ctx: CanvasRenderingContext2D;
  private viewH = 160;
  private viewW: number = MINE.width;
  private xOff = 0;
  private depth = 0; // displayed meters
  private tween: Tween | null = null;
  private swing: Swing | null = null;
  private parts: Particle[] = [];
  private flash = { until: 0, color: '#fff', strength: 0 };
  private shake = { until: 0, amp: 0 };
  private raf = 0;
  private last = 0;
  private lastZone = -1;
  private lastShown = -1;
  private ro: ResizeObserver;
  private mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  private sysReduced = this.mq.matches;
  private forceReduced = false;
  private ambient = false;
  private nextAmbientSwing = 0;
  private onMq = () => (this.sysReduced = this.mq.matches);
  private get reduced() {
    return this.forceReduced || this.sysReduced;
  }
  /** Home-screen mode: slowly tour the mine with occasional swings. */
  setAmbient(on: boolean) {
    this.ambient = on;
    this.nextAmbientSwing = performance.now() + 1200;
  }

  /** Player setting that forces reduced motion regardless of the system preference. */
  setForceReduced(v: boolean) {
    this.forceReduced = v;
  }

  constructor(private canvas: HTMLCanvasElement, private hud: MineHud, startDepth = 0) {
    this.world = buildWorld();
    this.buf = document.createElement('canvas');
    this.buf.width = MINE.width;
    this.bctx = this.buf.getContext('2d')!;
    this.ctx = canvas.getContext('2d')!;
    this.depth = startDepth;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.mq.addEventListener('change', this.onMq);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.mq.removeEventListener('change', this.onMq);
  }

  /** Correct answer: swing, break rock, then descend to `target` meters. tier = rarity index 0..5. */
  dig(target: number, tier: number) {
    const now = performance.now();
    this.finishMotion(now);
    if (this.reduced) {
      this.tween = { from: this.depth, to: target, start: now, dur: 250 };
      return;
    }
    this.swing = { start: now, tier, target, struck: false };
  }

  /** Jump without animation (new game, resume). */
  reset(depth: number) {
    this.tween = null;
    this.swing = null;
    this.parts = [];
    this.depth = depth;
  }

  private finishMotion(now: number) {
    if (this.swing && !this.swing.struck) this.depth = this.swing.target;
    if (this.tween) this.depth = this.tween.to;
    this.swing = null;
    this.tween = null;
    this.last = now;
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1); // pixel art: no need for full retina
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    // CSS px per world px: about 150 world rows tall, but always wide enough to fill the screen.
    const k = Math.max(2, r.height / 150, r.width / MINE.width);
    this.viewW = Math.min(MINE.width, Math.ceil(r.width / k));
    this.viewH = Math.max(40, Math.ceil(r.height / k));
    this.xOff = Math.floor((MINE.width - this.viewW) / 2); // narrow screens show the middle (the shaft)
    this.buf.height = this.viewH + 1; // one spare row for sub-pixel scrolling
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;
    this.update(now, dt);
    this.draw(now);
  };

  // ---------------------------------------------------------------- update
  private update(now: number, dt: number) {
    if (this.ambient && !this.reduced) {
      this.depth += 6 * dt;
      if (this.depth > ZONES[ZONES.length - 1].to) {
        this.depth = 0;
        this.parts = [];
      }
      if (!this.swing && now > this.nextAmbientSwing) {
        const r = Math.random();
        const tier = r < 0.4 ? 0 : r < 0.65 ? 1 : r < 0.8 ? 2 : r < 0.9 ? 3 : r < 0.97 ? 4 : 5;
        this.swing = { start: now, tier, target: this.depth, struck: false };
        this.nextAmbientSwing = now + 2400 + Math.random() * 2200;
      }
    }
    const s = this.swing;
    if (s) {
      const tStrike = SWING.windup + SWING.strike;
      if (!s.struck && now - s.start >= tStrike) {
        s.struck = true;
        this.impact(now, s.tier);
        if (!this.ambient) {
          const dist = Math.max(0, s.target - this.depth);
          this.tween = { from: this.depth, to: s.target, start: now + 60, dur: 520 + dist * 9 + s.tier * 90 };
        }
      }
      if (now - s.start > tStrike + SWING.hold + SWING.recover) this.swing = null;
    }
    const tw = this.tween;
    if (tw && now >= tw.start) {
      const t = Math.min(1, (now - tw.start) / tw.dur);
      this.depth = lerp(tw.from, tw.to, easeInOutCubic(t));
      if (!this.reduced && t < 0.95 && Math.random() < 0.5) this.debris(1, 0);
      if (t >= 1) this.tween = null;
    }
    const g = 140;
    for (const p of this.parts) {
      p.life -= dt;
      if (p.glow) { p.vy -= 18 * dt; p.vx *= 0.98; } else p.vy += g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);

    const shown = Math.round(this.depth);
    if (shown !== this.lastShown) { this.lastShown = shown; this.hud.depth(shown); }
    const z = zoneIndexAt(this.depth);
    if (z !== this.lastZone) { this.lastZone = z; this.hud.zone(z); }
  }

  private feetY() { return Math.round(yForDepth(this.depth)); }
  private minerX() { return Math.round(MINE.width / 2 - MINER_W / 2); }

  private pickAngle(now: number): number {
    const s = this.swing;
    if (!s) return PICK.rest + (this.reduced ? 0 : Math.sin(now / 700) * 0.06);
    const t = now - s.start;
    if (t < SWING.windup) return lerp(PICK.rest, PICK.windup, easeInOutCubic(t / SWING.windup));
    if (t < SWING.windup + SWING.strike) return lerp(PICK.windup, PICK.strike, (t - SWING.windup) / SWING.strike);
    if (t < SWING.windup + SWING.strike + SWING.hold) return PICK.strike;
    return lerp(PICK.strike, PICK.rest, easeInOutCubic((t - SWING.windup - SWING.strike - SWING.hold) / SWING.recover));
  }

  private tip(angle: number) {
    const hx = this.minerX() + HAND.x, hy = this.feetY() - MINER_H + HAND.y;
    return { hx, hy, tx: hx + Math.cos(angle) * PICK.handle, ty: hy + Math.sin(angle) * PICK.handle };
  }

  private impact(now: number, tier: number) {
    const { tx, ty } = this.tip(PICK.strike);
    const zone = ZONE_LOOK[zoneIndexAt(this.depth)];
    const rock = 8 + tier * 6, gems = 3 + tier * 7;
    for (let i = 0; i < rock; i++)
      this.parts.push({ x: tx, y: ty, vx: (Math.random() - 0.3) * 70, vy: -30 - Math.random() * 60, life: 0.5 + Math.random() * 0.5, max: 1, color: zone.rock[i % 3], size: Math.random() < 0.5 ? 2 : 1, glow: false });
    const color = RARITY[tier].color;
    for (let i = 0; i < gems; i++) {
      const a = Math.random() * Math.PI * 2, sp = 15 + Math.random() * (25 + tier * 8);
      this.parts.push({ x: tx, y: ty, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 10, life: 0.7 + Math.random() * (0.5 + tier * 0.15), max: 1.2 + tier * 0.15, color, size: tier >= 3 && Math.random() < 0.4 ? 2 : 1, glow: true });
    }
    if (this.ambient) return; // backdrop: no shake or flash
    if (tier >= 3) this.shake = { until: now + 140 + tier * 50, amp: tier - 2 };
    if (tier >= 4) this.flash = { until: now + 380, color, strength: tier === 5 ? 0.35 : 0.22 };
  }

  private debris(n: number, tier: number) {
    const fy = this.feetY();
    const zone = ZONE_LOOK[zoneIndexAt(this.depth)];
    for (let i = 0; i < n; i++)
      this.parts.push({ x: MINE.width / 2 + (Math.random() - 0.5) * 12, y: fy, vx: (Math.random() - 0.5) * 30, vy: -10 - Math.random() * 25, life: 0.35, max: 0.35, color: zone.rock[(i + tier) % 3], size: 1, glow: false });
  }

  // ---------------------------------------------------------------- draw
  private draw(now: number) {
    const b = this.bctx, W = MINE.width, H = this.viewH;
    const fy = this.feetY();
    // Camera follows the exact (fractional) depth; the buffer is drawn at whole pixels and the
    // remainder is applied when scaling up, so scrolling is smooth instead of stepping per pixel.
    const camF = Math.max(0, Math.min(this.world.height - H - 1, yForDepth(this.depth) - H * 0.58));
    let camY = Math.floor(camF);
    const frac = camF - camY;
    if (!this.reduced && now < this.shake.until) camY += Math.round((Math.random() - 0.5) * 2 * this.shake.amp);

    b.imageSmoothingEnabled = false;
    b.clearRect(0, 0, W, H + 1);
    b.drawImage(this.world.canvas, 0, camY, W, H + 1, 0, 0, W, H + 1);

    // shaft
    const cx = W / 2, sh = MINE.shaftHalf;
    const top = MINE.sky - camY, bottom = fy + 1 - camY;
    if (bottom > top) {
      b.fillStyle = '#0a0b0e';
      b.fillRect(cx - sh, top, sh * 2, bottom - top);
      b.fillStyle = 'rgba(0,0,0,0.6)';
      b.fillRect(cx - sh - 1, top, 1, bottom - top);
      b.fillRect(cx + sh, top, 1, bottom - top);
      b.fillStyle = '#5b4129';
      for (let y = MINE.sky + 40; y < fy - 4; y += 50) {
        const yy = y - camY;
        if (yy < -4 || yy > H) continue;
        b.fillRect(cx - sh, yy, sh * 2, 2);
        b.fillRect(cx - sh, yy, 2, 8);
        b.fillRect(cx + sh - 2, yy, 2, 8);
      }
    }

    // twinkles
    if (!this.reduced)
      for (const t of this.world.twinkles) {
        const yy = t.y - camY;
        if (yy < -2 || yy > H + 2) continue;
        const a = Math.max(0, Math.sin(now / 520 + t.phase));
        if (a < 0.55) continue;
        b.globalAlpha = (a - 0.55) * 2.2;
        b.fillStyle = t.color;
        b.fillRect(t.x, yy - 1, 1, 3);
        b.fillRect(t.x - 1, yy, 3, 1);
        b.globalAlpha = 1;
      }

    // miner + pickaxe
    const mx = this.minerX(), my = fy - MINER_H - camY;
    const bob = this.reduced || this.swing ? 0 : Math.floor(now / 650) % 2;
    const angle = this.pickAngle(now);
    const behind = angle < -1.6;
    if (behind) this.drawPick(angle, camY, bob);
    for (let y = 0; y < MINER_H; y++) {
      const row = MINER[y], dy = y < BOB_ROWS ? bob : 0;
      for (let x = 0; x < MINER_W; x++) {
        const c = MINER_PALETTE[row[x]];
        if (!c) continue;
        b.fillStyle = c;
        b.fillRect(mx + x, my + y + dy, 1, 1);
      }
    }
    if (!behind) this.drawPick(angle, camY, bob);

    // particles
    for (const p of this.parts) {
      const yy = p.y - camY;
      if (yy < -2 || yy > H + 2) continue;
      b.globalAlpha = Math.min(1, p.life / (p.max * 0.5));
      b.fillStyle = p.color;
      b.fillRect(Math.round(p.x), Math.round(yy), p.size, p.size);
      if (p.glow) { b.globalAlpha *= 0.25; b.fillRect(Math.round(p.x) - 1, Math.round(yy) - 1, 3, 3); }
    }
    b.globalAlpha = 1;

    // upscale to the display canvas
    const c = this.ctx, cw = this.canvas.width, ch = this.canvas.height, k = cw / this.viewW, ky = ch / H;
    c.imageSmoothingEnabled = false;
    c.drawImage(this.buf, this.xOff, 0, this.viewW, H + 1, 0, -frac * ky, cw, (H + 1) * ky);

    // lighting: darkness grows with depth, headlamp pool and beam around the miner
    const lx = (mx + LAMP.x + 0.5 - this.xOff) * k, ly = (my + LAMP.y + bob + 0.5 - frac) * ky;
    const dark = 0.28 + 0.5 * Math.min(1, this.depth / ZONES[ZONES.length - 1].to);
    const g = c.createRadialGradient(lx, ly, 6 * k, lx, ly, Math.max(cw, ch) * 0.75);
    g.addColorStop(0, 'rgba(6,7,9,0)');
    g.addColorStop(1, `rgba(6,7,9,${dark})`);
    c.fillStyle = g;
    c.fillRect(0, 0, cw, ch);
    c.globalCompositeOperation = 'lighter';
    const beam = c.createRadialGradient(lx + 14 * k, ly + 2 * k, 0, lx + 14 * k, ly + 2 * k, 22 * k);
    beam.addColorStop(0, 'rgba(255,214,140,0.16)');
    beam.addColorStop(1, 'rgba(255,214,140,0)');
    c.fillStyle = beam;
    c.fillRect(0, 0, cw, ch);
    if (now < this.flash.until) {
      c.globalAlpha = ((this.flash.until - now) / 380) * this.flash.strength;
      c.fillStyle = this.flash.color;
      c.fillRect(0, 0, cw, ch);
      c.globalAlpha = 1;
    }
    c.globalCompositeOperation = 'source-over';
  }

  private drawPick(angle: number, camY: number, bob: number) {
    const b = this.bctx;
    const { hx, hy } = this.tip(angle);
    const ox = hx, oy = hy - camY + bob;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    b.fillStyle = '#8a5a32';
    for (let i = 0; i <= PICK.handle; i++) b.fillRect(Math.round(ox + dx * i), Math.round(oy + dy * i), 1, 1);
    const tx = ox + dx * PICK.handle, ty = oy + dy * PICK.handle;
    const nx = -dy, ny = dx;
    for (let i = -PICK.head; i <= PICK.head; i++) {
      const curve = Math.abs(i) === PICK.head ? 1 : 0;
      b.fillStyle = Math.abs(i) === PICK.head ? '#d8dde6' : '#9aa1ad';
      b.fillRect(Math.round(tx + nx * i - dx * curve), Math.round(ty + ny * i - dy * curve), 1, 1);
    }
  }
}
