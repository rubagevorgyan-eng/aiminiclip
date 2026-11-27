import type { ModeId } from '../../shared/types.ts';
import { classic } from './classic.ts';
import { custom } from './custom.ts';
import { duet } from './duet.ts';
import type { ModeDefinition } from './types.ts';

export type { ModeDefinition } from './types.ts';

export const MODES: Record<ModeId, ModeDefinition> = { classic, duet, custom };
export const MODE_ORDER: readonly ModeId[] = ['classic', 'duet', 'custom'];
export const isModeId = (v: unknown): v is ModeId => typeof v === 'string' && v in MODES;
