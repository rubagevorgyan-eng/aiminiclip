import type { PublicCard } from '../../shared/types.ts';
import { pad2 } from '../game/identity.ts';
import { Button } from './Button.tsx';

/** Below the board: selected card, suggest, confirm, end turn. Any active operative can confirm. */
export function GuessControls({ selected, canGuess, suggestedByMe, guessesMade, guessesAllowed, onSuggest, onConfirm, onEndTurn, onClear, canEnd = true, canSuggest = true }: {
  canEnd?: boolean;
  canSuggest?: boolean;
  selected: PublicCard | null;
  canGuess: boolean;
  suggestedByMe: boolean;
  guessesMade: number;
  guessesAllowed: number | null;
  onSuggest: () => void;
  onConfirm: () => void;
  onEndTurn: () => void;
  onClear: () => void;
}) {
  if (!canGuess) return null;
  return (
    <section className="guess panel" aria-label="Guessing controls">
      <div className="guess__sel">
        <span className="eyebrow">Target</span>
        {selected ? (
          <span className="guess__card">
            <span className="mono guess__no">{pad2(selected.index + 1)}</span> {selected.word}
          </span>
        ) : (
          <span className="meta">Select a card on the board</span>
        )}
      </div>
      <span className="meta guess__count">
        Guess {guessesMade + 1}
        {guessesAllowed !== null && ` of ${guessesAllowed}`}
      </span>
      <div className="guess__actions">
        {selected && (
          <Button size="sm" variant="ghost" onClick={onClear}>Clear</Button>
        )}
        {canSuggest && (
          <Button size="sm" variant="secondary" disabled={!selected} onClick={onSuggest} aria-pressed={suggestedByMe}>
            {suggestedByMe ? 'Withdraw' : 'Suggest'}
          </Button>
        )}
        <Button size="sm" disabled={!selected} onClick={onConfirm}>Confirm guess</Button>
        {canEnd && <Button size="sm" variant="danger" disabled={guessesMade === 0} onClick={onEndTurn} title={guessesMade === 0 ? 'Make at least one guess first' : undefined}>End turn</Button>}
      </div>
    </section>
  );
}
