import type { RarityId } from '../config/game.ts';

export interface Answer {
  /** Canonical display name. */
  name: string;
  /** Other accepted spellings, abbreviations and alternative names. */
  aliases?: string[];
  rarity: RarityId;
}

/** Question listing entry (no answers): what selection needs. */
export interface QuestionMeta {
  id: string;
  text: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  /** Template family (e.g. "geo-city"); no two questions of one family in a game. */
  family: string;
  /** Number of accepted answers. */
  n: number;
}

export interface Question extends QuestionMeta {
  answers: Answer[];
  /** Words ignored when matching, e.g. ["penguin"] so "Emperor penguin" = "Emperor". */
  ignore?: string[];
  /** Known wrong answers that must never be accepted, even as a near-miss. */
  reject?: string[];
}
