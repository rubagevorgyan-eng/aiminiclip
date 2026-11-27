import type { ReactNode } from 'react';
import { MODES } from '../../engine/modes/index.ts';
import type { RoomSettings } from '../../shared/types.ts';
import { IconButton } from './Button.tsx';
import { IconCopy } from './Icons.tsx';

/** Top bar of a room: code (copyable), mode, board, timer, and a slot for view toggles. */
export function RoomControls({ code, settings, onCopy, children }: { code: string; settings: RoomSettings; onCopy: () => void; children?: ReactNode }) {
  const timer = settings.timer.guessSeconds ?? settings.timer.clueSeconds;
  return (
    <div className="roombar panel">
      <div className="roombar__code">
        <span className="eyebrow">Room</span>
        <span className="mono roombar__value">{code}</span>
        <IconButton label="Copy invite link" onClick={onCopy}>
          <IconCopy />
        </IconButton>
      </div>
      <div className="roombar__info">
        <span className="chip">{MODES[settings.mode].label}</span>
        <span className="chip">{settings.boardSize}×{settings.boardSize}</span>
        <span className="chip">{timer ? `${timer}s` : 'No timer'}</span>
      </div>
      <div className="roombar__tools">{children}</div>
    </div>
  );
}
