import { playClick } from '../../audio/sfx.ts';
import { updateSettings, useSettings } from '../../storage/settings.ts';

export function SoundToggle() {
  const { sound } = useSettings();
  return (
    <button
      type="button"
      className="icon-btn"
      aria-pressed={sound}
      aria-label="Sound effects"
      title={sound ? 'Sound on' : 'Sound off'}
      onClick={() => {
        updateSettings({ sound: !sound });
        if (!sound) playClick();
      }}
    >
      <svg viewBox="0 0 10 9" width="18" height="18" shapeRendering="crispEdges" aria-hidden="true">
        <path fill="currentColor" d="M0 3h2l3-3v9L2 6H0z" />
        {sound ? <path fill="currentColor" d="M6 3h1v3H6zM8 1h1v7H8z" /> : <path fill="currentColor" d="M6 3h1v1H6zM8 3h1v1H8zM7 4h1v1H7zM6 5h1v1H6zM8 5h1v1H8z" />}
      </svg>
    </button>
  );
}
