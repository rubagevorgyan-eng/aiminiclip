import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import type { BoardSize } from '../../shared/types.ts';

/**
 * Board grid for 5×5 to 10×10 (always size × size). `zoom` 1 fits the available width; higher values
 * enlarge cards and the frame scrolls (both axes) so words stay readable on large boards and phones.
 * Arrow keys move focus across cards (Home/End: row start/end); Enter or Space selects.
 */
export function Board({ size, zoom = 1, label, children }: { size: BoardSize; zoom?: number; label: string; children: ReactNode }) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: size, ArrowUp: -size };
    const cards = [...e.currentTarget.querySelectorAll<HTMLElement>(':scope > .card')];
    const i = cards.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    let next = -1;
    if (e.key in step) next = i + step[e.key];
    else if (e.key === 'Home') next = i - (i % size);
    else if (e.key === 'End') next = i - (i % size) + size - 1;
    if (next < 0 || next >= cards.length) return;
    e.preventDefault();
    cards[next].focus();
    cards[next].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  return (
    <div className="board-frame" data-size={size} style={{ '--cols': size, '--zoom': zoom } as CSSProperties}>
      <div className="board" role="group" aria-label={`${label}. Use arrow keys to move between cards.`} onKeyDown={onKeyDown}>
        {children}
      </div>
    </div>
  );
}

/** Zoom steps offered on large boards. */
export const ZOOM_STEPS = [1, 1.25, 1.5, 2] as const;
export const needsZoom = (size: BoardSize) => size >= 7;
