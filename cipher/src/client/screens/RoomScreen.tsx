import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { TerminalBanner } from '../fx/Cinematic.tsx';
import type { ConnectionStatus, RoomConnection } from '../../net/connection.ts';
import type { ClientMessage } from '../../net/protocol.ts';
import type { RoomErrorCode, RoomService } from '../../net/service.ts';
import { ROOM_CODE } from '../../shared/config.ts';
import { normalizeRoomCode } from '../../shared/ids.ts';
import { cleanName } from '../../shared/text.ts';
import type { ClientView, RoomCode } from '../../shared/types.ts';
import { Button } from '../components/Button.tsx';
import { NameField } from '../components/NameField.tsx';
import { RoomStatus } from '../components/RoomStatus.tsx';
import { useNotify } from '../components/Toasts.tsx';
import { navigate } from '../route.ts';
import { loadRoomService } from '../services.ts';
import { forgetSession, loadName, loadSession, saveName } from '../storage.ts';
import { GameScreen } from './GameScreen.tsx';
import { LobbyScreen } from './LobbyScreen.tsx';

const DevLobbyTools = import.meta.env.DEV ? lazy(() => import('../dev/DevLobbyTools.tsx')) : null;

const FAILURE: Record<RoomErrorCode, { title: string; text: string; stamp?: string }> = {
  invalid_code: { title: 'Invalid access code', text: `Access codes are ${ROOM_CODE.length} characters: letters and the digits 2–9.` },
  room_not_found: { title: 'No room at this code', text: 'Check the code with your host. Codes are case-insensitive.', stamp: 'Unknown' },
  room_expired: { title: 'Room expired', text: 'This room closed after everyone left. Ask your host to open a new one.', stamp: 'Expired' },
  room_full: { title: 'Room is full', text: 'Every seat and observer place is taken.' },
  spectators_off: { title: 'Seats only', text: 'The host has turned spectators off.' },
  kicked: { title: 'Removed from room', text: 'The host removed you from this room.', stamp: 'Revoked' },
  bad_version: { title: 'Update needed', text: 'This page is out of date. Reload to continue.' },
  connection_failed: { title: 'Connection failed', text: 'Could not reach the room. Check your connection and try again.', stamp: 'No signal' },
  unavailable: { title: 'Online rooms are not open yet', text: 'The secure room server is still being built. Invitation links will work once it is live.' },
};

/** The room flow: name gate → connecting → lobby or game, with explicit failure states. */
export function RoomScreen({ code, invalidRaw }: { code: RoomCode | null; invalidRaw?: string }) {
  const notify = useNotify();
  const [name, setName] = useState(loadName);
  const [named, setNamed] = useState(() => !!loadName() || (code ? !!loadSession(code) : false));
  const [service, setService] = useState<RoomService | null | undefined>(undefined);
  const [conn, setConn] = useState<RoomConnection | null>(null);
  const [view, setView] = useState<ClientView | null>(null);
  const [failure, setFailure] = useState<{ code: RoomErrorCode; message: string } | null>(code ? null : { code: 'invalid_code', message: '' });
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  // Presentation: a new epoch after each reconnect (no replayed animations), the match that started
  // while watching (board decode), and a one-time ACCESS GRANTED for people who just joined.
  const [epoch, setEpoch] = useState(0);
  const wasReconnecting = useRef(false);
  const [introMatchId, setIntroMatchId] = useState<string | null>(null);
  const sawLobby = useRef(false);
  const [granted, setGranted] = useState(false);
  const freshJoin = useRef(code ? !loadSession(code) : false);

  useEffect(() => void loadRoomService().then(setService), []);

  useEffect(() => {
    if (!code || !named || service === undefined) return;
    if (service === null) return setFailure({ code: 'unavailable', message: '' });
    setFailure(null);
    setView(null);
    const c = service.connect(code, loadName() || 'Agent');
    const offs = [
      c.onView((v) => {
        setView((old) => {
          if (!old && freshJoin.current && !sessionStorage.getItem('cipher.fx.created')) setGranted(true);
          freshJoin.current = false;
          return v;
        });
      }),
      c.onStatus((st) => {
        setStatus(st);
        if (st === 'reconnecting') wasReconnecting.current = true;
        if (st === 'open' && wasReconnecting.current) (wasReconnecting.current = false, setEpoch((e) => e + 1));
      }),
      c.onFailure((fc, message) => setFailure({ code: fc, message })),
      c.onError((_, message) => (import.meta.env.DEV && message.startsWith('Dev fixture') ? notify('Dev fixture', message.replace(/^Dev fixture: /, ''), 'info') : notify('Not allowed', message, 'danger'))),
    ];
    setConn(c);
    return () => {
      offs.forEach((off) => off());
      c.close();
    };
  }, [code, named, service, attempt, notify]);

  const send = (m: ClientMessage) => conn?.send(m);
  const leave = () => {
    send({ t: 'leave' });
    if (code) forgetSession(code);
    navigate({ name: 'home' });
  };

  if (failure) return <Failure failure={failure.code} raw={invalidRaw} onRetry={() => setAttempt((a) => a + 1)} />;

  if (!named) {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      const clean = cleanName(name);
      if (!clean) return;
      saveName(clean);
      setNamed(true);
    };
    return (
      <RoomStatus tab="CHECKPOINT" title={`Joining room ${code}`}>
        <form className="form" onSubmit={submit}>
          <p className="dossier__text">You were invited to a private Cipher room. Choose a code name; no account needed.</p>
          <NameField value={name} onChange={setName} autoFocus />
          <div className="modal__actions">
            <Button variant="secondary" onClick={() => navigate({ name: 'home' })}>Cancel</Button>
            <Button type="submit" disabled={!cleanName(name)}>Enter room</Button>
          </div>
        </form>
      </RoomStatus>
    );
  }

  if (!view) return <RoomStatus tab="CONNECTING" title={`Room ${code}`} busy />;

  // A room with a match (running or just finished) shows the game; the host returns everyone to the lobby.
  const inMatch = !!view.match;
  if (!view.match) sawLobby.current = true;
  else if (sawLobby.current && introMatchId !== view.match.id && !introMatchId) setIntroMatchId(view.match.id);
  return (
    <>
      {status === 'reconnecting' && (
        <p className="netbanner" role="status">Connection lost. Reconnecting to room {code}… Your seat is held.</p>
      )}
      {DevLobbyTools && conn && (
        <Suspense fallback={null}>
          <DevLobbyTools connection={conn} />
        </Suspense>
      )}
      {inMatch ? <GameScreen view={view} send={send} epoch={epoch} introMatchId={introMatchId} /> : <LobbyScreen view={view} send={send} onLeave={leave} />}
      {granted && <TerminalBanner lines={['AUTHENTICATING', 'ACCESS GRANTED']} onDone={() => setGranted(false)} />}
    </>
  );
}

function Failure({ failure, raw, onRetry }: { failure: RoomErrorCode; raw?: string; onRetry: () => void }) {
  const f = FAILURE[failure];
  const [code, setCode] = useState(raw ?? '');
  const retryable = failure === 'connection_failed';
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const c = normalizeRoomCode(code);
    if (c) navigate({ name: 'room', code: c });
  };
  return (
    <RoomStatus tab="ACCESS DENIED" stamp={f.stamp} title={f.title}>
      <p className="dossier__text">{f.text}</p>
      {(failure === 'invalid_code' || failure === 'room_not_found') && (
        <form className="joinline" onSubmit={submit}>
          <label className="sr-only" htmlFor="retry-code">Access code</label>
          <input id="retry-code" className="field field--code field--credential" value={code} maxLength={ROOM_CODE.length + 2} autoCapitalize="characters" spellCheck={false} onChange={(e) => setCode(e.target.value)} />
          <Button type="submit" variant="secondary" disabled={!normalizeRoomCode(code)}>Try code</Button>
        </form>
      )}
      <div className="modal__actions">
        <Button variant="secondary" onClick={() => navigate({ name: 'home' })}>Main menu</Button>
        {retryable && <Button onClick={onRetry}>Retry</Button>}
        {failure === 'bad_version' && <Button onClick={() => location.reload()}>Reload</Button>}
      </div>
    </RoomStatus>
  );
}
