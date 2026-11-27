import { LIMITS } from './config.ts';

/** Control, zero-width, line-separator and bidi-override characters. */
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g;

/** Collapses whitespace, removes control characters and trims to `max` characters. */
export function cleanText(input: unknown, max: number): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(INVISIBLE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export const cleanName = (input: unknown) => cleanText(input, LIMITS.nameLength);
export const cleanChat = (input: unknown) => cleanText(input, LIMITS.chatLength);

/** Key used to compare words: case, accents and punctuation ignored. */
export function wordKey(word: string): string {
  return word
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** A clue is one word (letters, digits, apostrophes or hyphens). Board-word checks come with the engine. */
export function cleanClueWord(input: unknown): string | null {
  const word = cleanText(input, LIMITS.clueLength).toUpperCase();
  return /^[\p{L}\p{N}][\p{L}\p{N}'-]*$/u.test(word) ? word : null;
}
