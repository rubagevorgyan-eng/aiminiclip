import type { RarityId } from '../config/game.ts';

export interface Answer {
  /** Canonical display name. */
  name: string;
  /** Other accepted spellings, abbreviations and alternative names. */
  aliases?: string[];
  rarity: RarityId;
}

export interface Question {
  id: string;
  text: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  answers: Answer[];
  /** Words ignored when matching, e.g. ["penguin"] so "Emperor penguin" = "Emperor". */
  ignore?: string[];
  /** Known wrong answers that must never be accepted, even as a near-miss. */
  reject?: string[];
}
