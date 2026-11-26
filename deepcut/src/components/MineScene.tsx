import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { RARITY, ZONES } from '../config/game.ts';
import { MineRenderer } from '../mine/renderer.ts';
import { useSettings } from '../storage/settings.ts';

interface Props {
  /** Target depth in meters (the game score). */
  depth: number;
  /** Number of finished rounds; an increase with a tier triggers a dig. */
  digs: number;
  /** Rarity index (0..5) of the latest round, or null if it was missed. */
  tier: number | null;
  /** Menus: tour the mine on its own instead of following a game. */
  ambient?: boolean;
  /** Show the depth / zone readout (during play). */
  hud?: boolean;
  /** Darken the scene behind text-heavy screens (results, stats, collection). */
  dim?: boolean;
}

/**
 * Full-screen animated mine behind every screen. It stays mounted for the whole session and runs on
 * its own clock: the game only tells it where to dig, so animation never affects gameplay.
 */
export function MineScene({ depth, digs, tier, ambient = false, hud = false, dim = false }: Props) {
  const { reduceMotion } = useSettings();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const depthRef = useRef<HTMLSpanElement>(null);
  const zoneRef = useRef<HTMLSpanElement>(null);
  const renderer = useRef<MineRenderer | null>(null);
  const prevDigs = useRef(digs);
  const prevDepth = useRef(depth);
  const [floats, setFloats] = useState<{ id: number; text: string; tier: number }[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const startDepth = useRef(depth);

  useEffect(() => {
    const r = new MineRenderer(
      canvasRef.current!,
      {
        depth: (m) => {
          if (depthRef.current) depthRef.current.textContent = `${m}m`;
        },
        zone: (i) => {
          const el = zoneRef.current;
          if (!el) return;
          el.textContent = ZONES[i].name;
          el.classList.remove('is-new');
          void el.offsetWidth;
          el.classList.add('is-new');
        },
      },
      startDepth.current,
    );
    renderer.current = r;
    return () => r.destroy();
  }, []);

  useEffect(() => renderer.current?.setForceReduced(reduceMotion), [reduceMotion]);
  useEffect(() => {
    const r = renderer.current;
    if (!r) return;
    r.setAmbient(ambient);
    if (!ambient) r.reset(depth); // a game starts at its own depth, not wherever the tour was
    prevDigs.current = digs;
    prevDepth.current = depth;
  }, [ambient]);

  useEffect(() => {
    const r = renderer.current;
    if (!r) return;
    if (digs < prevDigs.current) r.reset(depth);
    else if (digs > prevDigs.current && tier !== null) {
      r.dig(depth, tier);
      // "+85m" rises from the miner as the pickaxe strikes.
      const gain = depth - prevDepth.current;
      const id = Date.now();
      timers.current.push(
        setTimeout(() => setFloats((f) => [...f, { id, text: `+${gain}m`, tier }]), 260),
        setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1700),
      );
    }
    prevDigs.current = digs;
    prevDepth.current = depth;
  }, [digs, depth, tier]);

  return (
    <div className={`mine${ambient ? ' is-ambient' : ''}${hud ? ' has-hud' : ''}${dim ? ' is-dim' : ''}`}>
      <canvas ref={canvasRef} className="mine-canvas" aria-hidden="true" />
      {floats.map((f) => (
        <span key={f.id} className={`mine-float num${f.tier >= 4 ? ' is-big' : ''}`} style={{ '--r': RARITY[f.tier].color } as CSSProperties} aria-hidden="true">
          {f.text}
        </span>
      ))}
      <div className="mine-hud">
        <span className="eyebrow">Depth</span>
        <span className="mine-depth num" aria-live="off">
          <span ref={depthRef}>0m</span>
        </span>
        <span ref={zoneRef} className="mine-zone eyebrow" />
      </div>
      {!ambient && <span className="sr-only" aria-live="polite">Depth {depth} meters</span>}
    </div>
  );
}
