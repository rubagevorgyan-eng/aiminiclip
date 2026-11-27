import { useLayoutEffect, useRef, type ElementType } from 'react';
import { frameAt, type DecodePlan } from './timing.ts';
import { onSkip, subscribe } from './ticker.ts';
import { useAnimations } from './motion.ts';

/**
 * Terminal decode of `text`. Writes frames straight to the DOM (no React re-render per frame) and
 * exposes the final text to assistive tech. Restarts when `text`/`runKey` change, cancels on unmount,
 * and renders instantly when animations are off. Presentation only.
 */
export function DecodeText({ text, plan, run = true, runKey, from, as: Tag = 'span', className = '', cursor = true, seed = 0, onTick, onDone }: {
  text: string;
  plan: DecodePlan;
  run?: boolean;
  runKey?: string | number;
  from?: string;
  as?: ElementType;
  className?: string;
  cursor?: boolean;
  seed?: number;
  onTick?: (frame: { index: number }) => void;
  onDone?: () => void;
}) {
  const on = useAnimations();
  const ref = useRef<HTMLElement>(null);
  const caret = useRef<HTMLSpanElement>(null);
  // Layout effect: the first frame is in place before paint, so nothing flashes.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!run || !on) {
      el.textContent = text;
      if (caret.current) caret.current.hidden = true;
      onDone?.();
      return;
    }
    let lastTyped = -1;
    const finish = () => {
      el.textContent = text;
      if (caret.current) caret.current.hidden = true;
      el.parentElement?.classList.remove('fx-live');
      onDone?.();
    };
    el.textContent = frameAt(text, plan, 0, seed, from).text;
    el.parentElement?.classList.add('fx-live');
    if (caret.current) caret.current.hidden = !cursor;
    const stop = subscribe((t) => {
      const f = frameAt(text, plan, t, seed, from);
      el.textContent = f.text;
      if (f.cursor !== null && f.cursor !== lastTyped && f.cursor < text.length) {
        lastTyped = f.cursor;
        onTick?.({ index: f.cursor });
      }
      if (f.done) {
        finish();
        return true;
      }
    });
    const unskip = onSkip(() => (stop(), finish()));
    return () => (stop(), unskip());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, runKey, run, on]);
  return (
    <Tag className={`fx-decode ${className}`.trim()} aria-label={text}>
      {/* Text is written by the effect (React never re-renders it per frame). */}
      <span ref={ref} aria-hidden="true" />
      <span ref={caret} className="fx-cursor" aria-hidden="true" hidden />
    </Tag>
  );
}
