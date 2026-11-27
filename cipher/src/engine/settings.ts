/**
 * What a match actually runs with. Room settings keep exactly what the host chose (nothing is silently
 * rewritten); Classic and Duet use fixed standard rules, Custom uses the host's choices. Shared by the
 * lobby UI (preview, validation messages) and the authoritative server (start, validation).
 */
import { BOARD_SIZES, DEFAULT_DIFFICULTY, DEFAULT_PACKS, DUET, DUET_TOKEN_CHOICES, TIMER_CHOICES, competitiveLayout, moleRange, type CompetitiveLayout } from '../shared/config.ts';
import type { BoardSize, Difficulty, MatchRules, ModeKind, RoomSettings, TimerSettings, WordPackId } from '../shared/types.ts';
import { MODES, type ModeDefinition } from './modes/index.ts';

/** Rules definition for the room: Custom cooperative plays by Duet's seating and start rules. */
export function modeRules(s: RoomSettings): ModeDefinition {
  return s.mode === 'custom' && s.customKind === 'cooperative' ? MODES.duet : MODES[s.mode];
}
export const kindOf = (s: RoomSettings): ModeKind => modeRules(s).kind;

export interface EffectiveSettings {
  kind: ModeKind;
  size: BoardSize;
  /** Competitive only. */
  layout: CompetitiveLayout | null;
  packs: WordPackId[];
  difficulty: Difficulty;
  rules: MatchRules;
  timer: TimerSettings;
}

const STANDARD_RULES: MatchRules = { suggestions: true, bonusGuess: true, specialClues: true, tokens: DUET.turns };

export function effectiveSettings(s: RoomSettings): EffectiveSettings {
  const kind = kindOf(s);
  if (s.mode !== 'custom') {
    return {
      kind,
      size: 5,
      layout: kind === 'competitive' ? competitiveLayout(5, null) : null,
      packs: [...DEFAULT_PACKS],
      difficulty: DEFAULT_DIFFICULTY,
      rules: { ...STANDARD_RULES },
      timer: s.timer,
    };
  }
  if (kind === 'cooperative') {
    return { kind, size: DUET.size, layout: null, packs: s.wordPacks, difficulty: s.difficulty, rules: { ...STANDARD_RULES, suggestions: s.suggestions, tokens: s.duetTokens }, timer: s.timer };
  }
  return {
    kind,
    size: s.boardSize,
    layout: layoutFor(s),
    packs: s.wordPacks,
    difficulty: s.difficulty,
    rules: { suggestions: s.suggestions, bonusGuess: s.bonusGuess, specialClues: s.specialClues, tokens: DUET.turns },
    timer: s.timer,
  };
}

/** Custom competitive card distribution: manual if set, otherwise balanced for the board and mole count. */
export function layoutFor(s: RoomSettings): CompetitiveLayout {
  const cards = s.boardSize * s.boardSize;
  if (s.manualLayout) return { cards, ...s.manualLayout };
  return competitiveLayout(s.boardSize, s.moles ?? moleRange().standard);
}

/** Problems with a manual distribution for a board (empty when valid). */
export function manualLayoutProblems(m: { starting: number; second: number; civilians: number; moles: number }, size: BoardSize): string[] {
  const out: string[] = [];
  const r = moleRange();
  const cards = size * size;
  if (![m.starting, m.second, m.civilians, m.moles].every(Number.isInteger)) return ['Card counts must be whole numbers.'];
  if (m.starting < 1 || m.second < 1) out.push('Both teams need at least one agent.');
  if (m.civilians < 0) out.push('Civilians cannot be negative.');
  if (m.moles < r.min || m.moles > r.max) out.push(`Assassins must be between ${r.min} and ${r.max}.`);
  const total = m.starting + m.second + m.civilians + m.moles;
  if (total !== cards) out.push(`The distribution adds up to ${total} cards, but a ${size}×${size} board has ${cards}.`);
  return out;
}

/** Value checks for a settings patch (server rejects a bad value instead of storing or clamping it). */
export function settingValueProblem(key: string, value: unknown): string | null {
  switch (key) {
    case 'boardSize': return BOARD_SIZES.includes(value as BoardSize) ? null : 'Board size must be 5×5 to 10×10.';
    case 'moles': return value === null || (Number.isInteger(value) && (value as number) >= moleRange().min && (value as number) <= moleRange().max) ? null : `Assassins must be between ${moleRange().min} and ${moleRange().max}.`;
    case 'duetTokens': return DUET_TOKEN_CHOICES.includes(value as number) ? null : 'Turn tokens must be 9, 10 or 11.';
    case 'timer': {
      const t = value as TimerSettings;
      return TIMER_CHOICES.includes(t?.clueSeconds) && TIMER_CHOICES.includes(t?.guessSeconds) ? null : 'Timer must be Off, 30, 60, 90 or 120 seconds.';
    }
    default: return null;
  }
}
