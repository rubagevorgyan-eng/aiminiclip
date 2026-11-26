import { useEffect, useId, useRef, useState } from 'react';
import { playClick } from '../../audio/sfx.ts';
import { updateSettings, useSettings } from '../../storage/settings.ts';

/** Header settings: reduce motion (persisted) and, during a dig, abandon it. */
export function SettingsMenu({ onQuit, quitLabel = 'Abandon dig', quitHint = 'Back to the surface, no score' }: { onQuit?: () => void; quitLabel?: string; quitHint?: string }) {
  const [open, setOpen] = useState(false);
  const { reduceMotion, sound } = useSettings();
  const box = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="settings" ref={box}>
      <button type="button" className="icon-btn" aria-label="Settings" aria-expanded={open} aria-controls={id} onClick={() => { playClick(); setOpen((o) => !o); }}>
        <svg viewBox="0 0 9 9" width="18" height="18" shapeRendering="crispEdges" aria-hidden="true">
          <path fill="currentColor" d="M3 0h3v1h1v1h1v1h1v3H8v1H7v1H6v1H3V8H2V7H1V6H0V3h1V2h1V1h1zM3 3v3h3V3z" />
        </svg>
      </button>
      {open && (
        <div className="settings-menu panel" id={id} role="group" aria-label="Settings">
          <label className="settings-row">
            <span>
              Reduce motion
              <small className="dim">Also follows your system setting</small>
            </span>
            <input type="checkbox" className="switch" checked={reduceMotion} onChange={(e) => updateSettings({ reduceMotion: e.target.checked })} />
          </label>
          <label className="settings-row">
            <span>
              Sound effects
              <small className="dim">Synthesized, no downloads</small>
            </span>
            <input type="checkbox" className="switch" checked={sound} onChange={(e) => updateSettings({ sound: e.target.checked })} />
          </label>
          {onQuit && (
            <button type="button" className="settings-row settings-quit" onClick={() => { setOpen(false); onQuit(); }}>
              {quitLabel}
              <small className="dim">{quitHint}</small>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
