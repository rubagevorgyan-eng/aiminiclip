import { LIMITS, STORAGE_KEYS } from '../shared/config.ts';
import { cleanName } from '../shared/text.ts';
import type { PlayerId, RoomCode, SessionToken } from '../shared/types.ts';

/** localStorage with an in-memory fallback (private mode, blocked storage). Corrupt data reads as the default. */
const memory = new Map<string, string>();
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key) ?? memory.get(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  const raw = JSON.stringify(value);
  try {
    localStorage.setItem(key, raw);
  } catch {
    memory.set(key, raw);
  }
}

export const loadName = () => cleanName(read<string>(STORAGE_KEYS.name, ''));
export const saveName = (name: string) => write(STORAGE_KEYS.name, cleanName(name).slice(0, LIMITS.nameLength));

export interface LocalSettings {
  reduceMotion: boolean;
  /** Decorative decode / reveal animations. */
  animations: boolean;
  /** Sound effects (played only after the first user gesture). */
  sound: boolean;
  /** 0..1 */
  volume: number;
}
const DEFAULT_LOCAL: LocalSettings = { reduceMotion: false, animations: true, sound: true, volume: 0.6 };
export const loadSettings = (): LocalSettings => ({ ...DEFAULT_LOCAL, ...read<Partial<LocalSettings>>(STORAGE_KEYS.settings, {}) });
const settingsListeners = new Set<() => void>();
export const onSettingsChange = (l: () => void) => (settingsListeners.add(l), () => void settingsListeners.delete(l));
export function saveSettings(s: LocalSettings) {
  write(STORAGE_KEYS.settings, s);
  applySettings(s);
  settingsListeners.forEach((l) => l());
}
/** Mirrors settings onto <html> so CSS can honor them (reduced motion). */
export function applySettings(s: LocalSettings = loadSettings()) {
  document.documentElement.dataset.motion = s.reduceMotion ? 'reduced' : 'full';
}

/**
 * Guest sessions: the server-issued player id + token per room, so a reload or a dropped connection
 * rejoins the same seat. Tokens are opaque, room-scoped and never shown; expired rooms are pruned.
 */
interface StoredSession { playerId: PlayerId; token: SessionToken; savedAt: number }
const SESSION_TTL_MS = 24 * 60 * 60_000;
function sessions(): Record<RoomCode, StoredSession> {
  const all = read<Record<RoomCode, StoredSession>>(STORAGE_KEYS.sessions, {});
  const now = Date.now();
  for (const [code, s] of Object.entries(all)) if (!s || now - s.savedAt > SESSION_TTL_MS) delete all[code];
  return all;
}
export const loadSession = (code: RoomCode) => sessions()[code] ?? null;
export function saveSession(code: RoomCode, playerId: PlayerId, token: SessionToken) {
  write(STORAGE_KEYS.sessions, { ...sessions(), [code]: { playerId, token, savedAt: Date.now() } });
}
export function forgetSession(code: RoomCode) {
  const all = sessions();
  delete all[code];
  write(STORAGE_KEYS.sessions, all);
}
