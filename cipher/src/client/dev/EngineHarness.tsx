/**
 * DEVELOPMENT ONLY engine harness (`npm run dev`, open /?harness). Runs the real competitive engine
 * through the real room runner and projection, entirely in this tab, with switchable handler /
 * operative / spectator views. Not a multiplayer route and absent from production builds.
 */
import { useMemo, useRef, useState } from 'react';
import { applyLobby } from '../../server/lobby.ts';
import { applyGameMessage, isGameMessage, startCompetitiveMatch } from '../../server/match.ts';
import { addGuest, createRoom } from '../../server/room.ts';
import { projectView } from '../../engine/projection.ts';
import type { ClientMessage } from '../../net/protocol.ts';
import { seededRng } from '../../shared/random.ts';
import { defaultBank } from '../../vocab/index.ts';
import type { Player, ServerRoom, TeamId } from '../../shared/types.ts';
import { Button } from '../components/Button.tsx';
import { Segmented } from '../components/Segmented.tsx';
import { Stamp } from '../components/Stamp.tsx';
import { useNotify } from '../components/Toasts.tsx';
import { GameScreen } from '../screens/GameScreen.tsx';
import './lab.css';

type Seat = 'crimson-handler' | 'crimson-operative' | 'cobalt-handler' | 'cobalt-operative' | 'spectator';
const SEATS: { value: Seat; label: string }[] = [
  { value: 'crimson-handler', label: 'Crimson handler' },
  { value: 'crimson-operative', label: 'Crimson operative' },
  { value: 'cobalt-handler', label: 'Cobalt handler' },
  { value: 'cobalt-operative', label: 'Cobalt operative' },
  { value: 'spectator', label: 'Spectator' },
];

function buildRoom(seed: string, start: TeamId | 'random'): { room: ServerRoom; seats: Record<Seat, Player> } {
  const room = createRoom('HRNSS', 'classic', Date.now());
  const add = (name: string, patch: Partial<Player>) => Object.assign(addGuest(room, name, Date.now()).player, patch);
  const seats: Record<Seat, Player> = {
    'crimson-handler': add('Ada (harness)', { team: 'crimson', role: 'handler' }),
    'crimson-operative': add('Ben (harness)', { team: 'crimson', role: 'operative' }),
    'cobalt-handler': add('Dmitri (harness)', { team: 'cobalt', role: 'handler' }),
    'cobalt-operative': add('Esme (harness)', { team: 'cobalt', role: 'operative' }),
    spectator: add('Gus (harness)', { role: 'spectator' }),
  };
  add('Cleo (harness)', { team: 'crimson', role: 'operative' });
  room.settings.startingTeam = start;
  const r = startCompetitiveMatch(room, defaultBank(), seededRng(seed), seed, Date.now());
  if (!r.ok) throw new Error(r.message);
  return { room, seats };
}

export default function EngineHarness() {
  const notify = useNotify();
  const [seed, setSeed] = useState('harness-1');
  const [start, setStart] = useState<TeamId | 'random'>('random');
  const [seat, setSeat] = useState<Seat>('crimson-handler');
  const [follow, setFollow] = useState(true);
  const [log, setLog] = useState<string[]>([]);
  const [, setTick] = useState(0);
  const game = useRef(buildRoom(seed, start));

  const { room, seats } = game.current;
  const m = room.match!;
  // Auto-follow: show the seat that must act now (handler during a clue, operative while guessing).
  const activeSeat: Seat | null = m.phase === 'completed' || !m.turn || m.turn.owner.kind !== 'team' ? null : `${m.turn.owner.team}-${m.phase === 'awaiting_clue' ? 'handler' : 'operative'}` as Seat;
  const shown: Seat = follow && activeSeat ? activeSeat : seat;
  const view = useMemo(() => projectView(room, seats[shown].id), [room, seats, shown, m.revision, room.chat.length]);

  const record = (line: string) => setLog((l) => [`r${room.match!.revision} · ${line}`, ...l].slice(0, 40));
  const send = (msg: ClientMessage) => {
    const by = seats[shown].id;
    if (msg.t === 'rematch') return reset(`${seed}+`);
    if (isGameMessage(msg)) {
      const r = applyGameMessage(room, by, msg, Date.now());
      if (!r.ok) {
        notify('Rejected', `${r.code}: ${r.message}`, 'danger');
        record(`REJECTED ${msg.t} (${r.code})`);
      } else {
        for (const e of r.events) {
          if (e.type === 'clue_given') { record(`clue ${e.clue.word} ${e.clue.count ?? '∞'}`); e.warnings.forEach((w) => notify('Clue warning', w)); }
          if (e.type === 'card_revealed') record(`reveal #${e.card + 1} ${room.match!.words[e.card]} → ${e.reveal.identity.identity}`);
          if (e.type === 'turn_ended') record(`turn ended (${e.reason})`);
          if (e.type === 'match_ended') record(`MATCH OVER: ${e.result.outcome.kind === 'team_win' ? e.result.outcome.team : ''} wins, ${e.result.reason}`);
        }
        if (msg.t === 'suggest') record(`suggest #${msg.card + 1} ${msg.on ? 'on' : 'off'}`);
      }
    } else {
      const r = applyLobby(room, by, msg, Date.now(), seededRng('chat'));
      if (!r.ok) notify('Rejected', r.message, 'danger');
    }
    setTick((t) => t + 1);
  };
  const reset = (nextSeed = seed) => {
    setSeed(nextSeed);
    game.current = buildRoom(nextSeed, start);
    setLog([]);
    setTick((t) => t + 1);
  };

  return (
    <div className="lab">
      <div className="lab__banner" role="note">
        <Stamp tone="brass" tilt={0}>Dev harness</Stamp>
        <span>Local engine test bench: one tab, no network, not a multiplayer route. Dev builds only.</span>
      </div>
      <div className="lab__bar panel harness__bar">
        <label className="devtools__as">
          Seed
          <input className="field harness__seed" value={seed} onChange={(e) => setSeed(e.target.value)} spellCheck={false} />
        </label>
        <Segmented<TeamId | 'random'> label="First team" value={start} onChange={setStart} options={[{ value: 'random', label: 'Random' }, { value: 'crimson', label: 'Crimson' }, { value: 'cobalt', label: 'Cobalt' }]} />
        <Button size="sm" onClick={() => reset()}>New match</Button>
        <span className="harness__rev mono">rev {m.revision} · {m.phase}</span>
      </div>
      <div className="lab__bar panel harness__bar">
        <Segmented<Seat> label="View as" value={shown} onChange={(v) => (setSeat(v), setFollow(false))} options={SEATS} />
        <label className="switch">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
          <span>Follow active seat</span>
        </label>
      </div>
      <GameScreen key={`${m.id}-${shown}`} view={view} send={send} />
      <details className="panel harness__log" open>
        <summary className="eyebrow">Engine log</summary>
        <ol className="log">{log.map((l, i) => <li key={i} className="log__row"><span className="log__body">{l}</span></li>)}</ol>
      </details>
    </div>
  );
}
