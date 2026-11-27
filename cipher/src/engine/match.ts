/** Mode dispatch: one entry point for the server, whichever engine owns the match. */
import { applyAction, expireTurn, type ActionContext, type Actor, type EngineAction, type EngineResult } from './competitive.ts';
import { applyDuetAction, expireDuetTurn } from './duet.ts';
import type { PrivateMatchState, RoomSettings, Timestamp } from '../shared/types.ts';

export function applyMatchAction(state: PrivateMatchState, actor: Actor, action: EngineAction, ctx: ActionContext): EngineResult {
  return state.key.kind === 'cooperative' ? applyDuetAction(state, actor, action, ctx) : applyAction(state, actor, action, ctx);
}

export function expireMatchTurn(state: PrivateMatchState, now: Timestamp, timer: RoomSettings['timer']): EngineResult | null {
  return state.key.kind === 'cooperative' ? expireDuetTurn(state, now, timer) : expireTurn(state, now, timer);
}
