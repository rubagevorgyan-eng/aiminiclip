import { DUET, SIDE_LABEL } from '../../shared/config.ts';
import type { Player, RoomSettings } from '../../shared/types.ts';
import type { ModeDefinition } from './types.ts';

/** Cooperative: Partner A and Partner B each hold one side of the key, against a clue-turn budget. */
export const duet: ModeDefinition = {
  id: 'duet',
  kind: 'cooperative',
  label: 'Duet',
  summary: 'Cooperative play',
  blurb: 'Two partners, two halves of one key. Find every agent before time runs out.',
  sizes: [DUET.size],
  minPlayers: 2,
  configurable: false,
  normalizeSettings: (settings: RoomSettings): RoomSettings => ({ ...settings, mode: 'duet' }),
  startBlockers(players: readonly Player[]) {
    const out: string[] = [];
    for (const side of ['north', 'south'] as const) {
      if (!players.some((p) => p.side === side && p.role !== 'spectator')) out.push(`${SIDE_LABEL[side]} needs at least one player.`);
    }
    return out;
  },
};
