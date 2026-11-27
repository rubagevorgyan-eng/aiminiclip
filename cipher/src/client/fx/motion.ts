import { useEffect, useState } from 'react';
import { loadSettings, onSettingsChange } from '../storage.ts';

/**
 * Whether decorative animation runs: the player's "Animations" toggle is on, "Reduce motion" is off,
 * and the system does not prefer reduced motion. Gameplay never depends on this.
 */
export function animationsEnabled(): boolean {
  const s = loadSettings();
  const system = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return s.animations && !s.reduceMotion && !system;
}

export function useAnimations(): boolean {
  const [on, setOn] = useState(animationsEnabled);
  useEffect(() => {
    const mq = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    const update = () => setOn(animationsEnabled());
    mq?.addEventListener('change', update);
    const off = onSettingsChange(update);
    return () => (mq?.removeEventListener('change', update), off());
  }, []);
  return on;
}
