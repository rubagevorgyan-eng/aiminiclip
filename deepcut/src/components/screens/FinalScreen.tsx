import { useState, type CSSProperties, type ReactNode } from 'react';
import { GAME, RARITY, rarityOf, zoneIndexForDepth } from '../../config/game.ts';
import type { GameState } from '../../engine/machine.ts';
import { normalize } from '../../engine/match.ts';
import { achievement, otherAnswers, rarestRecord, shareText, type ShareInput } from '../../engine/results.ts';
import { useCountUp } from '../../hooks/useCountUp.ts';
import { copyText } from '../../utils/clipboard.ts';
import { Button } from '../ui/Button.tsx';
import { MineralIcon } from '../ui/MineralIcon.tsx';
import { Modal } from '../ui/Modal.tsx';
import { RarityTag } from '../ui/RarityTag.tsx';

interface Action { label: string; onClick: () => void }
interface Props {
  state: Pick<GameState, 'questions' | 'records' | 'score'>;
  heading: string;
  share: Omit<ShareInput, 'records' | 'score'>;
  newBest?: boolean;
  again: Action;
  onHome: () => void;
  note?: ReactNode;
}

export function FinalScreen({ state, heading, share, newBest, again, onHome, note }: Props) {
  const shown = useCountUp(state.score);
  const { title, zone } = achievement(state.score);
  const zoneColor = RARITY[zoneIndexForDepth(state.score)].color;
  const correct = state.records.filter((r) => r.outcome === 'correct');
  const rarest = rarestRecord(state.records);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'manual'>('idle');
  const text = shareText({ ...share, records: state.records, score: state.score });

  const onShare = async () => setCopied((await copyText(text)) ? 'ok' : 'manual');

  return (
    <section className="screen final" style={{ '--z': zoneColor } as CSSProperties}>
      <header className="final-head">
        <p className="eyebrow">{heading}</p>
        <h1 className="final-title">{title}</h1>
        <p className="dim">Deepest zone: <b className="final-zone">{zone}</b></p>
        <p className="final-depth num" aria-label={`${state.score} meters of ${GAME.maxScore}`}>
          {shown}m<span> / {GAME.maxScore}m</span>
        </p>
        {newBest && <p className="final-best">New personal best</p>}
      </header>

      <dl className="final-stats panel">
        <div><dt className="eyebrow">Score</dt><dd className="num">{state.score}<small>/{GAME.maxScore}</small></dd></div>
        <div><dt className="eyebrow">Correct</dt><dd className="num">{correct.length}<small>/{state.records.length}</small></dd></div>
        <div className="final-rarest">
          <dt className="eyebrow">Rarest answer</dt>
          <dd>{rarest?.rarity ? <><b>{rarest.answer}</b> <RarityTag rarity={rarest.rarity} /></> : <span className="dim">None this dig</span>}</dd>
        </div>
        <div className="final-minerals">
          <dt className="eyebrow">Minerals discovered</dt>
          <dd>
            {correct.length
              ? correct.map((r, i) => <MineralIcon key={i} rarity={r.rarity!} size={22} title={rarityOf(r.rarity!).mineral} />)
              : <span className="dim">None this dig</span>}
          </dd>
        </div>
      </dl>

      <div className="final-actions">
        <Button variant="primary" onClick={onShare} autoFocus>Share results</Button>
        <Button variant="secondary" onClick={again.onClick}>{again.label}</Button>
        <Button variant="ghost" onClick={onHome}>Return home</Button>
      </div>
      <p className="final-copied" aria-live="polite">{copied === 'ok' ? 'Copied to clipboard. No answers included.' : ''}</p>
      {note && <p className="final-note dim">{note}</p>}

      <ol className="breakdown">
        {state.records.map((r, i) => {
          const q = state.questions[i];
          const typed = r.guess && r.answer && normalize(r.guess) !== normalize(r.answer) ? r.guess : null;
          return (
            <li key={r.questionId} className="panel bd" style={r.rarity ? ({ '--r': rarityOf(r.rarity).color } as CSSProperties) : undefined}>
              <div className="bd-head">
                <span className="bd-num num">{i + 1}</span>
                <span className="bd-q">{q?.text ?? 'Question no longer in the bank'}</span>
                <span className="bd-pts num">+{r.points}m</span>
              </div>
              <div className="bd-answer">
                {r.outcome === 'correct' && r.rarity ? (
                  <>
                    <b>{r.answer}</b>
                    {typed && <span className="dim">you typed “{typed}”</span>}
                    <RarityTag rarity={r.rarity} />
                  </>
                ) : (
                  <span className="dim">{r.outcome === 'skipped' ? 'Skipped' : "Time's up"}</span>
                )}
              </div>
              {q && (
                <p className="bd-others">
                  <span className="eyebrow">Also accepted</span>
                  {otherAnswers(q, r.answer).map((a) => (
                    <span key={a.name} className="bd-other">
                      <MineralIcon rarity={a.rarity} size={14} title={rarityOf(a.rarity).mineral} />
                      {a.name}
                    </span>
                  ))}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <Modal open={copied === 'manual'} onClose={() => setCopied('idle')} title="Copy your result">
        <p className="dim">Your browser blocked automatic copying. Select the text below and copy it.</p>
        <textarea className="field share-text" readOnly value={text} rows={6} onFocus={(e) => e.currentTarget.select()} />
      </Modal>
    </section>
  );
}
