import { LIMITS } from '../../shared/config.ts';

/** Display-name input (no account): stored on this device only. */
export function NameField({ value, onChange, id = 'display-name', autoFocus = false }: { value: string; onChange: (v: string) => void; id?: string; autoFocus?: boolean }) {
  return (
    <label className="formfield" htmlFor={id}>
      <span className="formfield__label">Code name</span>
      <input
        id={id}
        className="field"
        value={value}
        maxLength={LIMITS.nameLength}
        autoComplete="nickname"
        spellCheck={false}
        placeholder="How your team sees you"
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
