/** Minimal line icons (24px grid, 1.6 stroke). Decorative: callers provide the accessible label. */
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const icon = (d: string) => () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} {...P} />
  </svg>
);

export const IconChat = icon('M4 5h16v11H9l-5 4z');
export const IconLog = icon('M6 4h12v16H6zM9 8h6M9 12h6M9 16h4');
export const IconFocus = icon('M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5');
export const IconZoomIn = icon('M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20M10.5 7.5v6M7.5 10.5h6');
export const IconZoomOut = icon('M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20M7.5 10.5h6');
export const IconCopy = icon('M8 8h11v11H8zM5 16V5h11');
export const IconClose = icon('M6 6l12 12M18 6 6 18');
export const IconPause = icon('M9 5v14M15 5v14');
export const IconPlay = icon('M8 5l11 7-11 7z');
export const IconExit = icon('M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10');
export const IconUsers = icon('M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14c1.9.8 3 2.9 3 6');
export const IconSend = icon('M4 12l16-8-6 16-2-6z');
export const IconGear = icon('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z');
