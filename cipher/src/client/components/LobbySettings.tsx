import { useState, type ReactNode } from 'react';
import { packSize, settingsProblems } from '../../engine/lobbyRules.ts';
import { MODES, MODE_ORDER } from '../../engine/modes/index.ts';
import { effectiveSettings, layoutFor, manualLayoutProblems } from '../../engine/settings.ts';
import type { ClientMessage } from '../../net/protocol.ts';
import { BOARD_SIZES, CUSTOM_WORDS, DIFFICULTIES, DUET, DUET_TOKEN_CHOICES, TEAMS, TEAM_LABEL, TIMER_CHOICES, WORD_PACKS, moleRange } from '../../shared/config.ts';
import type { ManualLayout, RoomSettings, WordPackId } from '../../shared/types.ts';
import { sanitizeCustomWords, splitWordList, type CustomWordReport } from '../../vocab/custom.ts';
import { Segmented } from './Segmented.tsx';

const timerLabel = (s: number | null) => (s === null ? 'Off' : `${s}s`);
type Patch = Omit<Extract<ClientMessage, { t: 'settings' }>, 't'>;

/**
 * Mission parameters. The host edits; everyone else sees the same values read-only. Classic and Duet
 * show their fixed standard rules; Custom exposes every option with a live board preview. Values are
 * validated here for feedback and again by the server, which is authoritative.
 */
export function LobbySettings({ settings, editable, onChange }: { settings: RoomSettings; editable: boolean; onChange: (patch: Patch) => void }) {
  const e = effectiveSettings(settings);
  const custom = settings.mode === 'custom';
  const coop = e.kind === 'cooperative';
  const dis = !editable;
  const problems = settingsProblems(settings);

  return (
    <section className="params panel" aria-label="Mission settings">
      <header className="params__head">
        <h3 className="seats__title">Mission parameters</h3>
        {!editable && <span className="meta">Set by the host</span>}
      </header>

      <Row label="Game">
        <Segmented label="Game" value={settings.mode} onChange={(m) => onChange({ mode: m })} options={MODE_ORDER.map((id) => ({ value: id, label: MODES[id].label }))} disabled={dis} />
      </Row>
      {custom && (
        <Row label="Game type" hint={coop ? 'Duet engine, 5×5 keys' : 'Classic engine'}>
          <Segmented label="Game type" value={settings.customKind} onChange={(k) => onChange({ customKind: k })} options={[{ value: 'competitive', label: 'Competitive' }, { value: 'cooperative', label: 'Cooperative' }]} disabled={dis} />
        </Row>
      )}

      <Composition settings={settings} />

      {custom && !coop && (
        <>
          <Row label="Board size">
            <Segmented label="Board size" value={settings.boardSize} onChange={(s) => onChange({ boardSize: s })} options={BOARD_SIZES.map((s) => ({ value: s, label: `${s}×${s}` }))} disabled={dis} />
          </Row>
          {settings.manualLayout ? (
            <ManualEditor value={settings.manualLayout} size={settings.boardSize} disabled={dis} onChange={(m) => onChange({ manualLayout: m })} onAuto={() => onChange({ manualLayout: null })} />
          ) : (
            <Row label="Assassins" hint="Agents balance automatically">
              <Stepper value={settings.moles ?? moleRange().standard} min={moleRange().min} max={moleRange().max} disabled={dis} label="assassins" onChange={(n) => onChange({ moles: n })} />
              {editable && (
                <button type="button" className="linkbtn" onClick={() => onChange({ manualLayout: { ...pick(layoutFor(settings)) } })}>Adjust manually</button>
              )}
            </Row>
          )}
        </>
      )}

      {custom && coop && (
        <Row label="Turn tokens" hint="Each finished turn uses one">
          <Segmented label="Turn tokens" value={settings.duetTokens} onChange={(n) => onChange({ duetTokens: n })} options={DUET_TOKEN_CHOICES.map((n) => ({ value: n, label: String(n) }))} disabled={dis} />
        </Row>
      )}

      {custom ? (
        <>
          <Row label="Word packs" hint="At least one">
            <div className="packs">
              {[...WORD_PACKS.map((p) => ({ id: p.id as WordPackId, label: p.label, blurb: p.blurb, count: packSize(p.id) ?? 0 })), { id: 'custom' as WordPackId, label: 'Custom list', blurb: 'Your imported words', count: settings.customWords.length }].map((p) => {
                const on = settings.wordPacks.includes(p.id);
                return (
                  <label key={p.id} className={`pack ${on ? 'is-on' : ''}`} title={p.blurb}>
                    <input type="checkbox" checked={on} disabled={dis} onChange={() => onChange({ wordPacks: on ? settings.wordPacks.filter((x) => x !== p.id) : [...settings.wordPacks, p.id] })} />
                    <span>{p.label}</span>
                    <span className="pack__count">{p.count}</span>
                  </label>
                );
              })}
            </div>
          </Row>
          <CustomWords words={settings.customWords} editable={editable} onSave={(words) => onChange({ customWords: words, ...(settings.wordPacks.includes('custom') || !words.length ? {} : { wordPacks: [...settings.wordPacks, 'custom'] }) })} />
          <Row label="Difficulty" hint={DIFFICULTIES.find((d) => d.id === settings.difficulty)?.blurb}>
            <Segmented label="Difficulty" value={settings.difficulty} onChange={(d) => onChange({ difficulty: d })} options={DIFFICULTIES.map((d) => ({ value: d.id, label: d.label }))} disabled={dis} />
          </Row>
        </>
      ) : (
        <Row label="Words" hint="Standard packs, Balanced difficulty">
          <span className="chip">General-interest packs</span>
        </Row>
      )}

      <Row label="Countdown timer" hint="Enforced by the server">
        <select
          className="select"
          aria-label="Countdown timer"
          value={String(settings.timer.guessSeconds)}
          disabled={dis}
          onChange={(ev) => {
            const v = ev.target.value === 'null' ? null : Number(ev.target.value);
            onChange({ timer: { clueSeconds: v, guessSeconds: v } });
          }}
        >
          {TIMER_CHOICES.map((t) => <option key={String(t)} value={String(t)}>{timerLabel(t)}</option>)}
        </select>
      </Row>

      {!coop && (
        <Row label="First turn">
          <Segmented label="First turn" value={settings.startingTeam} onChange={(t) => onChange({ startingTeam: t })} options={[{ value: 'random', label: 'Random' }, ...TEAMS.map((t) => ({ value: t, label: TEAM_LABEL[t].split(' ')[0] }))]} disabled={dis} />
        </Row>
      )}

      {custom && (
        <div className="toggles">
          <Toggle label="Teammate suggestions" checked={settings.suggestions} disabled={dis} onChange={(v) => onChange({ suggestions: v })} />
          {!coop && <Toggle label="Bonus guess (number + 1)" checked={settings.bonusGuess} disabled={dis} onChange={(v) => onChange({ bonusGuess: v })} />}
          {!coop && <Toggle label="Special clues (0 and ∞)" checked={settings.specialClues} disabled={dis} onChange={(v) => onChange({ specialClues: v })} />}
        </div>
      )}
      <div className="toggles">
        <Toggle label="Spectators" checked={settings.spectatorsAllowed} disabled={dis} onChange={(v) => onChange({ spectatorsAllowed: v })} />
      </div>

      {problems.length > 0 && <p className="params__note feedback" role="status">{problems.length} setting{problems.length > 1 ? 's need' : ' needs'} attention: see the start panel.</p>}
      {!custom && <p className="meta">{e.kind === 'cooperative' ? `Standard Duet: 9 turn tokens, suggestions on.` : 'Standard rules: bonus guess, special clues and suggestions on.'}</p>}
    </section>
  );
}

const pick = (l: { starting: number; second: number; civilians: number; moles: number }): ManualLayout => ({ starting: l.starting, second: l.second, civilians: l.civilians, moles: l.moles });

/** Live board composition and total card count. */
function Composition({ settings }: { settings: RoomSettings }) {
  const e = effectiveSettings(settings);
  const cards = e.size * e.size;
  if (e.kind === 'cooperative') {
    return (
      <div className="compo" aria-label="Board composition">
        <div className="compo__bar" aria-hidden="true">
          <i className="seg tone-agent" style={{ flex: DUET.agentsPerSide }} />
          <i className="seg tone-neutral" style={{ flex: DUET.civiliansPerSide }} />
          <i className="seg tone-assassin" style={{ flex: DUET.molesPerSide }} />
        </div>
        <p className="compo__text mono">{cards} cards · each key: {DUET.agentsPerSide} agents, {DUET.civiliansPerSide} civilians, {DUET.molesPerSide} assassins · {DUET.sharedAgents} shared · 15 to find · {e.rules.tokens} tokens</p>
      </div>
    );
  }
  const l = e.layout!;
  const total = l.starting + l.second + l.civilians + l.moles;
  const ok = total === cards && l.starting > 0 && l.second > 0;
  return (
    <div className="compo" aria-label="Board composition">
      <div className="compo__bar" aria-hidden="true">
        <i className="seg tone-crimson" style={{ flex: Math.max(0, l.starting) }} />
        <i className="seg tone-cobalt" style={{ flex: Math.max(0, l.second) }} />
        <i className="seg tone-neutral" style={{ flex: Math.max(0, l.civilians) }} />
        <i className="seg tone-assassin" style={{ flex: Math.max(0, l.moles) }} />
      </div>
      <p className={`compo__text mono ${ok ? '' : 'is-bad'}`}>
        {e.size}×{e.size} = {cards} cards · first team {l.starting} · second {l.second} · civilians {l.civilians} · assassins {l.moles}
        {!ok && ` · totals ${total}`}
      </p>
    </div>
  );
}

function ManualEditor({ value, size, disabled, onChange, onAuto }: { value: ManualLayout; size: number; disabled: boolean; onChange: (m: ManualLayout) => void; onAuto: () => void }) {
  const problems = manualLayoutProblems(value, size as 5);
  const field = (key: keyof ManualLayout, label: string) => (
    <label className="mfield">
      <span>{label}</span>
      <input
        type="number"
        className="field"
        min={0}
        max={100}
        value={value[key]}
        disabled={disabled}
        onChange={(ev) => onChange({ ...value, [key]: ev.target.value === '' ? 0 : Math.trunc(Number(ev.target.value)) })}
      />
    </label>
  );
  return (
    <Row label="Manual distribution" hint="Advanced">
      <div className="manual">
        {field('starting', 'First team')}
        {field('second', 'Second team')}
        {field('civilians', 'Civilians')}
        {field('moles', 'Assassins')}
      </div>
      {!disabled && <button type="button" className="linkbtn" onClick={onAuto}>Back to balanced</button>}
      {problems.length > 0 && <span className="feedback">{problems[0]}</span>}
    </Row>
  );
}

/** Paste or upload a word list; shows exactly what will be kept before saving. */
function CustomWords({ words, editable, onSave }: { words: readonly string[]; editable: boolean; onSave: (words: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const preview = text ? sanitizeCustomWords(splitWordList(text)) : null;
  const readFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 64 * 1024) return setText('');
    setText(await f.text());
  };
  return (
    <div className="param">
      <div className="param__label">
        <span>Custom list</span>
        <span className="param__hint">{words.length ? `${words.length} words saved` : 'No words imported'}</span>
      </div>
      {editable && !open && (
        <div className="param__control">
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setOpen(true)}>{words.length ? 'Replace list' : 'Import words'}</button>
          {words.length > 0 && <button type="button" className="linkbtn linkbtn--danger" onClick={() => onSave([])}>Clear</button>}
        </div>
      )}
      {editable && open && (
        <div className="importer">
          <textarea className="field importer__text" rows={5} value={text} placeholder="One word per line, or separated by commas" onChange={(ev) => setText(ev.target.value)} aria-label="Custom words" />
          <div className="param__control">
            <label className="btn btn--ghost btn--sm importer__file">
              Upload .txt / .csv
              <input type="file" accept=".txt,.csv,text/plain,text/csv" onChange={(ev) => void readFile(ev.target.files?.[0])} />
            </label>
            <span className="meta">Up to {CUSTOM_WORDS.maxWords} words, {CUSTOM_WORDS.minLength}–{CUSTOM_WORDS.maxLength} letters, no spaces.</span>
          </div>
          {preview && <ImportReport r={preview.report} />}
          <div className="param__control">
            <button type="button" className="btn btn--sm" disabled={!preview || preview.words.length === 0} onClick={() => (onSave(preview!.words), setOpen(false), setText(''))}>Save {preview?.words.length ?? 0} words</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => (setOpen(false), setText(''))}>Cancel</button>
          </div>
        </div>
      )}
      {!open && words.length > 0 && <p className="meta importer__sample">{words.slice(0, 12).join(' · ')}{words.length > 12 ? ' …' : ''}</p>}
    </div>
  );
}

function ImportReport({ r }: { r: CustomWordReport }) {
  const dropped = [r.invalid && `${r.invalid} invalid`, r.duplicates && `${r.duplicates} duplicates`, r.blocked && `${r.blocked} removed by the safety filter`, r.overLimit && `${r.overLimit} over the limit`].filter(Boolean);
  return <p className="meta" role="status">{r.kept} of {r.received} will be kept{dropped.length ? ` · ${dropped.join(' · ')}` : ''}.</p>;
}

function Stepper({ value, min, max, disabled, label, onChange }: { value: number; min: number; max: number; disabled: boolean; label: string; onChange: (n: number) => void }) {
  return (
    <div className="stepper">
      <button type="button" className="icon-btn" disabled={disabled || value <= min} onClick={() => onChange(value - 1)} aria-label={`Fewer ${label}`}>−</button>
      <span className="stepper__value mono" aria-live="polite">{value}</span>
      <button type="button" className="icon-btn" disabled={disabled || value >= max} onClick={() => onChange(value + 1)} aria-label={`More ${label}`}>+</button>
    </div>
  );
}

function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(ev) => onChange(ev.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="param">
      <div className="param__label">
        <span>{label}</span>
        {hint && <span className="param__hint">{hint}</span>}
      </div>
      <div className="param__control">{children}</div>
    </div>
  );
}
