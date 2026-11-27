import type { CSSProperties } from 'react';
import type { CardReveal } from '../../shared/types.ts';
import { identityLabel, pad2, toneOfReveal } from '../game/identity.ts';
import { Portrait } from './Portrait.tsx';
import { IdentityGlyph } from './IdentityGlyph.tsx';
import { DecodeText } from '../fx/DecodeText.tsx';
import { useAnimations } from '../fx/motion.ts';
import { PLANS } from '../fx/timing.ts';

/**
 * Face of a revealed card: identity color, its portrait (supplied art or a placeholder) and the word,
 * which always stays readable.
 */
export function RevealedCard({ word, index, reveal, compact = false, traced = false, fresh = false }: { word: string; index: number; reveal: CardReveal; compact?: boolean; traced?: boolean; fresh?: boolean }) {
  const on = useAnimations();
  const live = fresh && on;
  const tone = toneOfReveal(reveal.identity);
  const label = identityLabel(reveal.identity);
  return (
    <div
      className={`card card--revealed tone-${tone} ${compact ? 'card--compact' : ''} ${traced ? 'is-traced' : ''} ${live ? 'is-fresh' : ''}`.trim()}
      aria-label={`${pad2(index + 1)} ${word}, revealed: ${label}`}
      role="img"
      tabIndex={-1}
    >
      <span className="card__no">{pad2(index + 1)}</span>
      <IdentityGlyph tone={tone} className="card__glyph" />
      <span className="card__portrait" aria-hidden="true">
        {reveal.portrait && <Portrait identity={reveal.identity} seed={reveal.portrait.seed} />}
      </span>
      {live ? <DecodeText className="card__id" text={label.toUpperCase()} plan={PLANS.revealLabel(label.length)} cursor={false} seed={index} /> : <span className="card__id">{label}</span>}
      {live && tone === 'assassin' && <span className="card__alert" aria-hidden="true">Access compromised</span>}
      <span className="card__word" style={{ '--len': word.length } as CSSProperties}>{word}</span>
    </div>
  );
}
