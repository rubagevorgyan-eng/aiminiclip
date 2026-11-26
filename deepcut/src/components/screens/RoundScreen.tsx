import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { GAME, RARITY, rarityOf, type RarityId } from '../../config/game.ts';
import { depth, timeLeft, type GameState } from '../../engine/machine.ts';
import { playFind, playMiss, playTick, playWrong } from '../../audio/sfx.ts';
import { useCountUp } from '../../hooks/useCountUp.ts';
import { useKeyboardInset } from '../../hooks/useKeyboardInset.ts';
import { MineScene } from '../MineScene.tsx';
import { Button } from '../ui/Button.tsx';
import { MineralIcon } from '../ui/MineralIcon.tsx';
import { SettingsMenu } from '../ui/SettingsMenu.tsx';
import { SoundToggle } from '../ui/SoundToggle.tsx';
import { Wordmark } from '../ui/Wordmark.tsx';

interface Props {
  state: GameState;
  now: number;
  onSubmit: (text: string) => void;
  onSkip: () => void;
  onQuit: () => void;
  /** Daily Dig: quitting ends today's attempt. */
  daily?: boolean;
}

export function RoundScreen({ state, now, onSubmit, onSkip, onQuit, daily }: Props) {
  const [text, setText] = useState('');
  const [shaking, setShaking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const keyboard = useKeyboardInset();
  const q = state.questions[state.round];
  const total = state.questions.length;
  const asking = state.phase === 'QUESTION';
  const ms = asking ? timeLeft(state, now) : 0;
  const secs = Math.ceil(ms / 1000);
  const warn = asking && secs <= GAME.timerWarningSeconds;
  const lastWrong = state.wrong[state.wrong.length - 1];
  const last = state.records[state.records.length - 1];
  const qms = GAME.secondsPerQuestion * 1000;
  // The bar drains via one CSS animation started at the right offset (smooth, no per-tick layout).
  const offset = useMemo(() => (asking ? qms - timeLeft(state, Date.now()) : 0), [state.round, state.phaseEndsAt, asking]);
  const found = state.records.filter((r) => r.rarity).map((r) => r.rarity as RarityId);

  // Wrong answer: shake and keep the text selected so the next keystroke replaces it. Timer keeps running.
  useEffect(() => {
    if (!state.wrong.length) return;
    setShaking(true);
    playWrong();
    input.current?.select();
    const id = setTimeout(() => setShaking(false), 300);
    return () => clearTimeout(id);
  }, [state.wrong.length]);

  useEffect(() => setText(''), [state.round]);

  // Sound: a find or a miss when a round ends, ticks in the last seconds.
  const prevRounds = useRef(state.records.length);
  useEffect(() => {
    if (state.records.length > prevRounds.current) {
      const r = state.records[state.records.length - 1];
      if (r.rarity) playFind(RARITY.findIndex((t) => t.id === r.rarity));
      else playMiss();
    }
    prevRounds.current = state.records.length;
  }, [state.records]);
  const tickSec = warn ? secs : null;
  useEffect(() => {
    if (tickSec) playTick(tickSec);
  }, [tickSec]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) onSubmit(text);
    input.current?.focus();
  };

  return (
    <section className={`screen round${keyboard ? ' is-kb' : ''}`}>
      <header className="hud">
        <Wordmark size="sm" />
        <div className="hud-round">
          <span className="eyebrow">
            Round <b className="num">{state.round + 1}</b>/{total}
          </span>
          <ol className="pips" aria-label={`Round ${state.round + 1} of ${total}`}>
            {state.questions.map((_, i) => {
              const r = state.records[i];
              const color = r?.rarity ? rarityOf(r.rarity).color : undefined;
              return (
                <li
                  key={i}
                  className={`pip${i === state.round ? ' pip--now' : ''}${r && !r.rarity ? ' pip--miss' : ''}`}
                  style={color ? ({ '--r': color } as CSSProperties) : undefined}
                  title={r ? (r.rarity ? rarityOf(r.rarity).mineral : 'No find') : undefined}
                />
              );
            })}
          </ol>
        </div>
        <div className="hud-tools">
          <SoundToggle />
          <SettingsMenu
            onQuit={onQuit}
            quitLabel={daily ? 'End Daily Dig' : 'Abandon dig'}
            quitHint={daily ? "Counts as today's attempt" : 'Back to the surface, no score'}
          />
        </div>
      </header>

      <div className="timer" role="timer" aria-label={asking ? `${secs} seconds left` : undefined}>
        <i
          key={`${state.round}-${asking}`}
          className={`${asking ? 'is-running' : ''}${warn ? ' is-warn' : ''}`}
          style={{ animationDuration: `${qms}ms`, animationDelay: `-${offset}ms`, '--left': ms / qms } as CSSProperties}
        />
      </div>

      <div className="round-body">
        <MineScene depth={depth(state)} digs={state.records.length} tier={last?.rarity ? RARITY.findIndex((t) => t.id === last.rarity) : null}>
          <span className="eyebrow">Found</span>
          <span className="mine-found">
            {found.length ? found.map((r, i) => <MineralIcon key={i} rarity={r} size={16} title={rarityOf(r).mineral} />) : <span className="dim">nothing yet</span>}
          </span>
        </MineScene>

        <div className="panel round-panel">
          <div key={state.round} className="round-q">
            <div className="round-meta">
              <span className="eyebrow">{q.category}</span>
              <span className={`round-secs num${warn ? ' is-warn' : ''}`}>{asking ? `${secs}s` : ''}</span>
            </div>
            <h1 className="question">{q.text}</h1>
          </div>

          {asking ? (
            <div className="round-input">
              <form className="answer" onSubmit={submit}>
                <input
                  ref={input}
                  key={state.round}
                  className={`field${shaking ? ' is-error' : ''}`}
                  autoFocus
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type your answer"
                  aria-label="Your answer"
                  aria-invalid={shaking || undefined}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                />
                <div className="answer-actions">
                  <Button variant="primary" type="submit" silent>Dig</Button>
                  <Button variant="secondary" onClick={onSkip} silent>Skip</Button>
                </div>
              </form>
              <p className={`feedback${lastWrong ? ' feedback--error' : ''}`} aria-live="polite">
                {lastWrong ? (
                  <>
                    <b>“{lastWrong}”</b> isn't on the list. Try another.
                  </>
                ) : (
                  'Enter to dig. Wrong answers can be retried until time runs out.'
                )}
              </p>
            </div>
          ) : last?.outcome === 'correct' && last.rarity ? (
            <RoundResult rarity={last.rarity} answer={last.answer!} />
          ) : (
            <div className="result result--miss" aria-live="assertive">
              <div>
                <p className="result-title">{last?.outcome === 'skipped' ? 'Skipped' : "Time's up"}</p>
                <p className="dim">Nothing found this round.</p>
              </div>
              <p className="result-meta num">+0m</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

const BURST = { rare: 6, legendary: 10, mythic: 16 } as Partial<Record<RarityId, number>>;

function RoundResult({ rarity, answer }: { rarity: RarityId; answer: string }) {
  const t = rarityOf(rarity);
  const pts = useCountUp(t.points, 450);
  const sparks = BURST[rarity] ?? 0;
  return (
    <div className="result" data-tier={t.id} style={{ '--r': t.color } as CSSProperties} aria-live="assertive">
      <span className="result-gem">
        <MineralIcon rarity={rarity} size={64} />
        {Array.from({ length: sparks }, (_, i) => (
          <i key={i} className="burst" style={{ '--a': `${(360 / sparks) * i + (i % 2) * 11}deg`, '--d': `${28 + (i % 3) * 10}px` } as CSSProperties} aria-hidden="true" />
        ))}
        {(t.id === 'legendary' || t.id === 'mythic') && <i className="spark" aria-hidden="true" />}
        {t.id === 'mythic' && <i className="spark spark--2" aria-hidden="true" />}
      </span>
      <div className="result-text">
        <p className="result-title">{t.mineral} discovered</p>
        <p className="result-answer">{answer}</p>
        <p className="eyebrow">{t.label} answer</p>
      </div>
      <p className="result-meta num">+{pts}m</p>
    </div>
  );
}
