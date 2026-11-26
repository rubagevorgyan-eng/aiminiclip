import { BRAND } from '../../config/game.ts';
import { RecessLogo } from './RecessLogo.tsx';
import { SettingsMenu } from './SettingsMenu.tsx';
import { SoundToggle } from './SoundToggle.tsx';

/** Transparent bar over every screen: Recess logo (back to the site), sound, settings, Exit game. */
export function SiteHeader({ onQuit }: { onQuit?: () => void }) {
  return (
    <header className="site-header">
      <a className="site-logo" href={BRAND.siteUrl} aria-label="Recess home">
        <RecessLogo />
      </a>
      <div className="site-tools">
        <SoundToggle />
        <SettingsMenu onQuit={onQuit} />
        <a className="btn btn--secondary site-exit" href={BRAND.siteUrl}>
          Exit game
        </a>
      </div>
    </header>
  );
}
