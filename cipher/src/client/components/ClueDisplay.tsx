import type { MatchPhase, TurnState } from '../../shared/types.ts';
import { ownerLabel, ownerTone } from '../game/derive.ts';
import { Countdown } from './Countdown.tsx';
import { DecodeText } from '../fx/DecodeText.tsx';
import { PLANS } from '../fx/timing.ts';
import { sfx } from '../sound.ts';

/** The current transmission, shown above the board. */
export function ClueDisplay({ turn, phase, giverName, skew = 0, animateKey = null }: { turn: TurnState | null; phase: MatchPhase; giverName: string | null; skew?: number; animateKey?: string | null }) {
  if (!turn) return null;
  const tone = ownerTone(turn.owner);
  const who = ownerLabel(turn.owner);
  const clue = turn.clue;
  const wordPlan = PLANS.clueWord(clue?.word.length ?? 1);
  const left = turn.guessesAllowed === null ? '∞' : Math.max(0, turn.guessesAllowed - turn.guessesMade);
  return (
    <section className={`clue tone-${tone}`} aria-live="polite" aria-label="Current clue">
      <div className="clue__meta">
        <span className="eyebrow">Turn {String(turn.number).padStart(2, '0')} · {who}</span>
        {phase === 'sudden_death' && <span className="tag tag--danger">Sudden death</span>}
        {phase === 'paused' && <span className="tag">Paused</span>}
        {turn.deadline && phase !== 'paused' && <Countdown deadline={turn.deadline} skew={skew} />}
      </div>
      {clue && phase !== 'awaiting_clue' ? (
        <div className="clue__body">
          {animateKey ? (
            <>
              <DecodeText key={`w${animateKey}`} className="clue__word fx-crt" text={clue.word} plan={wordPlan} onTick={() => sfx.type()} />
              <span className="clue__count" aria-label={`for ${clue.count ?? 'unlimited'}`}>
                <DecodeText key={`n${animateKey}`} text={String(clue.count ?? '∞')} plan={PLANS.clueNumber(wordPlan)} cursor={false} onDone={() => sfx.beep()} />
              </span>
            </>
          ) : (
            <>
              <span className="clue__word">{clue.word}</span>
              <span className="clue__count" aria-label={`for ${clue.count ?? 'unlimited'}`}>{clue.count ?? '∞'}</span>
            </>
          )}
          <span className="clue__left meta">
            {giverName ? `from ${giverName} · ` : ''}{turn.owner.kind === 'side' ? 'no guess limit' : `guesses left ${left}`}
          </span>
        </div>
      ) : (
        <p className="clue__waiting">{phase === 'sudden_death' ? 'No more transmissions. Every guess counts.' : `Awaiting transmission from ${who}`}</p>
      )}
    </section>
  );
}
