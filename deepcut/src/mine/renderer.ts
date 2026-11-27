import { DIG, RARITY, ZONES } from '../config/game.ts';
import { HAND, LAMP, BOB_ROWS, MINER, MINER_H, MINER_PALETTE, MINER_W, PICK } from './sprites.ts';
import { MINE, ZONE_LOOK, easeInOutCubic, yForDepth, zoneIndexAt } from './terrain.ts';
import { FORE_SPEED, FORE_W, buildWorld, type World } from './world.ts';

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; glow: boolean }
interface Tween { from: number; to: number; start: number; dur: number }
interface Swing { start: number; tier: number; target: number; struck: boolean }
interface Ring { x: number; y: number; start: number; dur: number; r: number; color: string }
interface Mote { x: number; y: number; vy: number; vx: number; a: number; size: number }

const SWING = { windup: DIG.windupMs, strike: DIG.strikeMs, hold: 120, recover: 260 };
/** Faint ambient tint per zone (warm topsoil, copper, cool silver, amber gold, green emerald, violet abyss). */
const ZONE_TINT = ['#c9a27a', '#d08a5a', '#8fa6c4', '#d9a441', '#3fbf8f', '#7a6cd9'];
const MOTES = 34;
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
  private cam: number | null = null; // smoothed camera row
  private motes: Mote[] = [];
  private rings: Ring[] = [];
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
    if (on) this.cancelEffects(); // back to the menu: drop any dig still playing
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
    // The accepted answer shows first (DIG.acceptMs), then the swing; see DIG in config/game.ts.
    this.swing = { start: now + DIG.acceptMs, tier, target, struck: false };
  }

  private cancelEffects() {
    this.swing = null;
    this.tween = null;
    this.rings = [];
    this.flash.until = 0;
    this.shake.until = 0;
  }

  /** Jump without animation (new game, resume). */
  reset(depth: number) {
    this.cam = null;
    this.cancelEffects();
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
          // Descent length is set by rarity (DIG.descentMs), not distance: rarer feels bigger, never slow.
          if (dist > 0) this.tween = { from: this.depth, to: s.target, start: now + 60, dur: DIG.descentMs[s.tier] };
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

  private lastDraw = 0;
  private lastMote = 0;
  private moteDt(now: number) {
    const d = (now - (this.lastMote || now)) / 1000;
    this.lastMote = now;
    return d;
  }

  private feetY() { return Math.round(yForDepth(this.depth)); }
  private minerX() { return Math.round(MINE.width / 2 - MINER_W / 2); }

  private pickAngle(now: number): number {
    const s = this.swing;
    if (!s || now < s.start) return PICK.rest + (this.reduced ? 0 : Math.sin(now / 700) * 0.06);
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

  /**
   * Rock breaks at the pickaxe tip. Every tier adds a little more: Coal a dark puff, Copper warm
   * sparks, Silver bright white glints, Gold a golden ring and falling glitter, Emerald a green ring
   * and rising crystal shards, Diamond a double prism ring, the most sparkle and a short flash.
   * Shake stays small (max 2 px) and is skipped on the menu backdrop.
   */
  private impact(now: number, tier: number) {
    const { tx, ty } = this.tip(PICK.strike);
    const zone = ZONE_LOOK[zoneIndexAt(this.depth)];
    const color = RARITY[tier].color;
    const P = (x: number, y: number, vx: number, vy: number, life: number, c: string, size: number, glow: boolean) =>
      this.parts.push({ x, y, vx, vy, life, max: life, color: c, size, glow });
    const rock = [6, 9, 12, 14, 16, 20][tier], gems = [2, 6, 10, 16, 22, 30][tier];
    for (let i = 0; i < rock; i++)
      P(tx, ty, (Math.random() - 0.3) * (60 + tier * 6), -30 - Math.random() * (50 + tier * 6), 0.45 + Math.random() * 0.45, zone.rock[i % 3], Math.random() < 0.5 ? 2 : 1, false);
    const palette = tier === 5 ? ['#67e8f9', '#ffffff', '#c4b5fd', '#a5f3fc'] : tier === 2 ? [color, '#ffffff'] : [color];
    for (let i = 0; i < gems; i++) {
      const a = Math.random() * Math.PI * 2, sp = 15 + Math.random() * (25 + tier * 9);
      P(tx, ty, Math.cos(a) * sp, Math.sin(a) * sp - 10, 0.6 + Math.random() * (0.5 + tier * 0.15), palette[i % palette.length], tier >= 3 && Math.random() < 0.4 ? 2 : 1, true);
    }
    if (tier === 0) for (let i = 0; i < 6; i++) P(tx, ty, (Math.random() - 0.5) * 20, -5 - Math.random() * 10, 0.6, '#2a2b30', 2, true); // coal dust puff
    if (tier === 3) for (let i = 0; i < 10; i++) P(tx + (Math.random() - 0.5) * 16, ty - 6 - Math.random() * 8, (Math.random() - 0.5) * 8, 5, 0.9 + Math.random() * 0.5, '#fff0c4', 1, false); // falling glitter
    if (tier === 4) for (let i = 0; i < 8; i++) P(tx + (Math.random() - 0.5) * 6, ty, (Math.random() - 0.5) * 14, -45 - Math.random() * 30, 0.7, i % 2 ? '#b6f5d9' : color, 2, true); // crystal shards
    if (tier >= 3) this.rings.push({ x: tx, y: ty, start: now, dur: 420 + tier * 60, r: 8 + tier * 3, color });
    if (tier === 5) this.rings.push({ x: tx, y: ty, start: now + 90, dur: 620, r: 26, color: '#ffffff' });
    if (this.ambient) return; // backdrop: no shake or flash
    if (tier >= 3) this.shake = { until: now + 110 + (tier - 3) * 50, amp: tier === 5 ? 2 : 1 };
    if (tier >= 4) this.flash = { until: now + 380, color, strength: tier === 5 ? 0.24 : 0.14 };
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
    const target = Math.max(0, Math.min(this.world.height - H - 1, yForDepth(this.depth) - H * 0.58));
    // The camera trails the miner slightly (eased follow), so descents feel like travel, not a cut.
    const prev = this.cam ?? target;
    this.cam = this.reduced ? target : prev + (target - prev) * Math.min(1, (now - (this.lastDraw || now)) / 1000 * 13); // settles in ~150ms
    this.lastDraw = now;
    const camF = this.cam;
    const camDelta = camF - prev;
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

    // twinkles: gems near the headlamp catch the light more often
    const lampX = this.minerX() + LAMP.x, lampY = fy - MINER_H + LAMP.y - camY;
    if (!this.reduced)
      for (const t of this.world.twinkles) {
        const yy = t.y - camY;
        if (yy < -2 || yy > H + 2) continue;
        const near = Math.hypot(t.x - lampX, yy - lampY) < 36;
        const a = Math.max(0, Math.sin(now / (near ? 380 : 520) + t.phase));
        const cut = near ? 0.3 : 0.6;
        if (a < cut) continue;
        b.globalAlpha = Math.min(1, (a - cut) * 2.4);
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
    // thin dark outline so the miner reads against any rock
    b.fillStyle = 'rgba(0,0,0,0.55)';
    for (let y = 0; y < MINER_H; y++) {
      const row = MINER[y], dy = y < BOB_ROWS ? bob : 0;
      for (let x = 0; x < MINER_W; x++) if (MINER_PALETTE[row[x]]) b.fillRect(mx + x - 1, my + y + dy - 1, 3, 3);
    }
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

    // discovery rings (gold and up)
    this.rings = this.rings.filter((r) => now < r.start + r.dur);
    for (const r of this.rings) {
      if (now < r.start) continue;
      const t = (now - r.start) / r.dur, e = 1 - Math.pow(1 - t, 3);
      b.globalAlpha = (1 - t) * 0.8;
      b.strokeStyle = r.color;
      b.lineWidth = 1;
      b.beginPath();
      b.arc(r.x, r.y - camY, 2 + e * r.r, 0, Math.PI * 2);
      b.stroke();
    }
    b.globalAlpha = 1;

    // dust motes: a slower layer than the rock (they trail behind on descents), only underground
    if (!this.reduced) {
      if (this.motes.length < MOTES)
        for (let i = this.motes.length; i < MOTES; i++)
          this.motes.push({ x: Math.random() * W, y: Math.random() * H, vy: 1.5 + Math.random() * 4, vx: (Math.random() - 0.5) * 1.5, a: 0.15 + Math.random() * 0.35, size: Math.random() < 0.2 ? 2 : 1 });
      const dt = Math.min(0.05, this.moteDt(now));
      const tint = ZONE_TINT[zoneIndexAt(this.depth)];
      for (const m of this.motes) {
        m.y += m.vy * dt - camDelta * 0.55;
        m.x += m.vx * dt + Math.sin(now / 1300 + m.a * 40) * 0.02;
        if (m.y > H + 2) { m.y = -2; m.x = Math.random() * W; }
        if (m.y < -2) { m.y = H + 2; m.x = Math.random() * W; }
        if (m.y + camY < MINE.sky + 6) continue;
        const lit = Math.hypot(m.x - lampX, m.y - lampY) < 30 ? 1.8 : 1;
        b.globalAlpha = Math.min(0.8, m.a * lit);
        b.fillStyle = lit > 1 ? '#ffe2b0' : tint;
        b.fillRect(Math.round(m.x), Math.round(m.y), m.size, 1);
      }
      b.globalAlpha = 1;
    }

    // foreground outcrops at the view edges, scrolling faster than the world (parallax)
    {
      const c0 = Math.max(0, yForDepth(0) - H * 0.58);
      const fy0 = Math.round(camF * FORE_SPEED - c0 * (FORE_SPEED - 1));
      const inset = this.viewW < 150 ? 12 : 0; // narrow screens: only the outer part shows
      b.drawImage(this.world.fore, 0, fy0, FORE_W, H + 1, this.xOff - inset, 0, FORE_W, H + 1);
      b.drawImage(this.world.fore, FORE_W, fy0, FORE_W, H + 1, this.xOff + this.viewW - FORE_W + inset, 0, FORE_W, H + 1);
    }

    // upscale to the display canvas
    const c = this.ctx, cw = this.canvas.width, ch = this.canvas.height, k = cw / this.viewW, ky = ch / H;
    c.imageSmoothingEnabled = false;
    c.drawImage(this.buf, this.xOff, 0, this.viewW, H + 1, 0, -frac * ky, cw, (H + 1) * ky);

    // lighting: darkness grows with depth, headlamp pool and beam around the miner
    const lx = (mx + LAMP.x + 0.5 - this.xOff) * k, ly = (my + LAMP.y + bob + 0.5 - frac) * ky;
    const progress = Math.min(1, this.depth / ZONES[ZONES.length - 1].to);
    const dark = 0.22 + 0.62 * progress; // deeper = darker, and the lamp's pool of light shrinks
    const g = c.createRadialGradient(lx, ly, 6 * k, lx, ly, Math.max(cw, ch) * lerp(0.8, 0.5, progress));
    g.addColorStop(0, 'rgba(6,7,9,0)');
    g.addColorStop(0.55, `rgba(6,7,9,${dark * 0.55})`);
    g.addColorStop(1, `rgba(6,7,9,${dark})`);
    c.fillStyle = g;
    c.fillRect(0, 0, cw, ch);
    if (this.depth > 2) {
      c.globalAlpha = 0.07;
      c.fillStyle = ZONE_TINT[zoneIndexAt(this.depth)];
      c.fillRect(0, 0, cw, ch);
      c.globalAlpha = 1;
    }
    c.globalCompositeOperation = 'lighter';
    const halo = c.createRadialGradient(lx, ly, 0, lx, ly, 10 * k);
    halo.addColorStop(0, 'rgba(255,224,160,0.22)');
    halo.addColorStop(1, 'rgba(255,224,160,0)');
    c.fillStyle = halo;
    c.fillRect(0, 0, cw, ch);
    const beam = c.createRadialGradient(lx + 14 * k, ly + 2 * k, 0, lx + 14 * k, ly + 2 * k, 24 * k);
    beam.addColorStop(0, 'rgba(255,214,140,0.18)');
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
