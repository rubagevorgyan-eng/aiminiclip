import { useSyncExternalStore } from 'react';

/** Player preferences, persisted locally. Swap load/save for server storage later. */
export interface Settings {
  /** Force reduced motion even if the system setting is off. */
  reduceMotion: boolean;
  /** Sound effects on/off (mute). */
  sound: boolean;
  /** Sound effects volume, 0..1. */
  volume: number;
}

const KEY = 'deepcut.settings.v1';
const DEFAULTS: Settings = { reduceMotion: false, sound: true, volume: 0.8 };
const subs = new Set<() => void>();

function load(): Settings {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    s.volume = typeof s.volume === 'number' && s.volume >= 0 && s.volume <= 1 ? s.volume : DEFAULTS.volume;
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}

let current: Settings = typeof localStorage === 'undefined' ? { ...DEFAULTS } : load();

function apply() {
  if (typeof document !== 'undefined') document.documentElement.dataset.motion = current.reduceMotion ? 'reduce' : 'system';
}
apply();

export const getSettings = () => current;

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable: keep in memory */
  }
  apply();
  subs.forEach((f) => f());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    getSettings,
  );
}
