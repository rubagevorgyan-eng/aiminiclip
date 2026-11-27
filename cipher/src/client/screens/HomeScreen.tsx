import { useEffect, useState } from 'react';
import { MODES, MODE_ORDER } from '../../engine/modes/index.ts';
import type { RoomService } from '../../net/service.ts';
import { BRAND } from '../../shared/config.ts';
import type { ModeId } from '../../shared/types.ts';
import { Button } from '../components/Button.tsx';
import { CodeRain } from '../fx/CodeRain.tsx';
import { CipherLogo } from '../components/CipherLogo.tsx';
import { Modal } from '../components/Modal.tsx';
import { Stamp } from '../components/Stamp.tsx';
import { loadRoomService } from '../services.ts';
import { HowToPlay } from './menu/HowToPlay.tsx';
import { CreateRoomDialog, JoinRoomDialog } from './menu/RoomDialogs.tsx';
import { SettingsDialog } from './menu/SettingsDialog.tsx';

type Dialog = 'create' | 'join' | 'how' | 'settings' | null;

/** Main menu: logo, tagline, the three modes, and Create / Join / How to play / Settings. */
export function HomeScreen() {
  const [mode, setMode] = useState<ModeId>('classic');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [service, setService] = useState<RoomService | null | undefined>(undefined);
  useEffect(() => void loadRoomService().then(setService), []);
  const close = () => setDialog(null);

  return (
    <div className="home">
      <header className="home__head">
        <CodeRain />
        <h1 className="home__title">
          <CipherLogo className="home__logo" decode />
        </h1>
        <p className="tagline">{BRAND.tagline}</p>
      </header>

      <div className="modes" role="radiogroup" aria-label="Game mode">
        {MODE_ORDER.map((id, i) => {
          const m = MODES[id];
          const on = id === mode;
          return (
            <button key={id} type="button" role="radio" aria-checked={on} className={`modecard ${on ? 'is-on' : ''}`} onClick={() => setMode(id)}>
              <span className="modecard__tab">FILE 0{i + 1}</span>
              <span className="modecard__stamp"><Stamp>{m.kind === 'cooperative' ? 'Co-op' : 'Versus'}</Stamp></span>
              <span className="modecard__num">{i + 1}.</span>
              <span className="modecard__title">{m.label}</span>
              <span className="modecard__summary">{m.summary}</span>
              <span className="modecard__blurb">{m.blurb}</span>
              <span className="modecard__meta">
                {m.sizes.length > 1 ? `${m.sizes[0]}×${m.sizes[0]} – ${m.sizes.at(-1)}×${m.sizes.at(-1)}` : `${m.sizes[0]}×${m.sizes[0]}`} · {m.minPlayers}+ players
              </span>
            </button>
          );
        })}
      </div>

      <div className="menu">
        <Button onClick={() => setDialog('create')}>Create room</Button>
        <Button variant="secondary" onClick={() => setDialog('join')}>Join room</Button>
        <Button variant="ghost" onClick={() => setDialog('how')}>How to play</Button>
        <Button variant="ghost" onClick={() => setDialog('settings')}>Settings</Button>
      </div>
      <p className="menu__status meta" role="status">
        {service === undefined ? 'Checking secure line…' : service === null ? 'Online rooms are not open yet.' : service.kind === 'dev-fixture' ? 'Dev build: rooms are simulated in this tab (fixture), not real multiplayer.' : 'Private rooms · no sign-up'}
      </p>

      <Modal open={dialog === 'create'} onClose={close} label="Create a room">
        <CreateRoomDialog service={service ?? null} initialMode={mode} onCancel={close} />
      </Modal>
      <Modal open={dialog === 'join'} onClose={close} label="Join a room">
        <JoinRoomDialog onCancel={close} />
      </Modal>
      <Modal open={dialog === 'how'} onClose={close} label="How to play">
        <HowToPlay />
      </Modal>
      <Modal open={dialog === 'settings'} onClose={close} label="Settings">
        <SettingsDialog onDone={close} />
      </Modal>
    </div>
  );
}
