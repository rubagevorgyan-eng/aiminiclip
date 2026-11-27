import type { Player, PublicMatchState } from '../../shared/types.ts';
import { nameOf, ownerLabel, ownerTone } from '../game/derive.ts';
import { groupHistory, resultLine } from '../game/history.ts';
import { pad2, toneOfReveal } from '../game/identity.ts';

const END: Record<string, string> = { voluntary: 'stopped', wrong_guess: 'turn over', limit: 'limit reached', timeout: 'time expired' };
const outcome = (identity: string, judged?: string) => (identity === 'agent' ? `agent${judged ? ` (${judged} key)` : ''}` : identity === 'mole' ? 'assassin' : identity === 'civilian' ? `civilian${judged ? ` (${judged} key)` : ''}` : `${identity} agent`);

/**
 * Intelligence history: every public clue with the guesses made on it and their outcomes. Selecting a
 * clue highlights the cards guessed that turn (a purely local view: nothing is sent).
 */
export function HistoryPanel({ match, players, open, onToggle, selected, onSelect }: { match: PublicMatchState; players: readonly Player[]; open: boolean; onToggle: () => void; selected: number | null; onSelect: (turn: number | null) => void }) {
  return (
    <section className={`history panel ${open ? '' : 'is-collapsed'}`} aria-label="Intelligence history">
      <header className="dock__head">
        <button type="button" className="dock__title" aria-expanded={open} onClick={onToggle}>
          <span className="dock__caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
          Intelligence history
        </button>
        {open && selected !== null && <button type="button" className="linkbtn" onClick={() => onSelect(null)}>Clear highlight</button>}
      </header>
      {open && <HistoryList match={match} players={players} selected={selected} onSelect={onSelect} />}
    </section>
  );
}

/** The turn-by-turn list (also shown inside the mission report). */
export function HistoryList({ match, players, selected = null, onSelect }: { match: PublicMatchState; players: readonly Player[]; selected?: number | null; onSelect?: (turn: number | null) => void }) {
  const turns = groupHistory(match.history);
  return (
        <ol className="hist">
          {turns.length === 0 && <li className="meta">No transmissions yet.</li>}
          {turns.map((t) => {
            const owner = t.clue?.owner ?? t.ended?.owner ?? t.guesses[0]?.owner;
            return (
              <li key={t.turn} className={`hist__turn ${owner ? `tone-${ownerTone(owner)}` : ''} ${selected === t.turn ? 'is-selected' : ''}`}>
                <button type="button" className="hist__clue" aria-pressed={selected === t.turn} disabled={!t.guesses.length || !onSelect} onClick={() => onSelect?.(selected === t.turn ? null : t.turn)} title={t.guesses.length ? 'Highlight the cards guessed this turn' : undefined}>
                  <span className="hist__t mono">T{pad2(t.turn)}</span>
                  <span className="hist__who">{owner ? ownerLabel(owner) : ''}</span>
                  {t.clue ? <span className="hist__word">{t.clue.word} · {t.clue.count ?? '∞'}</span> : <span className="meta">no clue</span>}
                </button>
                <ul className="hist__guesses">
                  {t.guesses.map((g, i) => {
                    const judged = g.result.kind === 'cooperative' ? (g.result.judgedBy === 'north' ? 'A' : 'B') : undefined;
                    return (
                      <li key={i} className={`hist__guess tone-${toneOfReveal(g.result)}`}>
                        <i className="dot" aria-hidden="true" />
                        <span className="hist__card mono">{pad2(g.card + 1)}</span> {match.cards[g.card]?.word} <span className="meta">· {outcome(g.result.identity, judged)} · {nameOf(players, g.by)}</span>
                      </li>
                    );
                  })}
                  {t.ended && <li className="hist__end meta">{END[t.ended.reason]}</li>}
                </ul>
              </li>
            );
          })}
          {match.result && <li className="hist__result">{resultLine(match.result)}</li>}
        </ol>
  );
}
