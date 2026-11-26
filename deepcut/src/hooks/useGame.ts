import { useCallback, useEffect, useReducer, useState } from 'react';
import { GAME } from '../config/game.ts';
import { initialState, reduce } from '../engine/machine.ts';
import type { Question } from '../engine/types.ts';

/** React glue for the engine: one interval while a timed phase is active, timestamps from Date.now(). */
export function useGame() {
  const [state, dispatch] = useReducer(reduce, initialState);
  const [now, setNow] = useState(() => Date.now());
  const timed = state.phaseEndsAt !== null;

  useEffect(() => {
    if (!timed) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      dispatch({ type: 'TICK', now: t });
    }, GAME.tickMs);
    return () => clearInterval(id);
  }, [timed]);

  const start = useCallback((questions: Question[]) => {
    const t = Date.now();
    setNow(t);
    dispatch({ type: 'START', questions, now: t });
  }, []);
  const submit = useCallback((text: string) => dispatch({ type: 'SUBMIT', text, now: Date.now() }), []);
  const skip = useCallback(() => dispatch({ type: 'SKIP', now: Date.now() }), []);
  const quit = useCallback(() => dispatch({ type: 'QUIT' }), []);

  return { state, now, start, submit, skip, quit };
}
