import { useState, type FormEvent } from 'react';
import { cleanClueWord, wordKey } from '../../shared/text.ts';
import { Button } from './Button.tsx';

const COUNTS: (number | null)[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, null];

/** Handler's clue input: one word plus a number (0 and ∞ allowed). Rejects words visible on the board. */
export function ClueComposer({ boardWords, disabled = false, specialClues = true, onSubmit }: { boardWords: readonly string[]; disabled?: boolean; specialClues?: boolean; onSubmit: (word: string, count: number | null) => void }) {
  const counts = specialClues ? COUNTS : COUNTS.filter((c) => c !== 0 && c !== null);
  const [word, setWord] = useState('');
  const [count, setCount] = useState<number | null>(1);
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = cleanClueWord(word);
    if (!clean) return setError('One word only: letters, numbers, hyphen or apostrophe.');
    if (boardWords.some((w) => wordKey(w) === wordKey(clean))) return setError('That word is on the board.');
    onSubmit(clean, count);
    setWord('');
    setError('');
  };

  return (
    <form className="composer panel" onSubmit={submit} aria-label="Send a clue">
      <span className="eyebrow">Compose transmission</span>
      <div className="composer__row">
        <label className="sr-only" htmlFor="clue-word">Clue word</label>
        <input id="clue-word" className="field composer__word" value={word} disabled={disabled} maxLength={24} autoComplete="off" spellCheck={false} placeholder="ONE WORD" onChange={(e) => (setWord(e.target.value), setError(''))} />
        <label className="sr-only" htmlFor="clue-count">Number</label>
        <select id="clue-count" className="select composer__count" disabled={disabled} value={count === null ? 'inf' : count} onChange={(e) => setCount(e.target.value === 'inf' ? null : Number(e.target.value))}>
          {counts.map((c) => (
            <option key={String(c)} value={c === null ? 'inf' : c}>{c === null ? '∞' : c}</option>
          ))}
        </select>
        <Button type="submit" disabled={disabled || !word.trim()}>Transmit</Button>
      </div>
      {error && <p className="feedback" role="alert">{error}</p>}
    </form>
  );
}
