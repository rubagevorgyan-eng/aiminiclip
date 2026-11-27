import { wordKey } from '../shared/text.ts';
import type { WordPackId } from '../shared/types.ts';
import type { BankFile, VocabularyBank, VocabularyEntry, WordDifficulty, SafetyClass, VocabSource, VocabCategory } from './types.ts';

const DIFF: Record<string, WordDifficulty> = { e: 'easy', m: 'medium', h: 'hard' };
const SAFE: Record<string, SafetyClass> = { s: 'safe', x: 'sensitive' };
const SRC: Record<string, VocabSource> = { w: 'wordnet', d: 'wikidata', c: 'cipher' };

/** Expands the compact bank file. Server-side only (the client never loads the vocabulary). */
export function loadBank(file: BankFile): VocabularyBank {
  const entries: VocabularyEntry[] = file.rows.map(([word, group, category, tags, d, s, src]) => {
    const normalized = wordKey(word);
    return {
      id: `w_${normalized}`,
      word,
      normalized,
      group,
      category,
      tags: tags ? (tags.split(',') as VocabCategory[]) : [],
      difficulty: DIFF[d],
      language: 'en',
      safety: SAFE[s],
      source: SRC[src],
    };
  });
  return { version: file.version, entries };
}

/** Whether an entry belongs to any of the given packs (primary category or tag). */
export const inPacks = (e: VocabularyEntry, packs: ReadonlySet<WordPackId>) => packs.has(e.category) || e.tags.some((t) => packs.has(t));
