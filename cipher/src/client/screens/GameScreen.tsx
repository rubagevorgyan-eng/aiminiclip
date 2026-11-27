import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { diffMatch, NO_FX } from '../fx/diff.ts';
import { useAnimations } from '../fx/motion.ts';
import { sfx } from '../sound.ts';
import { inviteLink } from '../../net/links.ts';
import type { ClientMessage } from '../../net/protocol.ts';
import { TEAM_LABEL, TEAMS } from '../../shared/config.ts';
import { duetAgentsTotal } from '../../engine/duet.ts';
import { DuetStatus } from '../components/DuetStatus.tsx';
import type { ClientView, PublicMatchState, TeamId } from '../../shared/types.ts';
import { Board, ZOOM_STEPS, needsZoom } from '../components/Board.tsx';
import { IconButton } from '../components/Button.tsx';
import { CommsPanel } from '../components/CommsPanel.tsx';
import { ClueComposer } from '../components/ClueComposer.tsx';
import { ClueDisplay } from '../components/ClueDisplay.tsx';
import { GuessControls } from '../components/GuessControls.tsx';
import { HistoryPanel } from '../components/HistoryPanel.tsx';
import { IconChat, IconClose, IconFocus, IconGear, IconLog, IconPause, IconPlay } from '../components/Icons.tsx';
import { SettingsDialog } from './menu/SettingsDialog.tsx';
import { MissionReport } from '../components/MissionReport.tsx';
import { Modal } from '../components/Modal.tsx';
import { RoomControls } from '../components/RoomControls.tsx';
import { Segmented } from '../components/Segmented.tsx';
import { Stamp } from '../components/Stamp.tsx';
import { TeamPanel } from '../components/TeamPanel.tsx';
import { useNotify } from '../components/Toasts.tsx';
import { WordCard } from '../components/WordCard.tsx';
import { deriveSeat, nameOf, ownerLabel } from '../game/derive.ts';
import { declassifiedToneAt, keyToneAt, SIDE_LABEL } from '../game/identity.ts';

const wide = () => typeof matchMedia !== 'undefined' && matchMedia('(min-width: 1280px)').matches;

function foundCount(m: PublicMatchState, identity: string) {
  return m.cards.filter((c) => c.reveal?.identity.identity === identity).length;
}

/**
 * The gameplay layout: room bar, clue above the board, the board as centerpiece, guessing or clue
 * controls below it, compact team panels, and a collapsible chat / log / roster panel.
 * Rendering only: every action goes out through `send` and the server decides.
 */
export function GameScreen({ view, send, epoch = 0, introMatchId = null }: { view: ClientView; send: (m: ClientMessage) => void; epoch?: number; introMatchId?: string | null }) {
  const notify = useNotify();
  const m = view.match;
  const seat = deriveSeat(view);
  const players = view.room.players;
  const [selected, setSelected] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [focus, setFocus] = useState(false);
  // Communications and history collapse independently; on narrow screens the column is a drawer.
  const [commsOpen, setCommsOpen] = useState(wide);
  const [histOpen, setHistOpen] = useState(wide);
  const [drawer, setDrawer] = useState(false);
  const [unread, setUnread] = useState(0);
  const [traceTurn, setTraceTurn] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const toggleSelect = useCallback((i: number) => setSelected((s) => (s === i ? null : i)), []);
  // Timers that expire 'fresh' reveal markers; cleared on unmount so nothing fires afterwards.
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => setReportOpen(m?.phase === 'completed'), [m?.id, m?.phase]);

  // ---- Presentation-only effects: computed from successive views, never affect state ----
  const animOn = useAnimations();
  const [fx, setFx] = useState<{ initKey: number; init: { from: string[] | null } | null; fresh: Set<number>; marks: Set<number>; clue: string | null; reportFresh: boolean }>(
    () => ({ initKey: 1, init: m && m.id === introMatchId ? { from: null } : null, fresh: new Set(), marks: new Set(), clue: null, reportFresh: false }),
  );
  const prev = useRef<{ m: PublicMatchState | null; epoch: number }>({ m: null, epoch });
  // The same diff, computed during render (prev is still the previous view here), so the very first
  // frame of a new clue, reveal or board is already animated: no flash of the final state.
  const liveDiff = useMemo(() => (prev.current.epoch === epoch ? diffMatch(prev.current.m, m) : NO_FX), [m, epoch]);
  useEffect(() => {
    const before = prev.current;
    // After a reconnect (new epoch) show the current state as-is: nothing replays.
    const d = before.epoch === epoch ? diffMatch(before.m, m) : NO_FX;
    prev.current = { m, epoch };
    if (!animOn) return;
    if (d.init) {
      setFx((f) => ({ ...f, initKey: f.initKey + 1, init: { from: d.init!.from }, fresh: new Set(), marks: new Set(), clue: null, reportFresh: false }));
      sfx.paper();
      return;
    }
    if (d.reveals.length || d.civilians.length || d.clue || d.ended) {
      setFx((f) => ({ ...f, fresh: new Set([...f.fresh, ...d.reveals]), marks: new Set([...f.marks, ...d.civilians]), clue: d.clue ?? f.clue, reportFresh: f.reportFresh || d.ended }));
      const kinds = d.reveals.map((i) => m?.cards[i]?.reveal?.identity.identity);
      if (kinds.includes('mole')) sfx.stamp();
      else if (kinds.some((k) => k && k !== 'civilian')) (sfx.radio(), timers.current.push(window.setTimeout(() => sfx.beep(), 700)));
      else if (kinds.length || d.civilians.length) sfx.paper();
      if (d.clue) sfx.radio();
      if (d.ended && m?.result) {
        const me = view.room.players.find((p) => p.id === view.you);
        const won = m.result.outcome.kind === 'team_win' ? me?.team === m.result.outcome.team : m.result.outcome.kind === 'cooperative_win';
        timers.current.push(window.setTimeout(() => (won ? sfx.victory() : sfx.defeat()), 400));
      }
      // Fresh markers expire after the reveal animation (1.2 s).
      if (d.reveals.length || d.civilians.length) timers.current.push(window.setTimeout(() => setFx((f) => ({ ...f, fresh: new Set([...f.fresh].filter((i) => !d.reveals.includes(i))), marks: new Set([...f.marks].filter((i) => !d.civilians.includes(i))) })), 1600));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m, epoch]);
  // Board decode markers are dropped once the wave has finished (≤ 2.5 s).
  useEffect(() => {
    if (!fx.init) return;
    const t = setTimeout(() => setFx((f) => ({ ...f, init: null })), 2600);
    return () => clearTimeout(t);
  }, [fx.initKey, fx.init]);
  useEffect(() => {
    if (selected !== null && (m?.cards[selected]?.reveal || !seat.canGuess)) setSelected(null);
  }, [m, selected, seat.canGuess]);

  // Server clock skew, measured when each view arrives (countdowns only; the server enforces deadlines).
  const skew = useMemo(() => (view.serverNow ? view.serverNow - Date.now() : 0), [view]);
  const suggestions = useMemo(() => {
    const out = new Map<number, string[]>();
    for (const s of m?.suggestions ?? []) out.set(s.card, [...(out.get(s.card) ?? []), nameOf(players, s.by)]);
    return out;
  }, [m?.suggestions, players]);

  if (!m) return null;
  const ref = { match: m.id, rev: m.revision };
  const rules = m.rules;
  const size = m.dimensions.size;
  const duet = m.mode === 'duet';
  const turn = m.turn;
  const giver = turn?.clue ? nameOf(players, turn.clue.by) : null;
  const selectedCard = selected === null ? null : m.cards[selected] ?? null;
  const suggestedByMe = selected !== null && (m.suggestions ?? []).some((s) => s.card === selected && s.by === view.you);
  const unrevealedWords = m.cards.filter((c) => !c.reveal).map((c) => c.word);

  const sideOpen = wide() ? commsOpen || histOpen : drawer;
  const toggleDock = (which: 'comms' | 'hist') => {
    const isOpen = which === 'comms' ? commsOpen : histOpen;
    if (!wide() && !drawer) {
      setDrawer(true);
      (which === 'comms' ? setCommsOpen : setHistOpen)(true);
      return;
    }
    (which === 'comms' ? setCommsOpen : setHistOpen)(!isOpen);
  };
  // Highlight cards guessed on a selected past clue (local only: nothing is broadcast).
  const traced = traceTurn === null ? null : new Set(m.history.flatMap((e) => (e.type === 'guess' && e.guess.turn === traceTurn ? [e.guess.card] : [])));
  const copyInvite = async () => {
    const link = inviteLink(view.room.code, location.href);
    try {
      await navigator.clipboard.writeText(link);
      notify('Invite copied', link, 'success');
    } catch {
      notify('Invite link', link);
    }
  };

  const teamPanel = (team: TeamId) => (
    <TeamPanel
      key={team}
      tone={team}
      title={TEAM_LABEL[team]}
      remaining={m.remaining[team] ?? 0}
      total={(m.remaining[team] ?? 0) + foundCount(m, team)}
      players={players.filter((p) => p.team === team)}
      hostId={view.room.host.hostId}
      you={view.you}
      active={turn?.owner.kind === 'team' && turn.owner.team === team && m.phase !== 'completed'}
    />
  );
  const agentsLeft = m.remaining.agents ?? 0;
  const duetRole = (side: 'north' | 'south') => {
    if (m.phase === 'completed') return 'Operation closed';
    if (m.phase === 'sudden_death') return m.sidesDone?.includes(side === 'north' ? 'south' : 'north') ? 'No guesses left' : 'Guessing (sudden death)';
    const giver = turn?.owner.kind === 'side' ? turn.owner.side : null;
    const done = m.sidesDone?.includes(side) ? ' · own agents all found' : '';
    return (giver === side ? 'Giving the clue' : 'Guessing') + done;
  };
  const panels = duet
    ? (['north', 'south'] as const).map((side) => (
        <TeamPanel key={side} tone="agent" title={SIDE_LABEL[side]} players={players.filter((p) => p.side === side && p.role !== 'spectator')} hostId={view.room.host.hostId} you={view.you} active={m.phase !== 'completed' && m.phase !== 'sudden_death' && turn?.owner.kind === 'side' && turn.owner.side === side} extra={duetRole(side)} />
      ))
    : TEAMS.map(teamPanel);

  const status = (() => {
    if (m.phase === 'completed') return 'Operation closed.';
    if (m.phase === 'paused') return 'Operation paused by the host.';
    if (!turn) return '';
    if (duet) {
      if (m.phase === 'sudden_death') return 'Sudden death: no more clues.';
      return m.phase === 'awaiting_clue' ? `${ownerLabel(turn.owner)} is composing a clue.` : `${ownerLabel(turn.owner)}'s partner is guessing.`;
    }
    if (m.phase === 'awaiting_clue') return seat.holdsKey && !seat.canClue ? `Waiting for the other handler.` : `Waiting for ${ownerLabel(turn.owner)}'s handler.`;
    return seat.me?.role === 'spectator' ? `${ownerLabel(turn.owner)} is guessing.` : `${ownerLabel(turn.owner)} is guessing. Stand by.`;
  })();

  return (
    <div className={`game ${duet ? 'game--duet' : ''} ${focus ? 'is-focus' : ''} ${sideOpen ? 'has-side' : ''}`} data-size={size}>
      <RoomControls code={view.room.code} settings={view.room.settings} onCopy={copyInvite}>
        {needsZoom(size) && (
          <Segmented<number> label="Zoom" value={zoom} onChange={setZoom} options={ZOOM_STEPS.map((z) => ({ value: z, label: z === 1 ? 'Fit' : `${z * 100}%` }))} />
        )}
        {seat.isHost && m.phase !== 'completed' && (
          <IconButton label={m.phase === 'paused' ? 'Resume' : 'Pause'} onClick={() => send({ t: m.phase === 'paused' ? 'resume' : 'pause', ...ref })}>
            {m.phase === 'paused' ? <IconPlay /> : <IconPause />}
          </IconButton>
        )}
        <IconButton label="Settings" onClick={() => setSettingsOpen(true)}>
          <IconGear />
        </IconButton>
        <IconButton label="Focus mode" pressed={focus} onClick={() => (setFocus(!focus), !focus && (setCommsOpen(false), setHistOpen(false), setDrawer(false)))}>
          <IconFocus />
        </IconButton>
        <IconButton label="Communications" pressed={sideOpen && commsOpen} badge={commsOpen && sideOpen ? 0 : unread} onClick={() => toggleDock('comms')}>
          <IconChat />
        </IconButton>
        <IconButton label="Intelligence history" pressed={sideOpen && histOpen} onClick={() => toggleDock('hist')}>
          <IconLog />
        </IconButton>
      </RoomControls>

      <div className="game__body">
        <div className="game__team game__team--a">{panels[0]}</div>
        <div className="game__team game__team--b">{panels[1]}</div>

        <div className="game__center">
          {view.room.pauseReason && m.phase === 'paused' && <PauseBanner view={view} send={send} />}
          {duet && <DuetStatus found={duetAgentsTotal() - agentsLeft} total={duetAgentsTotal()} tokensLeft={turn?.turnsLeft ?? 0} tokensTotal={rules.tokens} phase={m.phase} myKey={view.key} cards={m.cards} />}
          <ClueDisplay turn={turn} phase={m.phase} giverName={giver} skew={skew} animateKey={animOn && turn?.clue && (liveDiff.clue ?? fx.clue) === `${m.id}:${turn.clue.turn}:${turn.clue.word}` ? `${m.id}:${turn.clue.turn}:${turn.clue.word}` : null} />
          {seat.holdsKey && m.phase !== 'completed' && (
            <p className="keynote">
              <Stamp tone="brass" tilt={0}>{duet ? 'Your private key' : 'Handler clearance'}</Stamp>
              <span className="meta">{duet ? 'Tinted cards show your side of the key only. Your partner and observers cannot see it.' : 'Tinted cards show the key. Operatives cannot see this.'}</span>
            </p>
          )}
          <Board size={size} zoom={zoom} label={`${size} by ${size} board`}>
            {m.cards.map((card) => (
              <WordCard
                key={card.index}
                card={card}
                keyTone={card.reveal ? null : m.declassified ? declassifiedToneAt(m.declassified, card.index) : keyToneAt(view.key, card.index)}
                selected={selected === card.index}
                traced={traced?.has(card.index) ?? false}
                decode={(liveDiff.init || fx.init) && animOn ? { key: m.id, size, from: (liveDiff.init ?? fx.init)!.from?.[card.index] } : null}
                fresh={fx.fresh.has(card.index) || liveDiff.reveals.includes(card.index)}
                freshMark={fx.marks.has(card.index) || liveDiff.civilians.includes(card.index)}
                suggestedBy={suggestions.get(card.index)}
                civilianFor={card.civilianFor?.map((s) => SIDE_LABEL[s])}
                disabled={!seat.canGuess}
                onSelect={toggleSelect}
              />
            ))}
          </Board>
          {seat.canClue && <ClueComposer boardWords={unrevealedWords} specialClues={duet || rules.specialClues} onSubmit={(word, count) => send({ t: 'clue', word, count, ...ref })} />}
          <GuessControls
            selected={selectedCard}
            canGuess={seat.canGuess}
            suggestedByMe={suggestedByMe}
            guessesMade={turn?.guessesMade ?? 0}
            guessesAllowed={turn?.guessesAllowed ?? null}
            onClear={() => setSelected(null)}
            onSuggest={() => selected !== null && send({ t: 'suggest', card: selected, on: !suggestedByMe, ...ref })}
            onConfirm={() => selected !== null && (send({ t: 'confirm', card: selected, ...ref }), setSelected(null))}
            onEndTurn={() => send({ t: 'end_turn', ...ref })}
            canEnd={m.phase !== 'sudden_death'}
            canSuggest={rules.suggestions}
          />
          {!seat.canClue && !seat.canGuess && <p className="game__status meta">{status}</p>}
          {m.phase === 'completed' && !reportOpen && (
            <p className="game__status">
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => setReportOpen(true)}>Open mission report</button>
            </p>
          )}
        </div>

        <aside className={`side ${sideOpen ? '' : 'is-hidden'}`} aria-label="Communications and history">
          {!wide() && (
            <div className="side__close">
              <IconButton label="Close panels" onClick={() => setDrawer(false)}>
                <IconClose />
              </IconButton>
            </div>
          )}
          <CommsPanel view={view} send={send} open={commsOpen} onToggle={() => setCommsOpen(!commsOpen)} onUnread={setUnread} />
          <HistoryPanel match={m} players={players} open={histOpen} onToggle={() => setHistOpen(!histOpen)} selected={traceTurn} onSelect={setTraceTurn} />
        </aside>
      </div>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} label="Settings">
        <SettingsDialog onDone={() => setSettingsOpen(false)} />
      </Modal>
      <Modal open={reportOpen} onClose={() => setReportOpen(false)} label="Mission report">
        <MissionReport match={m} players={players} isHost={seat.isHost} viewer={seat.me} fresh={fx.reportFresh} onRematch={(rotate) => send({ t: 'rematch', rotate })} onLobby={() => send({ t: 'to_lobby' })} onClose={() => (setReportOpen(false), setFx((f) => ({ ...f, reportFresh: false })))} />
      </Modal>
    </div>
  );
}

/**
 * Shown while the server holds play because a required role is missing. Offers only the seat moves
 * the server allows mid-match (it re-checks everything): an operative or observer may take a vacant
 * handler seat; an observer who never held a key may fill a bureau that has no operative.
 */
function PauseBanner({ view, send }: { view: ClientView; send: (m: ClientMessage) => void }) {
  const me = view.room.players.find((p) => p.id === view.you);
  const offers: { label: string; msg: ClientMessage }[] = [];
  if (view.room.settings.mode === 'duet') {
    for (const side of ['north', 'south'] as const) {
      const here = view.room.players.some((p) => p.side === side && p.role !== 'spectator' && p.connected);
      if (!here && me?.role === 'spectator' && !view.room.keyHolders.includes(me.id)) offers.push({ label: `Take over as ${SIDE_LABEL[side]}`, msg: { t: 'seat', role: 'operative', side } });
    }
  }
  for (const team of view.room.settings.mode === 'duet' ? [] : TEAMS) {
    const handlerHere = view.room.players.some((p) => p.team === team && p.role === 'handler' && p.connected);
    const opHere = view.room.players.some((p) => p.team === team && p.role === 'operative' && p.connected);
    const mineOrFree = !me?.team || me.team === team;
    if (!handlerHere && me && me.role !== 'handler' && mineOrFree) offers.push({ label: `Take over ${TEAM_LABEL[team]} handler`, msg: { t: 'seat', role: 'handler', team } });
    if (!opHere && me?.role === 'spectator' && !view.room.keyHolders.includes(me.id)) offers.push({ label: `Join ${TEAM_LABEL[team]} as operative`, msg: { t: 'seat', role: 'operative', team } });
  }
  return (
    <section className="pausebar panel" role="status">
      <p className="pausebar__text"><b>Paused.</b> {view.room.pauseReason}. Play resumes when the seat is filled or the player returns.</p>
      {offers.length > 0 && (
        <div className="pausebar__actions">
          {offers.map((o) => (
            <button key={o.label} type="button" className="btn btn--secondary btn--sm" onClick={() => send(o.msg)}>{o.label}</button>
          ))}
        </div>
      )}
    </section>
  );
}
