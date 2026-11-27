import { useState } from 'react';
import { BRAND, GAME } from '../../config/game.ts';
import { formatCountdown, useNow } from '../../hooks/useNow.ts';
import { dailyNumber, msUntilNextDaily, utcDateKey } from '../../data/selection.ts';
import { currentStreak, type Progress } from '../../storage/progress.ts';
import { Button } from '../ui/Button.tsx';
import { Wordmark } from '../ui/Wordmark.tsx';
import { HowToPlay } from './HowToPlay.tsx';

interface Props {
  progress: Progress;
  /** Name of the dig whose questions are loading, if any. */
  loading?: string | null;
  loadError?: boolean;
  onDaily: () => void;
  onUnlimited: () => void;
  onStats: () => void;
  onCollection: () => void;
}

export function HomeScreen({ progress, loading, loadError, onDaily, onUnlimited, onStats, onCollection }: Props) {
  const [howto, setHowto] = useState(false);
  const now = useNow(1000);
  const today = utcDateKey(now);
  const done = progress.daily.results[today];
  const streak = currentStreak(progress, today);

  return (
    <section className="screen home">
      <header className="home-brand">
        <h1 className="sr-only">DEEPCUT</h1>
        <Wordmark />
        <p className="home-tagline">{BRAND.tagline}</p>
        <p className="home-rules">
          {GAME.roundsPerGame} questions <span aria-hidden="true">•</span> {GAME.secondsPerQuestion} seconds each <span aria-hidden="true">•</span> Rarer answers mine deeper
        </p>
      </header>

      <div className="home-actions">
        {done ? (
          <Button variant="secondary" className="btn--stack" onClick={onDaily}>
            View Daily Dig #{dailyNumber(today)}
            <small>{done.score}m · next dig in {formatCountdown(msUntilNextDaily(now))}</small>
          </Button>
        ) : (
          <Button variant="primary" className="btn--stack" onClick={onDaily} autoFocus disabled={!!loading}>
            Daily Dig #{dailyNumber(today)}
            <small>{loading === 'Daily Dig' ? 'Loading questions…' : 'Same 7 questions for everyone today'}</small>
          </Button>
        )}
        <Button variant={done ? 'primary' : 'secondary'} className="btn--stack" onClick={onUnlimited} autoFocus={!!done} disabled={!!loading}>
          Unlimited Dig
          <small>{loading === 'Unlimited Dig' ? 'Loading questions…' : 'Random questions, play as often as you like'}</small>
        </Button>
        {loadError && <p className="feedback feedback--error" role="alert">Couldn't load the questions. Check your connection and try again.</p>}
      </div>

      <nav className="home-links" aria-label="More">
        <Button variant="ghost" onClick={() => setHowto(true)}>How to play</Button>
        <Button variant="ghost" onClick={onStats}>Statistics</Button>
        <Button variant="ghost" onClick={onCollection}>Collection</Button>
      </nav>
      <p className="home-meta num">
        Best depth <b>{progress.bestDepth}m</b> <span aria-hidden="true">·</span> Daily streak <b>{streak}</b>
      </p>

      <HowToPlay open={howto} onClose={() => setHowto(false)} />
    </section>
  );
}
