/**
 * DEVELOPMENT FIXTURES: fake rooms for visual testing only. Loaded only by the dev-only design lab
 * (`?lab` in `npm run dev`); production builds never include this file.
 * Views go through the real `projectView`, so an operative fixture holds exactly what a real operative would.
 */
import { projectView } from '../../engine/projection.ts';
import { addGuest, createRoom } from '../../server/room.ts';
import { dimensions } from '../../shared/board.ts';
import { competitiveLayout } from '../../shared/config.ts';
import { generateDuetKey } from '../../engine/duet.ts';
import { seededRng, shuffle } from '../../shared/random.ts';
import type {
  BoardSize, CardReveal, ClientView, CompetitiveIdentity, DuetSide, HistoryEntry, ModeId, Player,
  PrivateMatchState, RevealedIdentity, SecretKey, ServerRoom, TurnOwner,
} from '../../shared/types.ts';

/** Placeholder words for layout tests (not the game vocabulary). Includes long words on purpose. */
export const DEV_WORDS = (
  'ANCHOR ATLAS BADGE BALLOON BANDAGE BARREL BEACON BICYCLE BLIZZARD BOOKMARK BRIDGE BUCKET CABIN CACTUS CANDLE CANYON ' +
  'CARNIVAL CASTLE CATHEDRAL CELLAR CHANDELIER CHIMNEY CIRCUIT CLOCKWORK COMPASS CONSTELLATION CORAL CRATER CROWN CRYSTAL ' +
  'CURTAIN DESERT DIAMOND DOMINO DRAGONFLY ECLIPSE EMBASSY ENGINE FEATHER FERRY FOUNTAIN FURNACE GALAXY GARDEN GLACIER ' +
  'GLOVE GRANITE HARBOR HELMET HONEY HOURGLASS ICEBERG INK ISLAND JUNGLE KETTLE LANTERN LIBRARY LIGHTHOUSE LOCKET MAGNET ' +
  'MARBLE MEADOW MICROFILM MIRROR MONSOON NEEDLE ORCHARD PARACHUTE PASSPORT PEPPER PIANO PILOT PLANET POCKET PRISM QUARRY ' +
  'RADAR RAVEN RIBBON SADDLE SATELLITE SCARF SHADOW SIGNAL SILVER SPARROW STATUE SUBMARINE TELESCOPE THERMOSTAT THUNDER ' +
  'TORCH TUNNEL TYPEWRITER UMBRELLA VELVET VIOLIN VOLCANO WALRUS WINDMILL'
).split(' ');

export type Perspective = 'operative' | 'handler' | 'spectator' | 'north' | 'south';
export type FixturePhase = 'awaiting_clue' | 'guessing' | 'sudden_death' | 'paused' | 'completed';
export interface FixtureOptions { mode: ModeId; size: BoardSize; perspective: Perspective; phase: FixturePhase }

const T0 = Date.UTC(2026, 10, 27, 19, 0);

function seat(room: ServerRoom, name: string, patch: Partial<Player>): Player {
  const p = addGuest(room, name, T0).player;
  Object.assign(p, patch);
  return p;
}

function competitiveKey(size: BoardSize, rng: () => number): CompetitiveIdentity[] {
  const l = competitiveLayout(size);
  const ids: CompetitiveIdentity[] = [
    ...Array<CompetitiveIdentity>(l.starting).fill('crimson'),
    ...Array<CompetitiveIdentity>(l.second).fill('cobalt'),
    ...Array<CompetitiveIdentity>(l.civilians).fill('civilian'),
    ...Array<CompetitiveIdentity>(l.moles).fill('mole'),
  ];
  return shuffle(ids, rng);
}

export function buildFixture(o: FixtureOptions): ClientView {
  const duet = o.mode === 'duet';
  const size: BoardSize = duet ? 5 : o.mode === 'classic' ? 5 : o.size;
  const d = dimensions(size);
  const rng = seededRng(`fixture:${o.mode}:${size}`);
  const room = createRoom('K7QX4', o.mode, T0);
  room.settings = { ...room.settings, boardSize: size };

  const roster: Player[] = duet
    ? [seat(room, 'Ada Whitlock', { side: 'north', role: 'operative' }), seat(room, 'Ben Okafor', { side: 'south', role: 'operative' })]
    : [
        seat(room, 'Ada Whitlock', { team: 'crimson', role: 'handler' }),
        seat(room, 'Ben Okafor', { team: 'crimson', role: 'operative' }),
        seat(room, 'Cleo Varga', { team: 'crimson', role: 'operative' }),
        seat(room, 'Dmitri Hale', { team: 'cobalt', role: 'handler' }),
        seat(room, 'Esme Laurent', { team: 'cobalt', role: 'operative', connected: false }),
        seat(room, 'Felix Moreau', { team: 'cobalt', role: 'operative' }),
      ];
  const gus = seat(room, 'Gus Pemberton', { role: 'spectator' });
  const [ada, ben] = roster;
  const viewer = { operative: ben, handler: ada, spectator: gus, north: ada, south: ben }[o.perspective];

  const words = shuffle(DEV_WORDS, rng).slice(0, d.cards);
  const key: SecretKey = duet ? { kind: 'cooperative', sides: generateDuetKey(rng) } : { kind: 'competitive', identities: competitiveKey(size, rng) };
  const reveals: (CardReveal | null)[] = Array(d.cards).fill(null);
  const civilianFor: DuetSide[][] = Array.from({ length: d.cards }, () => []);
  const history: HistoryEntry[] = [];

  // Reveal about a third of the board with a plausible history: clue, then two guesses, per turn.
  const owners: TurnOwner[] = duet ? [{ kind: 'side', side: 'north' }, { kind: 'side', side: 'south' }] : [{ kind: 'team', team: 'crimson' }, { kind: 'team', team: 'cobalt' }];
  const order = shuffle([...Array(d.cards).keys()], rng);
  const want = Math.round(d.cards * 0.32);
  let turnNo = 1, at = T0 + 60_000, done = 0;
  const clueWords = ['ORBIT', 'HARVEST', 'TIDE', 'SMOKE', 'LEDGER', 'NORTH', 'SPIRE', 'ECHO', 'COPPER', 'VEIL', 'FROST', 'RELAY', 'MINT', 'GRAVEL', 'SABLE', 'CINDER', 'QUILL', 'DRIFT', 'ARC', 'LOOM'];
  for (const card of order) {
    if (done >= want) break;
    const owner = owners[(turnNo - 1) % 2];
    let result: RevealedIdentity;
    if (key.kind === 'competitive') {
      const id = key.identities[card];
      if (id === 'mole' && o.phase !== 'completed') continue;
      result = { kind: 'competitive', identity: id };
    } else {
      const giver = owner.kind === 'side' ? owner.side : 'north';
      const id = key.sides[giver][card];
      if (id === 'mole') continue;
      if (id === 'civilian') { civilianFor[card].push(giver); continue; }
      result = { kind: 'cooperative', identity: id, judgedBy: giver };
    }
    if (done % 2 === 0) {
      const by = owner.kind === 'team' ? roster.find((p) => p.team === owner.team && p.role === 'handler')! : owner.side === 'north' ? ada : ben;
      history.push({ type: 'clue', clue: { word: clueWords[turnNo % clueWords.length], count: 2, owner, by: by.id, turn: turnNo, at } });
    }
    const guesser = owner.kind === 'team' ? roster.filter((p) => p.team === owner.team && p.role === 'operative')[done % 2]! : owner.side === 'north' ? ben : ada;
    at += 45_000;
    reveals[card] = { identity: result, portrait: { seed: card * 7919 }, by: guesser.id, turn: turnNo, at };
    history.push({ type: 'guess', guess: { card, owner, by: guesser.id, turn: turnNo, at, result } });
    done++;
    if (done % 2 === 0) {
      history.push({ type: 'end_turn', owner, by: guesser.id, turn: turnNo, at, reason: 'voluntary' });
      turnNo++;
    }
  }

  const count = (id: string) => (key.kind === 'competitive' ? key.identities : []).filter((x, i) => x === id && !reveals[i]).length;
  const duetAgentsLeft = key.kind === 'cooperative' ? key.sides.north.filter((x, i) => (x === 'agent' || key.sides.south[i] === 'agent') && !reveals[i]).length : 0;
  const owner: TurnOwner = duet ? { kind: 'side', side: 'north' } : { kind: 'team', team: 'crimson' };
  const guessing = o.phase === 'guessing' || o.phase === 'paused';
  const clue = guessing ? { word: 'HARBOR' === words[0] ? 'TIDE' : 'MARITIME', count: 2, owner, by: ada.id, turn: turnNo, at } : null;
  if (clue) history.push({ type: 'clue', clue });

  const hidden = reveals.map((r, i) => (r ? -1 : i)).filter((i) => i >= 0);
  const match: PrivateMatchState = {
    id: 'm_devfixture01',
    rules: { suggestions: true, bonusGuess: true, specialClues: true, tokens: 9 },
    revision: history.length,
    startingTeam: duet ? null : 'crimson',
    mode: o.mode,
    dimensions: d,
    phase: o.phase,
    resumePhase: o.phase === 'paused' ? 'guessing' : null,
    turn: o.phase === 'completed' ? null : { number: turnNo, owner, clue, guessesMade: guessing ? 1 : 0, guessesAllowed: clue ? 3 : null, deadline: null, ...(duet ? { turnsLeft: o.phase === 'sudden_death' ? 0 : 4 } : {}) },
    history,
    suggestions: guessing
      ? [
          { card: hidden[0], by: ben.id, owner, at },
          { card: hidden[0], by: roster[2]?.id ?? ben.id, owner, at },
          { card: hidden[1], by: roster[2]?.id ?? ben.id, owner, at },
          ...(duet ? [] : [{ card: hidden[2], by: roster[5].id, owner: { kind: 'team', team: 'cobalt' } as TurnOwner, at }]),
        ]
      : [],
    remaining: duet ? { agents: duetAgentsLeft } : { crimson: count('crimson'), cobalt: count('cobalt') },
    result: o.phase === 'completed'
      ? { outcome: duet ? { kind: 'cooperative_loss' } : { kind: 'team_win', team: 'crimson' }, reason: duet ? 'mole_revealed' : 'all_agents_found', turns: turnNo, startedAt: T0, completedAt: at + 30_000, stats: { teams: {}, players: {} } }
      : null,
    startedAt: T0,
    seed: 'dev-fixture-seed',
    words,
    key,
    portraits: words.map((_, i) => i * 7919),
    reveals,
    civilianFor,
  };
  room.match = match;
  room.matchCount = 1;
  room.chat = [
    { id: 'c1', kind: 'system', channel: 'system', by: null, name: 'System', text: 'Secure channel opened. Room K7QX4.', at: T0 },
    { id: 'c2', kind: 'player', channel: 'global', by: ada.id, name: ada.name, text: 'Evening, operatives. Keep it clean.', at: T0 + 20_000 },
    { id: 'c3', kind: 'player', channel: 'global', by: ben.id, name: ben.name, text: 'Ready when you are.', at: T0 + 40_000 },
    { id: 'c4', kind: 'player', channel: 'global', by: gus.id, name: gus.name, text: 'Watching from the gallery 👀', at: T0 + 70_000 },
  ];
  return projectView(room, viewer.id);
}
