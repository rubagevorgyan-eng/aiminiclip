import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { GAME, RARITY, rarityOf, type RarityId } from '../../config/game.ts';
import { timeLeft, type GameState } from '../../engine/machine.ts';
import { suggestAnswer } from '../../engine/match.ts';
import { playFind, playMiss, playTick, playWrong } from '../../audio/sfx.ts';
import { useCountUp } from '../../hooks/useCountUp.ts';
import { useKeyboardInset } from '../../hooks/useKeyboardInset.ts';
import { Button } from '../ui/Button.tsx';
import { MineralIcon } from '../ui/MineralIcon.tsx';
import { Wordmark } from '../ui/Wordmark.tsx';

interface Props {
  state: GameState;
  now: number;
  onSubmit: (text: string) => void;
  onSkip: () => void;
}

export function RoundScreen({ state, now, onSubmit, onSkip }: Props) {
  const [text, setText] = useState('');
  const [shaking, setShaking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const keyboard = useKeyboardInset();
  const q = state.questions[state.round];
  const total = state.questions.length;
  const asking = state.phase === 'QUESTION';
  const resolved = state.phase === 'ROUND_RESULT';
  const qms = GAME.secondsPerQuestion * 1000;
  const ms = asking ? Math.min(qms, timeLeft(state, now)) : 0; // the reveal grace before the clock is not shown
  const secs = Math.ceil(ms / 1000);
  const warn = asking && secs <= GAME.timerWarningSeconds;
  const lastWrong = state.wrong[state.wrong.length - 1];
  const last = state.records[state.records.length - 1];
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

  // Each new question: empty field, focused, ready to type. The field stays mounted between rounds so
  // a phone keyboard stays open. A short arming delay stops an Enter held or repeated from the last
  // round from submitting into the new one.
  const armedAt = useRef(0);
  useEffect(() => {
    if (!asking) return;
    setText('');
    armedAt.current = Date.now() + 250;
    input.current?.focus();
  }, [state.round, asking]);
  // Round resolved: show the accepted canonical answer in the field.
  useEffect(() => {
    if (resolved) setText(last?.outcome === 'correct' ? last.answer ?? '' : '');
  }, [resolved]);

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

  // "Did you mean…?" for the latest wrong guess. Enter (with the guess unchanged) or a tap accepts it.
  const suggestion = useMemo(() => (lastWrong ? suggestAnswer(q, lastWrong) : null), [q, lastWrong]);
  const acceptSuggestion = () => {
    if (!suggestion) return;
    onSubmit(suggestion.name);
    input.current?.focus();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    input.current?.focus();
    if (!asking || Date.now() < armedAt.current) return; // resolved round or just-started question
    const guess = text.trim();
    if (!guess) return;
    if (suggestion && text === lastWrong) return acceptSuggestion();
    if (guess === lastWrong?.trim()) {
      // Same wrong guess again: nudge, don't count it twice.
      setShaking(true);
      input.current?.select();
      return void setTimeout(() => setShaking(false), 300);
    }
    onSubmit(guess);
  };
  // Buttons must not take focus from the field (it would close a phone keyboard).
  const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();
  const accepted = resolved && last?.outcome === 'correct' && last.rarity ? rarityOf(last.rarity) : null;

  return (
    <section className={`round-stage${keyboard ? ' is-kb' : ''}`}>
      <div className="timer" role="timer" aria-label={asking ? `${secs} seconds left` : undefined}>
        <i
          key={`${state.round}-${asking}`}
          className={`${asking ? 'is-running' : ''}${warn ? ' is-warn' : ''}`}
          style={{ animationDuration: `${qms}ms`, animationDelay: `${-offset}ms`, '--left': ms / qms } as CSSProperties}
        />
      </div>

      <header className="hud">
        <Wordmark size="sm" />
        <div className="hud-round">
          <ol className="pips" aria-label={`Question ${state.round + 1} of ${total}`}>
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
          <span className="eyebrow">Question <b className="num">{state.round + 1}</b> of {total}</span>
          {found.length > 0 && (
            <span className="hud-found" aria-label={`Found: ${found.map((r) => rarityOf(r).mineral).join(', ')}`}>
              {found.map((r, i) => <MineralIcon key={i} rarity={r} size={14} />)}
            </span>
          )}
        </div>
        <span aria-hidden="true" />
      </header>

      <div className="stage-card">
        {asking ? (
          <div key={state.round} className="qcard panel">
            <div className="qcard-meta">
              <span className="eyebrow">{q.category}</span>
              <span className="eyebrow">Rarer answers dig deeper</span>
            </div>
            <h1 className="question">{q.text}</h1>
          </div>
        ) : last?.outcome === 'correct' && last.rarity ? (
          <RoundResult rarity={last.rarity} answer={last.answer!} correctedFrom={last.corrected ? last.guess : undefined} />
        ) : (
          <div className="result result--miss panel" aria-live="assertive">
            <div>
              <p className="result-title">{last?.outcome === 'skipped' ? 'Skipped' : "Time's up"}</p>
              <p className="dim">Nothing found this round.</p>
            </div>
            <p className="result-meta num">+0m</p>
          </div>
        )}
      </div>

      <div className="stage-gap" aria-hidden="true" />

      {(asking || resolved) && (
        <div className="dock">
          <p className={`feedback${lastWrong && asking ? ' feedback--error' : ''}`} aria-live="polite">
            {resolved ? (
              accepted ? (
                <>
                  Accepted: <b>{last!.answer}</b> · {accepted.label} · +{accepted.points}m
                </>
              ) : (
                'Next question coming up.'
              )
            ) : lastWrong ? (
              suggestion ? (
                <>
                  <b>“{lastWrong}”</b> isn't on the list. Did you mean{' '}
                  <button type="button" className="suggest" onPointerDown={keepFocus} onClick={acceptSuggestion}>
                    {suggestion.name}
                  </button>
                  ?
                </>
              ) : (
                <>
                  <b>“{lastWrong}”</b> isn't on the list. Try another.
                </>
              )
            ) : (
              'Type any correct answer. Wrong guesses can be retried.'
            )}
          </p>
          <form className="answer" onSubmit={submit}>
            <span className={`dock-secs num${warn ? ' is-warn' : ''}`} aria-hidden="true">{asking ? secs : 0}</span>
            <input
              ref={input}
              className={`field${shaking ? ' is-error' : ''}${accepted ? ' is-accepted' : ''}`}
              style={accepted ? ({ '--r': accepted.color } as CSSProperties) : undefined}
              autoFocus
              readOnly={!asking}
              value={text}
              onChange={(e) => asking && setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.repeat) e.preventDefault(); // a held Enter never submits again
              }}
              placeholder="Type your answer…"
              aria-label="Your answer"
              aria-invalid={shaking || undefined}
              name="deepcut-answer"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
            />
            <Button variant="primary" type="submit" silent disabled={!asking} onPointerDown={keepFocus}>Dig</Button>
            <Button variant="secondary" onClick={onSkip} silent disabled={!asking} onPointerDown={keepFocus}>Skip</Button>
          </form>
        </div>
      )}
    </section>
  );
}

const BURST = { rare: 6, legendary: 10, mythic: 16 } as Partial<Record<RarityId, number>>;

function RoundResult({ rarity, answer, correctedFrom }: { rarity: RarityId; answer: string; correctedFrom?: string }) {
  const t = rarityOf(rarity);
  const pts = useCountUp(t.points, 450);
  const sparks = BURST[rarity] ?? 0;
  return (
    <div className="result panel" data-tier={t.id} style={{ '--r': t.color } as CSSProperties} aria-live="assertive">
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
        {correctedFrom && <p className="result-corrected dim">Auto-corrected from “{correctedFrom}”</p>}
        <p className="eyebrow">{t.label} answer</p>
      </div>
      <p className="result-meta num">+{pts}m</p>
    </div>
  );
}
