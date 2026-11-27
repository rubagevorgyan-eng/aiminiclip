/** Randomness helpers. Seeded functions are deterministic (tests, replays); ids use the platform CSPRNG. */

/** 32-bit FNV-1a hash of a string, used to turn a text seed into a PRNG state. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type Rng = () => number; // [0, 1)

/** Mulberry32: small, fast, good enough for shuffling a board. Not for secrets. */
export function seededRng(seed: string): Rng {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates on a copy. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Cryptographically random string from `alphabet` (works in browsers, Node 20+ and Workers). */
export function randomString(length: number, alphabet: string): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  // Rejection-free mapping is biased only when alphabet length doesn't divide 256; fine for ids and codes.
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
export const randomId = (length = 12) => randomString(length, ID_ALPHABET);
/** Session tokens: long enough to be unguessable. */
export const randomToken = () => randomString(32, ID_ALPHABET);

/**
 * Cryptographically secure Rng for production boards and keys (server). The seeded generator above has
 * only 32 bits of state: fine for tests and fixtures, but its boards could be brute-forced from a few
 * revealed cards, so it must never decide a live key.
 */
export function cryptoRng(): Rng {
  const buf = new Uint32Array(64);
  let i = buf.length;
  return () => {
    if (i >= buf.length) {
      crypto.getRandomValues(buf);
      i = 0;
    }
    return buf[i++] / 4294967296;
  };
}
