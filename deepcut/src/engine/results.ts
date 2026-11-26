import { BRAND, GAME, ZONES, rarityIndex, zoneIndexForDepth } from '../config/game.ts';
import type { RoundRecord } from './machine.ts';
import type { Answer, Question } from './types.ts';

/** Achievement title and deepest zone for a final depth. */
export function achievement(depth: number) {
  const zone = ZONES[zoneIndexForDepth(depth)];
  return { title: zone.title, zone: zone.name };
}

/** The highest-rarity correct answer (earliest wins ties), or null if none. */
export function rarestRecord(records: RoundRecord[]): RoundRecord | null {
  let best: RoundRecord | null = null;
  for (const r of records) if (r.rarity && (!best || rarityIndex(r.rarity) > rarityIndex(best.rarity!))) best = r;
  return best;
}

/** A few other valid answers spanning rarities (rarest, middle, most common), excluding the player's. */
export function otherAnswers(q: Question, exclude?: string, n = 3): Answer[] {
  const pool = q.answers.filter((a) => a.name !== exclude).sort((a, b) => rarityIndex(b.rarity) - rarityIndex(a.rarity));
  if (pool.length <= n) return pool;
  const picks = [0, Math.floor((pool.length - 1) / 2), pool.length - 1].map((i) => pool[i]);
  return [...new Set(picks)].slice(0, n);
}

/** Spoiler-free indicator per round: one square per rarity, black for a miss. */
export const SHARE_SQUARES = ['🟫', '🟧', '⬜', '🟨', '🟩', '🟦'] as const;
export const SHARE_MISS = '⬛';

export interface ShareInput {
  mode: 'daily' | 'unlimited';
  dailyNumber?: number;
  date?: string;
  records: RoundRecord[];
  score: number;
}

/** Share text: mode, daily date, depth, title, seven squares. Never includes questions or answers. */
export function shareText({ mode, dailyNumber, date, records, score }: ShareInput): string {
  const head = mode === 'daily' ? `${BRAND.name} Daily #${dailyNumber} · ${date}` : `${BRAND.name} Unlimited`;
  const squares = records.map((r) => (r.rarity ? SHARE_SQUARES[rarityIndex(r.rarity)] : SHARE_MISS)).join('');
  return [head, `Depth: ${score}m / ${GAME.maxScore}m`, `Rank: ${achievement(score).title}`, squares, BRAND.tagline].join('\n');
}
