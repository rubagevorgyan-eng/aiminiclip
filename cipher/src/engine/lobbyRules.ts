import { WORD_PACKS } from '../shared/config.ts';
import { effectiveSettings, manualLayoutProblems, modeRules, settingValueProblem } from './settings.ts';
import summary from '../vocab/data/summary.json' with { type: 'json' };
import type { Player, RoomSettings } from '../shared/types.ts';

/**
 * Start conditions, shared by the room server (which enforces them) and the lobby UI
 * (which explains why Start is disabled). Works on public data only.
 */
export function settingsProblems(s: RoomSettings): string[] {
  const out: string[] = [];
  const e = effectiveSettings(s);
  const cards = e.size * e.size;
  if (s.mode === 'custom') {
    for (const [k, v] of [['boardSize', s.boardSize], ['moles', s.moles], ['duetTokens', s.duetTokens], ['timer', s.timer]] as const) {
      const p = settingValueProblem(k, v);
      if (p) out.push(p);
    }
    if (e.kind === 'competitive' && s.manualLayout) out.push(...manualLayoutProblems(s.manualLayout, s.boardSize));
  }
  if (e.packs.length === 0) out.push('Choose at least one word pack.');
  if (e.packs.some((id) => id !== 'custom' && !WORD_PACKS.some((p) => p.id === id))) out.push('Unknown word pack selected.');
  const customOn = e.packs.includes('custom');
  if (customOn && s.customWords.length === 0) out.push('The Custom list pack is selected but no words were imported.');
  // Early warning (an upper bound: packs overlap). The server checks the exact pool at start.
  const available = e.packs.reduce((n, id) => n + (id === 'custom' ? s.customWords.length : packSize(id) ?? 0), 0);
  if (e.packs.length && available < cards) out.push(`The selected word packs have ${customOn && e.packs.length === 1 ? '' : 'about '}${available} words; a ${e.size}×${e.size} board needs ${cards}. Add packs or words.`);
  return out;
}

export function startBlockers(settings: RoomSettings, players: readonly Player[]): string[] {
  const out = [...modeRules(settings).startBlockers(players), ...settingsProblems(settings)];
  if (!settings.spectatorsAllowed && players.some((p) => p.role === 'spectator')) out.push('Spectators are off: everyone must take a seat or be removed.');
  return out;
}

/** Safe words available in a pack, from the generated bank summary. */
export function packSize(id: string): number | undefined {
  return (summary.byCategory as Record<string, { packSize: number }>)[id]?.packSize;
}
