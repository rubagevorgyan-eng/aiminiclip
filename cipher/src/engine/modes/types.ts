import type { BoardSize, ModeId, ModeKind, Player, RoomSettings } from '../../shared/types.ts';

/**
 * What differs between Classic, Duet and Custom. Everything else (turns, reveals, projection,
 * history, chat, lobby seating) is shared code that reads these definitions.
 */
export interface ModeDefinition {
  id: ModeId;
  kind: ModeKind;
  label: string;
  /** One-line summary for menus. */
  summary: string;
  blurb: string;
  /** Board sizes the room may pick; the first is the default. */
  sizes: readonly BoardSize[];
  minPlayers: number;
  /** Whether the room may change word packs, difficulty and mole count. */
  configurable: boolean;
  /** Coerces settings into what this mode supports (e.g. Duet is always 5×5). */
  normalizeSettings(settings: RoomSettings): RoomSettings;
  /** Every reason the match can't start yet (empty when it can). */
  startBlockers(players: readonly Player[]): string[];
}
