/**
 * Host-imported custom word lists. Shared by the lobby (live preview of what will be kept) and the
 * server (which re-sanitizes whatever it receives). Words are cleaned, upper-cased, de-duplicated,
 * length-limited and passed through the same safety blocklist as the built-in vocabulary.
 */
import { stem } from '../engine/clues.ts';
import { CUSTOM_WORDS } from '../shared/config.ts';
import { cleanText, wordKey } from '../shared/text.ts';
import blocklist from './data/blocklist.json' with { type: 'json' };
import type { VocabularyEntry } from './types.ts';

const BLOCKED = new Set(blocklist.words);
const BLOCKED_GROUPS = new Set(blocklist.groups);
const WORD = /^[\p{L}\p{N}][\p{L}\p{N}'-]*$/u;

export interface CustomWordReport {
  received: number;
  kept: number;
  invalid: number; // wrong characters, spaces or length
  duplicates: number;
  blocked: number;
  overLimit: number;
}

/** Splits pasted text or a file into candidate words (lines, commas, semicolons, tabs). */
export const splitWordList = (text: string) => text.split(/[\n\r,;\t]+/).map((w) => w.trim()).filter(Boolean);

export function sanitizeCustomWords(input: readonly unknown[]): { words: string[]; report: CustomWordReport } {
  const report: CustomWordReport = { received: input.length, kept: 0, invalid: 0, duplicates: 0, blocked: 0, overLimit: 0 };
  const seen = new Set<string>();
  const words: string[] = [];
  for (const raw of input.slice(0, CUSTOM_WORDS.maxWords * 4)) {
    const w = cleanText(raw, 64).normalize('NFC').toUpperCase();
    const key = wordKey(w);
    if (!w || !WORD.test(w) || w.length < CUSTOM_WORDS.minLength || w.length > CUSTOM_WORDS.maxLength || key.length < CUSTOM_WORDS.minLength) {
      report.invalid++;
      continue;
    }
    if (BLOCKED.has(key) || BLOCKED_GROUPS.has(stem(w))) {
      report.blocked++;
      continue;
    }
    if (seen.has(key)) {
      report.duplicates++;
      continue;
    }
    if (words.length >= CUSTOM_WORDS.maxWords) {
      report.overLimit++;
      continue;
    }
    seen.add(key);
    words.push(w);
  }
  report.overLimit += Math.max(0, input.length - CUSTOM_WORDS.maxWords * 4);
  report.kept = words.length;
  return { words, report };
}

/** Turns a sanitized list into board-ready entries for the 'custom' pack (difficulty-neutral). */
export function customEntries(words: readonly string[]): VocabularyEntry[] {
  return words.map((word) => {
    const normalized = wordKey(word);
    return { id: `c_${normalized}`, word, normalized, group: stem(word), category: 'custom', tags: [], difficulty: 'medium', language: 'en', safety: 'safe', source: 'cipher' };
  });
}
