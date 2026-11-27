/**
 * DEVELOPMENT ONLY design lab: every Cipher component on fixture data.
 * Open with `npm run dev` at /?lab. `App` imports this lazily behind `import.meta.env.DEV`,
 * so production builds contain neither this file nor the fixtures.
 */
import { useMemo, useState } from 'react';
import type { ClientMessage } from '../../net/protocol.ts';
import type { BoardSize, ModeId, PublicCard } from '../../shared/types.ts';
import { Button, IconButton } from '../components/Button.tsx';
import { CipherLogo } from '../components/CipherLogo.tsx';
import { ClueComposer } from '../components/ClueComposer.tsx';
import { ClueDisplay } from '../components/ClueDisplay.tsx';
import { Dossier } from '../components/Dossier.tsx';
import { IconChat, IconFocus, IconLog } from '../components/Icons.tsx';
import { MissionReport } from '../components/MissionReport.tsx';
import { Modal } from '../components/Modal.tsx';
import { ScoreCounter } from '../components/ScoreCounter.tsx';
import { Segmented } from '../components/Segmented.tsx';
import { MARKINGS, Stamp } from '../components/Stamp.tsx';
import { useNotify } from '../components/Toasts.tsx';
import { WordCard } from '../components/WordCard.tsx';
import type { Tone } from '../game/identity.ts';
import { GameScreen } from '../screens/GameScreen.tsx';
import { buildFixture, type FixturePhase, type Perspective } from './fixtures.ts';
import './lab.css';

const TONES: Tone[] = ['crimson', 'cobalt', 'agent', 'neutral', 'assassin'];

export default function DesignLab() {
  const notify = useNotify();
  const [page, setPage] = useState<'game' | 'kit'>('game');
  const [mode, setMode] = useState<ModeId>('classic');
  const [size, setSize] = useState<BoardSize>(8);
  const [perspective, setPerspective] = useState<Perspective>('operative');
  const [phase, setPhase] = useState<FixturePhase>('guessing');
  const persp = mode === 'duet' ? (perspective === 'north' || perspective === 'south' || perspective === 'spectator' ? perspective : 'south') : perspective === 'north' || perspective === 'south' ? 'operative' : perspective;
  const view = useMemo(() => buildFixture({ mode, size, perspective: persp, phase }), [mode, size, persp, phase]);
  const send = (m: ClientMessage) => notify('Dev fixture', `Would send: ${JSON.stringify(m)}`, 'info');

  return (
    <div className="lab">
      <div className="lab__banner" role="note">
        <Stamp tone="brass" tilt={0}>{MARKINGS.dev}</Stamp>
        <span>Development fixture: fake data, dev builds only. Nothing here is live.</span>
      </div>
      <div className="lab__bar panel">
        <Segmented label="Page" value={page} onChange={setPage} options={[{ value: 'game', label: 'Game layout' }, { value: 'kit', label: 'Component kit' }]} />
        {page === 'game' && (
          <>
            <Segmented<ModeId> label="Mode" value={mode} onChange={setMode} options={[{ value: 'classic', label: 'Classic' }, { value: 'duet', label: 'Duet' }, { value: 'custom', label: 'Custom' }]} />
            {mode === 'custom' && (
              <Segmented<BoardSize> label="Board" value={size} onChange={setSize} options={([5, 6, 7, 8, 9, 10] as const).map((s) => ({ value: s, label: `${s}×${s}` }))} />
            )}
            <Segmented<Perspective>
              label="Perspective"
              value={persp}
              onChange={setPerspective}
              options={mode === 'duet'
                ? [{ value: 'north', label: 'North' }, { value: 'south', label: 'South' }, { value: 'spectator', label: 'Spectator' }]
                : [{ value: 'operative', label: 'Operative' }, { value: 'handler', label: 'Handler' }, { value: 'spectator', label: 'Spectator' }]}
            />
            <Segmented<FixturePhase>
              label="Phase"
              value={phase}
              onChange={setPhase}
              options={[
                { value: 'awaiting_clue', label: 'Clue' },
                { value: 'guessing', label: 'Guess' },
                ...(mode === 'duet' ? [{ value: 'sudden_death' as const, label: 'Sudden' }] : []),
                { value: 'paused', label: 'Paused' },
                { value: 'completed', label: 'Done' },
              ]}
            />
          </>
        )}
      </div>
      {page === 'game' ? <GameScreen key={`${mode}${size}${persp}${phase}`} view={view} send={send} /> : <Kit />}
    </div>
  );
}

function Kit() {
  const notify = useNotify();
  const [modal, setModal] = useState(false);
  const report = useMemo(() => buildFixture({ mode: 'classic', size: 5, perspective: 'operative', phase: 'completed' }), []);
  const card = (i: number, word: string, extra: Partial<PublicCard> = {}): PublicCard => ({ index: i, word, reveal: null, ...extra });
  const turn = report.match && { number: 7, owner: { kind: 'team' as const, team: 'cobalt' as const }, clue: { word: 'LANTERN', count: 3, owner: { kind: 'team' as const, team: 'cobalt' as const }, by: 'x', turn: 7, at: 0 }, guessesMade: 1, guessesAllowed: 4, deadline: null };

  return (
    <div className="kit">
      <Section title="Logo">
        <div className="kit__row">
          <CipherLogo className="kit__logo" />
          <CipherLogo inline className="kit__logo-sm" />
        </div>
      </Section>

      <Section title="Buttons">
        <div className="kit__row">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">End turn</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <IconButton label="Chat" badge={3}><IconChat /></IconButton>
          <IconButton label="Log" pressed><IconLog /></IconButton>
          <IconButton label="Focus"><IconFocus /></IconButton>
        </div>
      </Section>

      <Section title="Stamps and markings">
        <div className="kit__row kit__paper">
          <Stamp>{MARKINGS.eyesOnly}</Stamp>
          <Stamp tone="brass" tilt={2}>{MARKINGS.declassified}</Stamp>
          <Stamp tone="ink" tilt={-1}>{MARKINGS.handler}</Stamp>
          <Stamp large double tilt={-6}>{MARKINGS.compromised}</Stamp>
          <Stamp large double tone="brass" tilt={4}>{MARKINGS.complete}</Stamp>
        </div>
      </Section>

      <Section title="Word cards: hidden states">
        <div className="kit__cards">
          <Labeled label="Default"><WordCard card={card(0, 'LANTERN')} /></Labeled>
          <Labeled label="Selected"><WordCard card={card(1, 'TYPEWRITER')} selected /></Labeled>
          <Labeled label="Suggested"><WordCard card={card(2, 'HARBOR')} suggestedBy={['Ben', 'Cleo']} /></Labeled>
          <Labeled label="Not your turn"><WordCard card={card(3, 'CONSTELLATION')} disabled /></Labeled>
          <Labeled label="Duet civilian marks"><WordCard card={card(4, 'MEADOW')} civilianFor={['North']} /></Labeled>
        </div>
      </Section>

      <Section title="Handler key (only rendered for key holders)">
        <div className="kit__cards">
          {TONES.map((t, i) => (
            <Labeled key={t} label={t}><WordCard card={card(10 + i, ['EMBASSY', 'COMPASS', 'GLACIER', 'PEPPER', 'SHADOW'][i])} keyTone={t} disabled /></Labeled>
          ))}
        </div>
      </Section>

      <Section title="Revealed identity cards">
        <div className="kit__cards">
          {(['crimson', 'cobalt', 'agent', 'civilian', 'mole'] as const).map((id, i) => (
            <Labeled key={id} label={id}>
              <WordCard
                card={card(20 + i, ['SUBMARINE', 'RAVEN', 'ORCHARD', 'KETTLE', 'MICROFILM'][i], {
                  reveal: { identity: id === 'agent' ? { kind: 'cooperative', identity: 'agent', judgedBy: 'north' } : { kind: 'competitive', identity: id }, portrait: { seed: i }, by: null, turn: 1, at: 0 },
                })}
              />
            </Labeled>
          ))}
        </div>
      </Section>

      <Section title="Scores and clue">
        <div className="kit__grid">
          <div className="panel kit__pad"><ScoreCounter remaining={5} total={9} tone="crimson" label="Crimson" /></div>
          <div className="panel kit__pad"><ScoreCounter remaining={21} total={34} tone="cobalt" label="Cobalt" /></div>
          {turn && <ClueDisplay turn={turn} phase="guessing" giverName="Dmitri Hale" />}
          {turn && <ClueDisplay turn={{ ...turn, clue: null }} phase="awaiting_clue" giverName={null} />}
        </div>
        <ClueComposer boardWords={['LANTERN']} onSubmit={(w, c) => notify('Dev fixture', `Clue ${w} ${c ?? '∞'}`)} />
      </Section>

      <Section title="Dialogs and notifications">
        <div className="kit__row">
          <Button variant="secondary" onClick={() => setModal(true)}>Open modal</Button>
          <Button variant="secondary" onClick={() => notify('Transmission received', 'Cobalt Bureau: LANTERN · 3', 'info')}>Info</Button>
          <Button variant="secondary" onClick={() => notify('Agent located', 'Ben found a Crimson agent.', 'success')}>Success</Button>
          <Button variant="secondary" onClick={() => notify('Connection lost', 'Reconnecting to the room…', 'danger')}>Danger</Button>
        </div>
        <Modal open={modal} onClose={() => setModal(false)} label="Leave the room">
          <Dossier tab="NOTICE" stamp={MARKINGS.eyesOnly} title="Leave the room?">
            <p className="dossier__text">Your seat is held for two minutes if you come back.</p>
            <div className="modal__actions">
              <Button variant="secondary" onClick={() => setModal(false)}>Stay</Button>
              <Button onClick={() => setModal(false)}>Leave</Button>
            </div>
          </Dossier>
        </Modal>
      </Section>

      <Section title="Mission report">
        {report.match && <div className="kit__report"><MissionReport match={report.match} players={report.room.players} isHost onRematch={() => notify('Dev fixture', 'Rematch')} onClose={() => {}} /></div>}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="kit__section">
      <h2 className="eyebrow">{title}</h2>
      {children}
    </section>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure className="kit__fig">
      {children}
      <figcaption className="meta">{label}</figcaption>
    </figure>
  );
}
