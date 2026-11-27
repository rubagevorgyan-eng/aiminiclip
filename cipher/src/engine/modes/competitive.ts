import { TEAM_LABEL, TEAMS } from '../../shared/config.ts';
import type { BoardSize, ModeId, Player, RoomSettings } from '../../shared/types.ts';
import type { ModeDefinition } from './types.ts';

/** Shared by Classic and Custom: two teams, exactly one handler each, at least one operative each. */
export function competitiveMode(id: ModeId, label: string, summary: string, blurb: string, sizes: readonly BoardSize[], configurable: boolean): ModeDefinition {
  return {
    id,
    kind: 'competitive',
    label,
    summary,
    blurb,
    sizes,
    minPlayers: 4,
    configurable,
    // Settings are stored as the host chose them; what a match uses comes from effectiveSettings().
    normalizeSettings: (settings: RoomSettings): RoomSettings => ({ ...settings, mode: id }),
    startBlockers(players: readonly Player[]) {
      const out: string[] = [];
      for (const team of TEAMS) {
        const members = players.filter((p) => p.team === team && p.role !== 'spectator');
        const handlers = members.filter((p) => p.role === 'handler').length;
        if (handlers === 0) out.push(`${TEAM_LABEL[team]} needs a handler.`);
        if (handlers > 1) out.push(`${TEAM_LABEL[team]} has more than one handler.`);
        if (!members.some((p) => p.role === 'operative')) out.push(`${TEAM_LABEL[team]} needs at least one operative.`);
      }
      return out;
    },
  };
}
