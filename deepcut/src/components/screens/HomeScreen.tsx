import { useState } from 'react';
import { BRAND } from '../../config/game.ts';
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

      <div className="home-grid">
        <div className="home-main float-card">
          <h1 className="sr-only">DEEPCUT</h1>
          <Wordmark />
          <p className="home-tagline">{BRAND.tagline}</p>

          <dl className="home-stats">
            <div><dt className="eyebrow">Best depth</dt><dd className="num">{progress.bestDepth}m</dd></div>
            <div><dt className="eyebrow">Daily streak</dt><dd className="num">{streak}</dd></div>
          </dl>

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
          </div>
          {loadError && <p className="feedback feedback--error" role="alert">Couldn't load the questions. Check your connection and try again.</p>}

          <nav className="home-links" aria-label="More">
            <Button variant="ghost" onClick={() => setHowto(true)}>How to play</Button>
            <Button variant="ghost" onClick={onStats}>Statistics</Button>
            <Button variant="ghost" onClick={onCollection}>Collection</Button>
          </nav>
        </div>

      </div>

      <HowToPlay open={howto} onClose={() => setHowto(false)} />
    </section>
  );
}
