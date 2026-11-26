import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { playClick } from '../../audio/sfx.ts';
import { updateSettings, useSettings } from '../../storage/settings.ts';

/**
 * Speaker button + volume bar. Hovering or focusing the speaker slides the bar out; dragging it sets
 * the volume (a soft tick plays at the new level), clicking the speaker mutes / unmutes.
 * Touchscreens have no hover: the first tap opens the bar, the next tap mutes, tapping elsewhere closes it.
 */
export function SoundToggle() {
  const { sound, volume } = useSettings();
  const muted = !sound || volume <= 0;
  const pct = Math.round((muted ? 0 : volume) * 100);
  const level = muted ? 'muted' : volume < 0.5 ? 'low' : 'high';
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const openedByTap = useRef(false);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const toggle = () => {
    if (muted) {
      updateSettings({ sound: true, volume: volume > 0 ? volume : 0.5 });
      setTimeout(playClick, 0);
    } else updateSettings({ sound: false });
  };
  const setVolume = (v: number) => updateSettings({ volume: v / 100, sound: v > 0 });

  return (
    <div ref={box} className={`volume${open ? ' is-open' : ''}`} style={{ '--v': `${pct}%` } as CSSProperties}>
      <button
        type="button"
        className="icon-btn"
        aria-label={muted ? 'Unmute sound' : 'Mute sound'}
        title={muted ? 'Unmute' : 'Mute'}
        onPointerDown={(e) => {
          if (e.pointerType !== 'mouse' && !open) {
            openedByTap.current = true;
            setOpen(true);
          }
        }}
        onClick={() => {
          if (openedByTap.current) return void (openedByTap.current = false);
          toggle();
        }}
      >
        <svg viewBox="0 0 11 9" width="18" height="18" shapeRendering="crispEdges" aria-hidden="true">
          <path fill="currentColor" d="M0 3h2l3-3v9L2 6H0z" />
          {level === 'muted' && <path fill="currentColor" d="M7 2h1v1H7zM10 2h1v1h-1zM8 3h1v1H8zM9 3h1v1H9zM8.5 4h1v1h-1zM8 5h1v1H8zM9 5h1v1H9zM7 6h1v1H7zM10 6h1v1h-1z" />}
          {level !== 'muted' && <path fill="currentColor" d="M6 3h1v3H6z" />}
          {level === 'high' && <path fill="currentColor" d="M8 1h1v7H8z" />}
        </svg>
      </button>
      <div className="volume-bar">
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={pct}
          aria-label="Sound volume"
          aria-valuetext={muted ? 'Muted' : `${pct}%`}
          onChange={(e) => setVolume(Number(e.target.value))}
          onPointerUp={() => playClick()}
          onKeyUp={(e) => e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' ? playClick() : undefined}
        />
        <span className="volume-pct num" aria-hidden="true">{muted ? 'OFF' : pct}</span>
      </div>
    </div>
  );
}
