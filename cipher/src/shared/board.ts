import { BOARD_SIZES } from './config.ts';
import type { BoardDimensions, BoardSize, CardIndex } from './types.ts';

export const isBoardSize = (n: unknown): n is BoardSize => BOARD_SIZES.includes(n as BoardSize);

export function dimensions(size: BoardSize): BoardDimensions {
  return { size, rows: size, cols: size, cards: size * size };
}

export const toCoords = (index: CardIndex, d: BoardDimensions) => ({ row: Math.floor(index / d.cols), col: index % d.cols });
export const toIndex = (row: number, col: number, d: BoardDimensions): CardIndex => row * d.cols + col;
export const isCardIndex = (n: unknown, d: BoardDimensions): n is CardIndex => Number.isInteger(n) && (n as number) >= 0 && (n as number) < d.cards;
