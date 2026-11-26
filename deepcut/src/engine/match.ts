import type { Answer, Question } from './types.ts';

const WORD_MAP: Record<string, string> = { st: 'saint', mt: 'mount', ft: 'fort', and: 'and' };
const ROMAN = /^(x{0,3})(ix|iv|v?i{0,3})$/;
const ROMAN_VAL: Record<string, number> = { i: 1, v: 5, x: 10 };

function roman(tok: string): string {
  if (!tok || !ROMAN.test(tok)) return tok;
  let n = 0;
  for (let i = 0; i < tok.length; i++) {
    const v = ROMAN_VAL[tok[i]], next = ROMAN_VAL[tok[i + 1]] ?? 0;
    n += v < next ? -v : v;
  }
  return String(n);
}

/** Case, whitespace, punctuation and accent insensitive form. Roman numerals become digits. */
export function normalize(s: string, ignore: readonly string[] = []): string {
  const words = s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => roman(WORD_MAP[w] ?? w));
  if (words[0] === 'the' && words.length > 1) words.shift();
  const kept = words.filter((w) => !ignore.includes(w) && !(w.endsWith('s') && ignore.includes(w.slice(0, -1))));
  return (kept.length ? kept : words).join(' ');
}

const compact = (k: string) => k.replace(/ /g, '');
const digits = (k: string) => (k.match(/\d+/g) ?? []).join(',');

/** Optimal string alignment distance (Levenshtein + adjacent transposition), capped at max+1. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
      d[i][j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/**
 * Typos allowed when both the guess and the candidate are at least this (space-free) length.
 * Short names must be exact: many real words sit one letter apart (Bulls/Bills, Taiwan/Taipan).
 */
export const typoBudget = (len: number) => (len < 7 ? 0 : len < 11 ? 1 : 2);

interface Index {
  keys: Map<string, Answer | null>; // null = key shared by two answers (ambiguous, never accepted)
  reject: Set<string>;
}
const cache = new WeakMap<Question, Index>();

function index(q: Question): Index {
  let ix = cache.get(q);
  if (ix) return ix;
  const keys = new Map<string, Answer | null>();
  const put = (k: string, a: Answer) => {
    if (!k) return;
    const prev = keys.get(k);
    keys.set(k, prev === undefined || prev === a ? a : null);
  };
  for (const a of q.answers)
    for (const n of [a.name, ...(a.aliases ?? [])]) {
      const k = normalize(n, q.ignore);
      put(k, a);
      put(compact(k), a);
    }
  const reject = new Set<string>();
  for (const r of q.reject ?? []) {
    const k = normalize(r, q.ignore);
    reject.add(k);
    reject.add(compact(k));
  }
  ix = { keys, reject };
  cache.set(q, ix);
  return ix;
}

export interface Match {
  answer: Answer;
  exact: boolean;
}

/**
 * Match a typed guess to one of the question's answers.
 * 1. Exact match on normalized names/aliases (also ignoring spaces), then simple plural forms.
 * 2. Conservative typo tolerance: same first letter, same numbers, small edit distance,
 *    and exactly one closest answer. Anything uncertain is rejected.
 */
export function matchDetail(q: Question, guess: string): Match | null {
  const k = normalize(guess, q.ignore);
  if (!k) return null;
  const { keys, reject } = index(q);
  const c = compact(k);
  if (reject.has(k) || reject.has(c)) return null;

  const tries = [k, c];
  if (c.length > 3) {
    if (k.endsWith('es')) tries.push(k.slice(0, -2));
    if (k.endsWith('s')) tries.push(k.slice(0, -1));
    else tries.push(k + 's');
  }
  for (const t of tries) {
    const a = keys.get(t);
    if (a) return { answer: a, exact: true };
    if (a === null) return null;
  }

  const max = typoBudget(c.length);
  if (!max) return null;
  let best = max + 1;
  let found = new Set<Answer>();
  for (const [key, a] of keys) {
    if (!a || key.includes(' ')) continue; // compare space-free keys only
    if (key[0] !== c[0] || digits(key) !== digits(c)) continue;
    const allowed = Math.min(max, typoBudget(key.length));
    if (!allowed) continue;
    const d = editDistance(c, key, allowed);
    if (d > allowed) continue;
    if (d < best) {
      best = d;
      found = new Set([a]);
    } else if (d === best) found.add(a);
  }
  return best <= max && found.size === 1 ? { answer: [...found][0], exact: false } : null;
}

export function matchAnswer(q: Question, guess: string): Answer | null {
  return matchDetail(q, guess)?.answer ?? null;
}

/**
 * "Did you mean…?" for a guess that was NOT accepted: a looser search than `matchDetail`, used only
 * to offer a suggestion the player must confirm. Never used to score an answer by itself.
 * Allows more typos (1 edit from 4 letters, 2 from 6, 3 from 10), a first-letter slip on longer
 * words, and unambiguous prefixes ("tyranno" -> Tyrannosaurus rex). Ties or known-wrong answers: null.
 */
export function suggestAnswer(q: Question, guess: string): Answer | null {
  if (matchDetail(q, guess)) return null;
  const k = normalize(guess, q.ignore);
  const c = compact(k);
  const { keys, reject } = index(q);
  if (c.length < 4 || reject.has(k) || reject.has(c)) return null;
  const max = c.length < 6 ? 1 : c.length < 10 ? 2 : 3;
  // Rank: closest spelling first (a 1-letter slip beats everything); unambiguous prefixes only
  // when nothing is within 1 edit ("thorr" -> Thor, not Thor: Ragnarok; "ratatoui" -> Ratatouille).
  let best = max + 1;
  let found = new Set<Answer>();
  const prefixes = new Set<Answer>();
  for (const [key, a] of keys) {
    if (!a || key.includes(' ') || digits(key) !== digits(c)) continue;
    if (c.length >= 5 && key.length > c.length && key.startsWith(c)) prefixes.add(a);
    const d = editDistance(c, key, max);
    if (d > max || (key[0] !== c[0] && (d > 1 || c.length < 6))) continue;
    if (d < best) {
      best = d;
      found = new Set([a]);
    } else if (d === best) found.add(a);
  }
  if (best <= 1) return found.size === 1 ? [...found][0] : null;
  if (prefixes.size) return prefixes.size === 1 ? [...prefixes][0] : null;
  return best <= max && found.size === 1 ? [...found][0] : null;
}
