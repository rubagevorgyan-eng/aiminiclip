import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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
  /** Home backdrop: tour the mine on its own. */
  ambient?: boolean;
  /** Extra overlay content (top of the scene). */
  children?: ReactNode;
}

/** The animated mine column. Animation runs on its own clock and never affects gameplay. */
export function MineScene({ depth, digs, tier, ambient = false, children }: Props) {
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
  useEffect(() => renderer.current?.setAmbient(ambient), [ambient]);

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
    <div className="mine">
      <canvas ref={canvasRef} className="mine-canvas" aria-hidden="true" />
      {children && <div className="mine-top">{children}</div>}
      {floats.map((f) => (
        <span key={f.id} className={`mine-float num${f.tier >= 4 ? ' is-big' : ''}`} style={{ '--r': RARITY[f.tier].color } as CSSProperties} aria-hidden="true">
          {f.text}
        </span>
      ))}
      <div className="mine-hud">
        <span ref={zoneRef} className="mine-zone eyebrow" />
        <span className="mine-depth num" aria-live="off">
          <span ref={depthRef}>0m</span>
        </span>
      </div>
      {!ambient && <span className="sr-only" aria-live="polite">Depth {depth} meters</span>}
    </div>
  );
}
