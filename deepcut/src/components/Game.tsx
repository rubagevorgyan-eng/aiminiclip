import { useEffect, useRef, useState } from 'react';
import { dailyNumber, dailyQuestions, msUntilNextDaily, questionById, unlimitedQuestions, utcDateKey } from '../data/selection.ts';
import { playComplete } from '../audio/sfx.ts';
import { rarityIndex, zoneIndexForDepth } from '../config/game.ts';
import { depth, timeLeft, type GameState } from '../engine/machine.ts';
import type { Question } from '../engine/types.ts';
import { formatCountdown, useNow } from '../hooks/useNow.ts';
import { useGame } from '../hooks/useGame.ts';
import { browserKV } from '../storage/storage.ts';
import { addDaily, addGame, addRecent, loadProgress, saveProgress, type Progress } from '../storage/progress.ts';
import { MineScene } from './MineScene.tsx';
import { SiteHeader } from './ui/SiteHeader.tsx';
import { CollectionScreen } from './screens/CollectionScreen.tsx';
import { CountdownScreen } from './screens/CountdownScreen.tsx';
import { FinalScreen } from './screens/FinalScreen.tsx';
import { HomeScreen } from './screens/HomeScreen.tsx';
import { RoundScreen } from './screens/RoundScreen.tsx';
import { StatsScreen } from './screens/StatsScreen.tsx';
import './screens/screens.css';

type Mode = { kind: 'daily'; date: string } | { kind: 'unlimited'; id: string };
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
type Page = 'home' | 'stats' | 'collection' | { daily: string };

/** Screen routing, game modes and persistence. Game rules live in the engine. */
export default function Game() {
  const { state, now, start, submit, skip, quit } = useGame();
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [mode, setMode] = useState<Mode | null>(null);
  const [page, setPage] = useState<Page>('home');
  const recorded = useRef<GameState['records'] | null>(null);
  const [newBest, setNewBest] = useState(false);
  const clock = useNow(1000);

  const commit = (fn: (p: Progress) => Progress) => {
    // Always build on what's stored, so double effects (StrictMode) or other tabs can't double count.
    const next = fn(loadProgress());
    saveProgress(next);
    setProgress(next);
  };

  // A dig only lives in this page: leaving or reloading always starts fresh on the home screen.
  // Clear the in-progress save older versions kept, so nothing tries to resume it.
  useEffect(() => browserKV.removeItem('deepcut.activeDaily.v1'), []);

  // Record each finished game exactly once.
  useEffect(() => {
    if (state.phase !== 'FINAL_RESULTS' || !mode || recorded.current === state.records) return;
    recorded.current = state.records;
    playComplete(zoneIndexForDepth(state.score));
    setNewBest(state.score > 0 && state.score > loadProgress().bestDepth);
    if (mode.kind === 'daily') {
      commit((p) => addDaily(p, mode.date, { ids: state.questions.map((q) => q.id), records: state.records, score: state.score }));
    } else {
      commit((p) => addGame(p, state.records, state.score, mode.id));
    }
  }, [state, mode]);

  const begin = (m: Mode, qs: Question[]) => {
    recorded.current = null;
    setNewBest(false);
    setMode(m);
    setPage('home');
    commit((p) => addRecent(p, qs.map((q) => q.id)));
    start(qs);
  };
  const playDaily = () => {
    const today = utcDateKey(Date.now());
    if (loadProgress().daily.results[today]) return setPage({ daily: today });
    begin({ kind: 'daily', date: today }, dailyQuestions(today));
  };
  const playUnlimited = () => begin({ kind: 'unlimited', id: newId() }, unlimitedQuestions(loadProgress().recent));
  const home = () => {
    quit();
    setMode(null);
    setPage('home');
  };

  const screen = (() => {
  if (state.phase === 'HOME') {
    if (page === 'stats') return <StatsScreen progress={progress} onBack={() => setPage('home')} />;
    if (page === 'collection') return <CollectionScreen progress={progress} onBack={() => setPage('home')} />;
    if (typeof page === 'object') {
      const r = progress.daily.results[page.daily];
      if (r)
        return (
          <FinalScreen
            heading={`Daily Dig #${dailyNumber(page.daily)} · ${page.daily}`}
            state={{ questions: r.ids.map(questionById) as Question[], records: r.records, score: r.score }}
            share={{ mode: 'daily', dailyNumber: dailyNumber(page.daily), date: page.daily }}
            note={<>Next Daily Dig in <span className="num">{formatCountdown(msUntilNextDaily(clock))}</span></>}
            again={{ label: 'Unlimited Dig', onClick: playUnlimited }}
            onHome={() => setPage('home')}
          />
        );
    }
    return <HomeScreen progress={progress} onDaily={playDaily} onUnlimited={playUnlimited} onStats={() => setPage('stats')} onCollection={() => setPage('collection')} />;
  }

  if (state.phase === 'COUNTDOWN') return <CountdownScreen secs={Math.max(1, Math.ceil(timeLeft(state, now) / 1000))} />;

  if (state.phase === 'FINAL_RESULTS') {
    if (mode?.kind === 'daily')
      return (
        <FinalScreen
          heading={`Daily Dig #${dailyNumber(mode.date)} complete`}
          state={state}
          share={{ mode: 'daily', dailyNumber: dailyNumber(mode.date), date: mode.date }}
          newBest={newBest}
          note={<>Next Daily Dig in <span className="num">{formatCountdown(msUntilNextDaily(clock))}</span></>}
          again={{ label: 'Unlimited Dig', onClick: playUnlimited }}
          onHome={home}
        />
      );
    return (
      <FinalScreen
        heading="Unlimited Dig complete"
        state={state}
        share={{ mode: 'unlimited' }}
        newBest={newBest}
        again={{ label: 'Play again', onClick: playUnlimited }}
        onHome={home}
      />
    );
  }

  return (
    <RoundScreen
      state={state}
      now={now}
      onSubmit={submit}
      onSkip={skip}
    />
  );
  })();

  const playing = state.phase !== 'HOME';
  const lastRecord = state.records[state.records.length - 1];
  return (
    <>
      <MineScene
        ambient={!playing}
        hud={playing && state.phase !== 'FINAL_RESULTS' && state.phase !== 'COUNTDOWN'}
        dim={state.phase === 'FINAL_RESULTS' || (state.phase === 'HOME' && page !== 'home')}
        depth={playing ? depth(state) : 0}
        digs={playing ? state.records.length : 0}
        tier={lastRecord?.rarity ? rarityIndex(lastRecord.rarity) : null}
      />
      <SiteHeader onQuit={playing && state.phase !== 'FINAL_RESULTS' ? home : undefined} />
      <div className={`stage${playing && state.phase !== 'FINAL_RESULTS' ? ' is-playing' : ' is-menu'}`}>{screen}</div>
    </>
  );
}
