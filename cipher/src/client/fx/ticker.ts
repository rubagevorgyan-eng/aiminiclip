/**
 * One shared requestAnimationFrame loop for every running animation (100 decoding cards cost one rAF).
 * Subscribers get the elapsed time since they joined; returning true unsubscribes them. Pauses while
 * the tab is hidden (rAF stops), and nothing runs when there are no subscribers.
 */
type Tick = (elapsed: number) => boolean | void;
const subs = new Map<number, { fn: Tick; start: number }>();
let nextId = 1;
let raf = 0;

function loop(now: number) {
  for (const [id, s] of subs) if (s.fn(now - s.start) === true) subs.delete(id);
  raf = subs.size ? requestAnimationFrame(loop) : 0;
}

export function subscribe(fn: Tick): () => void {
  const id = nextId++;
  subs.set(id, { fn, start: performance.now() });
  if (!raf) raf = requestAnimationFrame(loop);
  return () => void subs.delete(id);
}

/** Skip signal for cinematic sequences (click or Escape). */
const skipListeners = new Set<() => void>();
export const onSkip = (l: () => void) => (skipListeners.add(l), () => void skipListeners.delete(l));
export const skipAll = () => skipListeners.forEach((l) => l());
