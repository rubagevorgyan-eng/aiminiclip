import type { CSSProperties } from 'react';

/* 11x9 pixel cut gem: crown, girdle, pavilion. o = body, h = lit facet, d = shaded facet. Tinted by `color`. */
const ROWS = [
  '..hhhoooo..',
  '.hhooooodd.',
  'hhooooooodd',
  'hoooooooood',
  '.hoooooodd.',
  '..hoooodd..',
  '...hoodd...',
  '....hdd....',
  '.....d.....',
];
const RECTS = ROWS.flatMap((row, y) => [...row].map((c, x) => ({ c, x, y }))).filter((p) => p.c !== '.');

export function Gem({ color, size = 24, dim = false, title }: { color: string; size?: number; dim?: boolean; title?: string }) {
  return (
    <svg
      className="gem"
      viewBox="0 0 11 9"
      width={size}
      height={(size * 9) / 11}
      style={{ '--g': color, opacity: dim ? 0.28 : 1 } as CSSProperties}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {RECTS.map(({ c, x, y }) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" className={`gem-${c}`} />
      ))}
    </svg>
  );
}
