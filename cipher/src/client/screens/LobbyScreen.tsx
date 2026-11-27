import { useState } from 'react';
import { startBlockers } from '../../engine/lobbyRules.ts';
import { MODES } from '../../engine/modes/index.ts';
import { kindOf } from '../../engine/settings.ts';
import { inviteLink } from '../../net/links.ts';
import type { ClientMessage } from '../../net/protocol.ts';
import { SIDE_LABEL, TEAMS, TEAM_LABEL } from '../../shared/config.ts';
import type { ClientView, Player } from '../../shared/types.ts';
import { AccessCode } from '../components/AccessCode.tsx';
import { Button } from '../components/Button.tsx';
import { CommsPanel } from '../components/CommsPanel.tsx';
import { Dossier } from '../components/Dossier.tsx';
import { LobbySettings } from '../components/LobbySettings.tsx';
import { Modal } from '../components/Modal.tsx';
import { SeatGroup } from '../components/SeatGroup.tsx';
import { Stamp } from '../components/Stamp.tsx';
import { useNotify } from '../components/Toasts.tsx';

type Confirm = { kind: 'kick' | 'host'; player: Player } | { kind: 'leave' } | null;

/**
 * Pre-match lobby for Classic, Duet and Custom. Rendering only: every change is a `ClientMessage`
 * the room server validates (Start stays disabled with reasons until the room is ready).
 */
export function LobbyScreen({ view, send, onLeave }: { view: ClientView; send: (m: ClientMessage) => void; onLeave: () => void }) {
  const notify = useNotify();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [commsOpen, setCommsOpen] = useState(true);
  // Only the creator, once, right after creating: the code decrypts. Reloads show it plainly.
  const [decrypt] = useState(() => {
    const created = sessionStorage.getItem('cipher.fx.created') === view.room.code;
    if (created) sessionStorage.removeItem('cipher.fx.created');
    return created;
  });
  const { room, you } = view;
  const s = room.settings;
  const mode = MODES[s.mode];
  const kind = kindOf(s);
  const me = room.players.find((p) => p.id === you) ?? null;
  const isHost = room.host.hostId === you;
  const blockers = startBlockers(s, room.players);
  const coop = kind === 'cooperative';
  const spectators = room.players.filter((p) => p.role === 'spectator');
  const seated = room.players.length - spectators.length;
  const common = { hostId: room.host.hostId, you, isHost, onKick: (p: Player) => setConfirm({ kind: 'kick', player: p }), onMakeHost: (p: Player) => setConfirm({ kind: 'host', player: p }) };

  const copy = async (what: 'code' | 'link', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(what === 'code' ? 'Access code copied' : 'Invitation link copied', text, 'success');
    } catch {
      notify(what === 'code' ? 'Access code' : 'Invitation link', text);
    }
  };

  const teams = coop
    ? (['north', 'south'] as const).map((side) => {
        const players = room.players.filter((p) => p.side === side && p.role !== 'spectator');
        return (
          <SeatGroup
            key={side}
            tone="agent"
            title={SIDE_LABEL[side]}
            subtitle={side === 'north' ? 'Holds key side A' : 'Holds key side B'}
            {...common}
            slots={[{ label: 'Partners', hint: 'at least 1', players, mine: me?.side === side && me.role !== 'spectator', onTake: () => send({ t: 'seat', role: 'operative', side }), takeLabel: `Join ${SIDE_LABEL[side]}` }]}
          />
        );
      })
    : TEAMS.map((team) => {
        const members = room.players.filter((p) => p.team === team && p.role !== 'spectator');
        const handlers = members.filter((p) => p.role === 'handler');
        const ops = members.filter((p) => p.role === 'operative');
        return (
          <SeatGroup
            key={team}
            tone={team}
            title={TEAM_LABEL[team]}
            subtitle={`${members.length} seated`}
            {...common}
            slots={[
              { label: 'Handler', hint: 'gives clues · exactly 1', max: 1, players: handlers, mine: me?.team === team && me.role === 'handler', onTake: () => send({ t: 'seat', role: 'handler', team }), takeLabel: 'Take handler' },
              { label: 'Operatives', hint: 'guess · 1 or more', players: ops, mine: me?.team === team && me.role === 'operative', onTake: () => send({ t: 'seat', role: 'operative', team }), takeLabel: 'Join as operative' },
            ]}
          />
        );
      });

  const runConfirm = () => {
    if (!confirm) return;
    if (confirm.kind === 'kick') send({ t: 'kick', player: confirm.player.id });
    if (confirm.kind === 'host') send({ t: 'transfer_host', to: confirm.player.id });
    if (confirm.kind === 'leave') onLeave();
    setConfirm(null);
  };

  return (
    <div className="lobby">
      <header className="lobby__head">
        <AccessCode code={room.code} link={inviteLink(room.code, location.href)} onCopy={copy} decrypt={decrypt} />
        <div className="lobby__brief panel">
          <p className="eyebrow">Lobby · {coop ? 'Cooperative' : 'Competitive'}</p>
          <h2 className="lobby__title">{mode.label} operation</h2>
          <p className="meta">
            {seated} seated · {spectators.length} {spectators.length === 1 ? 'observer' : 'observers'} · host {room.players.find((p) => p.id === room.host.hostId)?.name ?? '—'}
          </p>
          <div className="lobby__headActions">
            {isHost && <Button size="sm" variant="secondary" onClick={() => send({ t: 'shuffle_teams' })} disabled={seated < 2} title={seated < 2 ? 'Seat at least two players first' : undefined}>Shuffle teams</Button>}
            <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'leave' })}>Leave room</Button>
          </div>
        </div>
      </header>

      <div className="lobby__main">
        <div className="lobby__seats">
          <div className={`lobby__teams ${coop ? 'lobby__teams--duet' : ''}`}>{teams}</div>
          <SeatGroup
            tone="observer"
            title="Observers"
            subtitle={s.spectatorsAllowed ? 'Watch without a seat' : 'Spectators are off'}
            {...common}
            slots={[{ label: 'Watching', players: spectators, mine: me?.role === 'spectator', onTake: s.spectatorsAllowed || isHost ? () => send({ t: 'seat', role: 'spectator' }) : undefined, takeLabel: 'Watch instead' }]}
          />
        </div>

        <aside className="lobby__aside">
          <LobbySettings settings={s} editable={isHost} onChange={(patch) => send({ t: 'settings', ...patch })} />
          <section className="startpanel panel" aria-label="Start">
            {blockers.length ? (
              <>
                <p className="startpanel__title">Not ready to launch</p>
                <ul className="startpanel__list">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
              </>
            ) : (
              <p className="startpanel__title startpanel__title--ok"><Stamp tone="brass" tilt={0}>Cleared</Stamp> All roles filled.</p>
            )}
            {isHost ? (
              <Button block disabled={blockers.length > 0} onClick={() => send({ t: 'start' })}>Start operation</Button>
            ) : (
              <p className="meta">Waiting for the host to start.</p>
            )}
          </section>
          <CommsPanel view={view} send={send} open={commsOpen} onToggle={() => setCommsOpen(!commsOpen)} />
        </aside>
      </div>

      <Modal open={confirm !== null} onClose={() => setConfirm(null)} label="Confirm">
        {confirm && (
          <Dossier tab="CONFIRM" title={confirm.kind === 'leave' ? 'Leave this room?' : confirm.kind === 'kick' ? `Remove ${confirm.player.name}?` : `Make ${confirm.player.name} host?`}>
            <p className="dossier__text">
              {confirm.kind === 'leave'
                ? isHost ? 'The host role passes to the longest-seated player.' : 'You can rejoin with the access code while the room is open.'
                : confirm.kind === 'kick' ? 'They leave the room. They can rejoin with the code unless you change it by opening a new room.' : 'They will control settings and start the operation.'}
            </p>
            <div className="modal__actions">
              <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button onClick={runConfirm}>{confirm.kind === 'leave' ? 'Leave' : confirm.kind === 'kick' ? 'Remove' : 'Make host'}</Button>
            </div>
          </Dossier>
        )}
      </Modal>
    </div>
  );
}
