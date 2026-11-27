import type { KeyView, MatchPhase, PublicCard } from '../../shared/types.ts';

/**
 * Duet operation status: shared agents recovered, turn tokens left, and (for a partner) how many
 * agents on their own key are still hidden, computed from their own key only.
 */
export function DuetStatus({ found, total, tokensLeft, tokensTotal, phase, myKey, cards }: { found: number; total: number; tokensLeft: number; tokensTotal: number; phase: MatchPhase; myKey: KeyView | null; cards: readonly PublicCard[] }) {
  const own = myKey?.kind === 'cooperative' ? myKey.identities.filter((id, i) => id === 'agent' && !cards[i]?.reveal).length : null;
  return (
    <section className="duetstat panel" aria-label="Operation status">
      <div className="duetstat__item">
        <span className="eyebrow">Agents recovered</span>
        <span className="duetstat__num mono">{found}<small>/{total}</small></span>
        <span className="duetstat__pips" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => <i key={i} className={i < found ? 'is-on' : ''} />)}
        </span>
      </div>
      <div className="duetstat__item">
        <span className="eyebrow">Turn tokens</span>
        <span className="duetstat__num mono">{tokensLeft}<small>/{tokensTotal}</small></span>
        <span className="duetstat__tokens" aria-hidden="true">
          {Array.from({ length: tokensTotal }, (_, i) => <i key={i} className={i < tokensLeft ? 'is-on' : ''} />)}
        </span>
      </div>
      {own !== null && (
        <div className="duetstat__item">
          <span className="eyebrow">Your key</span>
          <span className="duetstat__num mono">{own}<small> left</small></span>
          <span className="meta">{own === 0 ? 'All yours found: you only guess now.' : 'agents only you can clue'}</span>
        </div>
      )}
      {phase === 'sudden_death' && <span className="tag tag--danger duetstat__sd">Sudden death: any wrong guess loses</span>}
    </section>
  );
}
