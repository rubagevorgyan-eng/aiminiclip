/**
 * Board word generator (server-side). Picks S×S words for a room from the chosen packs and difficulty,
 * with no duplicate words, no two words of one variation group, and no word containing another
 * (SNOW / SNOWMAN). Words are drawn at random; identities are assigned later and independently by the
 * engine, so meaning never influences who owns a card. Related meanings are left alone on purpose:
 * they are what makes good clues.
 */
import { DIFFICULTIES } from '../shared/config.ts';
import { shuffle, type Rng } from '../shared/random.ts';
import type { BoardSize, Difficulty, WordPackId } from '../shared/types.ts';
import { inPacks } from './bank.ts';
import type { VocabularyBank, VocabularyEntry, WordDifficulty } from './types.ts';

export interface BoardRequest {
  size: BoardSize;
  packs: readonly WordPackId[];
  difficulty: Difficulty;
  /** Ids used on recent boards in this room; avoided while the pool allows. */
  recent?: readonly string[];
}

export interface BoardWords {
  entries: VocabularyEntry[];
  /** Plain-language notes when the generator had to relax a preference (never correctness). */
  notes: string[];
}

export class BoardError extends Error {
  readonly code = 'insufficient_words';
  constructor(message: string) {
    super(message);
  }
}

const TIERS: readonly WordDifficulty[] = ['easy', 'medium', 'hard'];

/** Per-tier counts for `cards`, using the difficulty mix and largest remainders (sums exactly to `cards`). */
export function tierCounts(cards: number, difficulty: Difficulty): Record<WordDifficulty, number> {
  const mix = DIFFICULTIES.find((d) => d.id === difficulty)?.mix;
  if (!mix) throw new BoardError(`Unknown difficulty "${difficulty}".`);
  const raw = TIERS.map((t) => (cards * mix[t]) / 100);
  const counts = raw.map(Math.floor);
  let left = cards - counts.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).filter(([, i]) => mix[TIERS[i]] > 0).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) counts[order[k][1]]++;
  return { easy: counts[0], medium: counts[1], hard: counts[2] };
}

/** Two entries may not share a board: same word, same root group, or one contains the other (4+ letters). */
export function conflicts(a: VocabularyEntry, b: VocabularyEntry): boolean {
  if (a.normalized === b.normalized || a.group === b.group) return true;
  const [short, long] = a.normalized.length <= b.normalized.length ? [a.normalized, b.normalized] : [b.normalized, a.normalized];
  return short.length >= 4 && long.includes(short);
}

export function generateBoardWords(bank: VocabularyBank, req: BoardRequest, rng: Rng): BoardWords {
  const cards = req.size * req.size;
  if (req.packs.length === 0) throw new BoardError('Choose at least one word pack.');
  const packs = new Set(req.packs);
  const pool = bank.entries.filter((e) => e.safety === 'safe' && inPacks(e, packs));
  if (pool.length < cards) {
    throw new BoardError(`The selected packs have ${pool.length} words, but a ${req.size}×${req.size} board needs ${cards}. Add more word packs.`);
  }

  // A custom-only list has no difficulty tiers: draw from it evenly.
  const customOnly = req.packs.every((p) => p === 'custom');
  const want = customOnly ? { easy: 0, medium: cards, hard: 0 } : tierCounts(cards, req.difficulty);
  const recent = new Set(req.recent ?? []);
  const notes: string[] = [];
  const picked: VocabularyEntry[] = [];
  const fits = (e: VocabularyEntry) => !picked.some((p) => conflicts(p, e));
  const take = (candidates: VocabularyEntry[], n: number) => {
    let got = 0;
    for (const e of candidates) {
      if (got >= n) break;
      if (fits(e)) {
        picked.push(e);
        got++;
      }
    }
    return got;
  };

  // Fill each tier: fresh words first, then recently used ones if the tier runs short.
  const shortfall: Record<WordDifficulty, number> = { easy: 0, medium: 0, hard: 0 };
  for (const tier of TIERS) {
    if (want[tier] === 0) continue;
    const tierPool = shuffle(pool.filter((e) => e.difficulty === tier), rng);
    let got = take(tierPool.filter((e) => !recent.has(e.id)), want[tier]);
    if (got < want[tier]) {
      const reused = take(tierPool.filter((e) => recent.has(e.id)), want[tier] - got);
      if (reused) notes.push(`Reused ${reused} recent ${tier} word${reused > 1 ? 's' : ''}; the selected packs are small.`);
      got += reused;
    }
    shortfall[tier] = want[tier] - got;
  }

  // A tier the packs cannot fill borrows from the nearest tiers of the same packs (never other packs).
  const missing = shortfall.easy + shortfall.medium + shortfall.hard;
  if (missing > 0) {
    const order: Record<WordDifficulty, WordDifficulty[]> = { easy: ['medium', 'hard'], medium: ['easy', 'hard'], hard: ['medium', 'easy'] };
    for (const tier of TIERS) {
      let need = shortfall[tier];
      for (const alt of order[tier]) {
        if (need === 0) break;
        const alts = shuffle(pool.filter((e) => e.difficulty === alt && !picked.includes(e)), rng);
        need -= take([...alts.filter((e) => !recent.has(e.id)), ...alts.filter((e) => recent.has(e.id))], need);
      }
      if (shortfall[tier] > need) notes.push(`Not enough ${tier} words in the selected packs; used ${shortfall[tier] - need} from neighbouring difficulty.`);
      shortfall[tier] = need;
    }
  }
  if (picked.length < cards) {
    throw new BoardError(`Could not find ${cards} distinct, non-conflicting words in the selected packs (found ${picked.length}). Add more word packs.`);
  }
  return { entries: shuffle(picked, rng), notes };
}

/** Room memory of recent boards: keep the last few boards' ids (bounded). */
export function rememberBoard(recent: readonly string[], entries: readonly VocabularyEntry[], keepBoards = 3, boardCards = entries.length): string[] {
  return [...recent, ...entries.map((e) => e.id)].slice(-keepBoards * Math.max(25, boardCards));
}
