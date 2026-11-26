/** Minimal key-value interface so storage can be swapped (tests, server sync later). */
export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function memoryKV(): KV {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

/** Browser localStorage, or an in-memory fallback when it is unavailable (private mode, disabled). */
export const browserKV: KV = (() => {
  try {
    const t = '__deepcut_test__';
    localStorage.setItem(t, t);
    localStorage.removeItem(t);
    return localStorage;
  } catch {
    return memoryKV();
  }
})();

/** Read JSON; anything missing, unparsable or failing `valid` returns null. */
export function readJSON<T>(kv: KV, key: string, valid: (v: unknown) => v is T): T | null {
  try {
    const raw = kv.getItem(key);
    if (raw === null) return null;
    const v: unknown = JSON.parse(raw);
    return valid(v) ? v : null;
  } catch {
    return null;
  }
}

export function writeJSON(kv: KV, key: string, value: unknown): void {
  try {
    kv.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or disabled storage: ignore, game keeps working in memory */
  }
}
