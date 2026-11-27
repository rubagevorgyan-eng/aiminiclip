import { memo, type CSSProperties } from 'react';
import type { PublicCard } from '../../shared/types.ts';
import { pad2, type Tone } from '../game/identity.ts';
import { RevealedCard } from './RevealedCard.tsx';
import { IdentityGlyph } from './IdentityGlyph.tsx';
import { DecodeText } from '../fx/DecodeText.tsx';
import { boardPlan } from '../fx/timing.ts';

export interface WordCardProps {
  card: PublicCard;
  /** Only passed for viewers who hold a key (handlers, own Duet side). Never derived on the client. */
  keyTone?: Tone | null;
  selected?: boolean;
  /** Highlighted from the intelligence history (local view only). */
  traced?: boolean;
  /** Names of teammates suggesting this card. */
  suggestedBy?: string[];
  /** Duet: stations for which this card was already revealed as a civilian. */
  civilianFor?: string[];
  disabled?: boolean;
  onSelect?: (index: number) => void;
  /** Board initialization / rematch: decode this word (presentation only). */
  decode?: { key: number | string; size: number; from?: string } | null;
  /** The card was revealed just now (play its reveal animation once). */
  fresh?: boolean;
  /** Duet: a civilian marker was just added. */
  freshMark?: boolean;
}

const KEY_LABEL: Record<Tone, string> = { crimson: 'Crimson agent', cobalt: 'Cobalt agent', agent: 'Field agent', neutral: 'Civilian', assassin: 'Mole' };

/** An ivory word card. Hidden cards are buttons; revealed cards render as identity cards. */
/** Large boards re-render often: skip cards whose visible props did not change. */
export const WordCard = memo(WordCardView, sameCard);

function sameCard(a: WordCardProps, b: WordCardProps): boolean {
  return (
    a.card.index === b.card.index && a.card.word === b.card.word && a.card.reveal?.at === b.card.reveal?.at && (a.card.civilianFor ?? []).join() === (b.card.civilianFor ?? []).join() &&
    a.keyTone === b.keyTone && a.selected === b.selected && a.traced === b.traced && a.disabled === b.disabled && a.fresh === b.fresh && a.freshMark === b.freshMark &&
    (a.suggestedBy ?? []).join() === (b.suggestedBy ?? []).join() && (a.civilianFor ?? []).join() === (b.civilianFor ?? []).join() &&
    a.decode?.key === b.decode?.key && a.decode?.from === b.decode?.from && !!a.decode === !!b.decode
    // onSelect is ignored on purpose: callers pass a stable functional updater.
  );
}

function WordCardView({ card, keyTone = null, selected = false, traced = false, suggestedBy = [], civilianFor = [], disabled = false, onSelect, decode = null, fresh = false, freshMark = false }: WordCardProps) {
  if (card.reveal) return <RevealedCard word={card.word} index={card.index} reveal={card.reveal} traced={traced} fresh={fresh} />;
  const no = pad2(card.index + 1);
  const label = [
    `${no} ${card.word}`,
    keyTone && `key: ${KEY_LABEL[keyTone]}`,
    suggestedBy.length > 0 && `suggested by ${suggestedBy.join(', ')}`,
    civilianFor.length > 0 && `civilian for ${civilianFor.join(' and ')}`,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <button
      type="button"
      className={`card card--hidden ${keyTone ? `key-${keyTone}` : ''} ${selected ? 'is-selected' : ''} ${traced ? 'is-traced' : ''} ${freshMark ? 'is-marked-fresh' : ''}`.trim()}
      style={decode ? ({ '--len': card.word.length } as CSSProperties) : undefined}
      aria-pressed={selected}
      aria-label={label}
      disabled={disabled}
      onClick={() => onSelect?.(card.index)}
    >
      <span className="card__no">{no}</span>
      {keyTone && (
        <span className="card__key" aria-hidden="true">
          <IdentityGlyph tone={keyTone} />
        </span>
      )}
      {decode ? (
        <DecodeText className="card__word" text={card.word} plan={boardPlan(card.index, decode.size, card.word.length)} from={decode.from} runKey={decode.key} cursor={false} seed={card.index} />
      ) : (
        <span className="card__word" style={{ '--len': card.word.length } as CSSProperties}>{card.word}</span>
      )}
      {suggestedBy.length > 0 && (
        <span className="card__pips" aria-hidden="true">
          {suggestedBy.slice(0, 3).map((n, i) => (
            <span key={i} className="pip">{n.slice(0, 1).toUpperCase()}</span>
          ))}
          {suggestedBy.length > 3 && <span className="pip">+</span>}
        </span>
      )}
      {civilianFor.length > 0 && (
        <span className="card__marks" aria-hidden="true">
          {civilianFor.map((s) => (
            <span key={s} className="mark" title={`Civilian for ${s}`}>{s.slice(-1).toUpperCase()}</span>
          ))}
        </span>
      )}
    </button>
  );
}
