import { BOARD_SIZES } from '../../shared/config.ts';
import { competitiveMode } from './competitive.ts';

export const custom = competitiveMode('custom', 'Custom', 'Configurable game rules', 'Two bureaus, your rules: board from 5×5 to 10×10, word packs, difficulty, moles and timers.', BOARD_SIZES, true);
