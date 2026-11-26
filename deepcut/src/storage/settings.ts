import { useSyncExternalStore } from 'react';

/** Player preferences, persisted locally. Swap load/save for server storage later. */
export interface Settings {
  /** Force reduced motion even if the system setting is off. */
  reduceMotion: boolean;
  /** Sound effects on/off. */
  sound: boolean;
}

const KEY = 'deepcut.settings.v1';
const DEFAULTS: Settings = { reduceMotion: false, sound: true };
const subs = new Set<() => void>();

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
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
