import { useEffect, useRef } from 'react';
import { FX } from './timing.ts';
import { useAnimations } from './motion.ts';

/**
 * Sparse falling code for introductory screens only (never over the board). Runs for `durationMs`,
 * then fades out and stops; disabled when animations are off.
 */
export function CodeRain({ durationMs = 2800 }: { durationMs?: number }) {
  const on = useAnimations();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!on || !canvas) return;
    const g = canvas.getContext('2d');
    if (!g) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = (canvas.width = canvas.offsetWidth * dpr);
    const h = (canvas.height = canvas.offsetHeight * dpr);
    const size = 14 * dpr;
    const cols = Math.floor(w / (size * 1.6));
    const drops = Array.from({ length: cols }, () => Math.random() * -h);
    const speed = Array.from({ length: cols }, () => (0.06 + Math.random() * 0.08) * dpr);
    let raf = 0;
    let last = performance.now();
    const start = last;
    const frame = (now: number) => {
      const dt = now - last;
      last = now;
      const t = now - start;
      g.fillStyle = 'rgba(17, 19, 16, 0.18)';
      g.fillRect(0, 0, w, h);
      g.font = `${size}px "IBM Plex Mono", monospace`;
      const fade = t > durationMs - 600 ? Math.max(0, (durationMs - t) / 600) : 1;
      g.fillStyle = `rgba(69, 240, 138, ${0.55 * fade})`;
      for (let i = 0; i < cols; i++) {
        drops[i] += speed[i] * dt;
        if (drops[i] > h) drops[i] = Math.random() * -h * 0.3;
        g.fillText(FX.glyphs[(Math.random() * FX.glyphs.length) | 0], i * size * 1.6, drops[i]);
      }
      if (t < durationMs) raf = requestAnimationFrame(frame);
      else g.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [on, durationMs]);
  return <canvas ref={ref} className="coderain" aria-hidden="true" />;
}
