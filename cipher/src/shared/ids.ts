import { ROOM_CODE } from './config.ts';
import { randomId, randomString } from './random.ts';
import type { MatchId, MessageId, PlayerId, RoomCode } from './types.ts';

export const newRoomCode = (): RoomCode => randomString(ROOM_CODE.length, ROOM_CODE.alphabet);
export const newPlayerId = (): PlayerId => `p_${randomId()}`;
export const newMatchId = (): MatchId => `m_${randomId()}`;
export const newMessageId = (): MessageId => `c_${randomId()}`;

/** Upper-cases and strips spaces/dashes; returns null if it can't be a room code. */
export function normalizeRoomCode(input: string): RoomCode | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== ROOM_CODE.length) return null;
  for (const ch of code) if (!ROOM_CODE.alphabet.includes(ch)) return null;
  return code;
}
