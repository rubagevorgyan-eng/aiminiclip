/** Server-side vocabulary entry point. The client never imports this (the bank stays off the client). */
import bankFile from './data/bank.json' with { type: 'json' };
import { loadBank } from './bank.ts';
import type { BankFile, VocabularyBank } from './types.ts';

let cached: VocabularyBank | null = null;
export function defaultBank(): VocabularyBank {
  cached ??= loadBank(bankFile as BankFile);
  return cached;
}
export { generateBoardWords, BoardError, tierCounts, conflicts, rememberBoard } from './board.ts';
