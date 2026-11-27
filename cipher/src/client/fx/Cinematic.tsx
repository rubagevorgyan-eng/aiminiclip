import { useEffect, useState } from 'react';
import { DecodeText } from './DecodeText.tsx';
import { useAnimations } from './motion.ts';
import { skipAll } from './ticker.ts';
import { PLANS } from './timing.ts';
import { sfx } from '../sound.ts';

/**
 * Short skippable terminal banner (e.g. AUTHENTICATING… then ACCESS GRANTED). Click, Escape or
 * waiting dismisses it; it never blocks gameplay state and is skipped entirely without animations.
 */
export function TerminalBanner({ lines, onDone }: { lines: [string, string]; onDone: () => void }) {
  const on = useAnimations();
  const [stage, setStage] = useState(0);
  const second = PLANS.banner(lines[1].length, 0);
  useEffect(() => {
    if (!on) return onDone();
    const t1 = setTimeout(() => setStage(1), 700); // authentication pause
    const t2 = setTimeout(onDone, 700 + second.total + 900);
    return () => (clearTimeout(t1), clearTimeout(t2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);
  if (!on) return null;
  return (
    <button type="button" className="terminal-banner" onClick={() => (skipAll(), onDone())} aria-label={`${lines[1]}. Dismiss`}>
      <span className="terminal-banner__line terminal-banner__line--dim">{lines[0]}<span className="fx-cursor" aria-hidden="true" hidden={stage > 0} /></span>
      {stage > 0 && <DecodeText className="terminal-banner__line" text={lines[1]} plan={second} onTick={() => sfx.type()} onDone={() => sfx.beep()} />}
    </button>
  );
}
