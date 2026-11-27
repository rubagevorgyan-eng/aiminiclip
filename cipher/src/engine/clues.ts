import { cleanClueWord, wordKey } from '../shared/text.ts';

/**
 * Clue validation. Automatic checks catch the mechanical problems only:
 *   - empty or multi-word clues, invalid numbers,
 *   - an unrevealed board word, or an obvious form of one (plural, tense, -er/-est/-ly).
 * Semantic fairness (no hints by spelling, letter count, position, rhymes-as-codes, tone or gesture)
 * cannot be verified by software. It is covered by the table rules in CIPHER_RULES.md, and the engine
 * returns warnings for borderline cases (compound containment, digits) instead of claiming certainty.
 */

/** `null` = unlimited ("∞"), `0` = zero clue. Both allow unlimited guesses (see guessesFor). */
export type ClueCount = number | null;
export const MAX_CLUE_NUMBER = 9;

export type ClueCheck =
  | { ok: true; word: string; count: ClueCount; warnings: string[] }
  | { ok: false; reason: string };

/** Crude English stem: enough to catch obvious word forms, not a linguistic stemmer. */
export function stem(word: string): string {
  let w = wordKey(word);
  if (w.length > 4 && w.endsWith('ies')) w = w.slice(0, -3) + 'y';
  else if (w.length > 4 && /(ss|x|ch|sh|z)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  for (const suffix of ['ing', 'ed', 'est', 'er', 'ly']) {
    if (w.length - suffix.length >= 3 && w.endsWith(suffix)) {
      w = w.slice(0, -suffix.length);
      if (/([bdgklmnprt])\1$/.test(w)) w = w.slice(0, -1); // running -> run, bigger -> big
      if (suffix !== 'ly' && w.endsWith('i')) w = w.slice(0, -1) + 'y'; // happier -> happy
      break;
    }
  }
  return w.replace(/e$/, ''); // baked/bake, rider/ride
}

export function validateClue(rawWord: unknown, rawCount: unknown, unrevealedWords: readonly string[], revealedWords: readonly string[] = []): ClueCheck {
  if (typeof rawWord !== 'string' || !rawWord.trim()) return { ok: false, reason: 'Enter a clue word.' };
  const word = cleanClueWord(rawWord);
  if (!word) return { ok: false, reason: 'A clue is one word: letters, digits, apostrophes or hyphens, no spaces.' };

  let count: ClueCount;
  if (rawCount === null) count = null;
  else if (typeof rawCount === 'number' && Number.isInteger(rawCount) && rawCount >= 0 && rawCount <= MAX_CLUE_NUMBER) count = rawCount;
  else return { ok: false, reason: `The number must be 0 to ${MAX_CLUE_NUMBER}, or unlimited.` };

  const key = wordKey(word);
  const s = stem(word);
  const warnings: string[] = [];
  for (const board of unrevealedWords) {
    const bk = wordKey(board);
    if (bk === key) return { ok: false, reason: `${board} is on the board.` };
    if (stem(board) === s) return { ok: false, reason: `Too close to ${board}: another form of a board word.` };
    const shorter = bk.length < key.length ? bk : key;
    if (shorter.length >= 4 && (key.includes(bk) || bk.includes(key))) warnings.push(`Contains or is part of ${board}. Allowed only if it is not a compound of the board word.`);
  }
  for (const board of revealedWords) if (wordKey(board) === key) warnings.push(`${board} is already revealed; that is allowed.`);
  if (/\d/.test(word)) warnings.push('Numbers in clues should refer to meaning, not to card positions or letter counts.');
  return { ok: true, word, count, warnings };
}
