import type { VocabCategory, WordPackId } from '../shared/types.ts';

export type { VocabCategory };
export type WordDifficulty = 'easy' | 'medium' | 'hard';
/** `safe`: default boards. `sensitive`: kept for review but never drawn (e.g. religious figures). Blocked words are not imported at all. */
export type SafetyClass = 'safe' | 'sensitive';
export type VocabSource = 'wordnet' | 'wikidata' | 'cipher';

export interface VocabularyEntry {
  /** Stable id: `w_` + normalized form. */
  id: string;
  /** Display form, upper case. */
  word: string;
  /** Comparison key: lower case, no accents or punctuation (`wordKey`). */
  normalized: string;
  /** Root / variation group (`stem`): two words of one group never share a board. */
  group: string;
  /** Primary pack: a vocabulary category, or 'custom' for a room's imported list. */
  category: WordPackId;
  /** Extra packs the word also belongs to (e.g. a film title that is also a general word). */
  tags: VocabCategory[];
  difficulty: WordDifficulty;
  language: 'en';
  safety: SafetyClass;
  source: VocabSource;
}

/**
 * On-disk bank (src/vocab/data/bank.json), compact rows to keep the server bundle small:
 * [word, group, category, tags ("a,b"), difficulty (e|m|h), safety (s|x), source (w|d|c)]
 * The normalized form and id are recomputed on load (and verified by tests).
 */
export type BankRow = [string, string, VocabCategory, string, 'e' | 'm' | 'h', 's' | 'x', 'w' | 'd' | 'c'];
export interface BankFile {
  version: string;
  language: 'en';
  generatedAt: string;
  rows: BankRow[];
}

export interface VocabularyBank {
  version: string;
  entries: VocabularyEntry[];
}
