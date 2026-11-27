import { useState, type CSSProperties } from 'react';
import { TEAM_LABEL } from '../../shared/config.ts';
import { ownerLabel } from '../game/derive.ts';
import { toneOf } from '../game/identity.ts';
import { declassifiedBoard, reportData } from '../game/report.ts';
import { HistoryList } from './HistoryPanel.tsx';
import { IdentityGlyph } from './IdentityGlyph.tsx';
import type { MatchResult, Player, PublicMatchState } from '../../shared/types.ts';
import { Button } from './Button.tsx';
import { Dossier } from './Dossier.tsx';
import { Stamp } from './Stamp.tsx';
import { DecodeText } from '../fx/DecodeText.tsx';
import { PLANS } from '../fx/timing.ts';
import { sfx } from '../sound.ts';

const REASON: Record<MatchResult['reason'], string> = {
  all_agents_found: 'All agents located.',
  mole_revealed: 'A mole was exposed.',
  turns_exhausted: 'Out of time: a civilian was hit in sudden death.',
  abandoned: 'The operation was abandoned.',
};

function headline(r: MatchResult) {
  if (r.outcome.kind === 'team_win') return `${TEAM_LABEL[r.outcome.team]} prevails`;
  return r.outcome.kind === 'cooperative_win' ? 'Joint operation succeeds' : 'Joint operation fails';
}

const mmss = (ms: number) => `${Math.floor(ms / 60000)}m ${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}s`;

/**
 * End-of-match debrief, built only from recorded public data: outcome, duration, agents recovered,
 * accuracy, clues, best transmission, the assassin (if any), the full declassified board, the clue
 * history, and the host's next steps (rematch, optionally rotating roles, or back to the lobby).
 */
export function MissionReport({ match, players, isHost, onRematch, onClose, onLobby, fresh = false, viewer = null }: { match: PublicMatchState; players: readonly Player[]; isHost: boolean; onRematch: (rotate: boolean) => void; onClose: () => void; onLobby?: () => void; fresh?: boolean; viewer?: Player | null }) {
  const [rotate, setRotate] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const r = match.result;
  const data = reportData(match);
  if (!r || !data) return null;
  // Decoded banner from the viewer's side: their win, their loss, or neutral for observers.
  const won = r.outcome.kind === 'team_win' ? (viewer?.team ? viewer.team === r.outcome.team : null) : r.outcome.kind === 'cooperative_win';
  const banner = won === null ? 'OPERATION CONCLUDED' : won ? 'MISSION ACCOMPLISHED' : r.reason === 'mole_revealed' ? 'ACCESS COMPROMISED' : 'MISSION FAILED';
  const success = r.outcome.kind !== 'cooperative_loss';
  const coop = !!r.stats.cooperative;
  const board = declassifiedBoard(match);
  const byPlayer = players
    .map((p) => {
      const g = match.history.flatMap((e) => (e.type === 'guess' && e.guess.by === p.id ? [e.guess] : []));
      return { p, total: g.length, good: g.filter((x) => (x.owner.kind === 'team' ? x.result.identity === x.owner.team : x.result.identity === 'agent')).length };
    })
    .filter((x) => x.total > 0);
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? 'Former operative';

  return (
    <Dossier tab={`FILE ${match.id.slice(-6).toUpperCase()}`} className="report">
      <div className="report__stamp">
        {/* From the viewer's side: their win / their loss; observers see the neutral result. */}
        <Stamp large double tone={(won ?? success) ? 'brass' : 'red'} tilt={-6}>
          {won === true ? 'Mission accomplished' : won === false ? 'Mission failed' : success ? 'Mission complete' : 'Mission failed'}
        </Stamp>
      </div>
      <p className="eyebrow report__eyebrow">Mission report</p>
      <DecodeText as="p" className={`report__banner ${won === false ? 'is-loss' : ''}`} text={banner} plan={PLANS.banner(banner.length, 400)} run={fresh} onTick={() => sfx.type()} />
      <h2 className="report__title">{headline(r)}</h2>
      <p className="report__reason">{REASON[r.reason]}{r.stats.cooperative?.suddenDeath ? ' The operation went to sudden death.' : ''}</p>

      <dl className="report__stats">
        <div><dt>Duration</dt><dd>{mmss(data.durationMs)}</dd></div>
        <div><dt>Clues</dt><dd>{data.clues}</dd></div>
        <div><dt>Accuracy</dt><dd>{data.accuracy === null ? '—' : `${Math.round(data.accuracy * 100)}%`}</dd><dd className="report__sub">{data.correctGuesses}/{data.guesses} guesses</dd></div>
        {coop ? (
          <div><dt>Tokens used</dt><dd>{r.stats.cooperative!.tokensUsed}/{r.stats.cooperative!.tokensTotal}</dd></div>
        ) : (
          <div><dt>Turns</dt><dd>{r.turns}</dd></div>
        )}
      </dl>

      <div className="report__agents">
        {data.agents.map((a) => (
          <p key={a.label} className={`report__agent tone-${a.label === 'shared' ? 'agent' : a.label}`}>
            <span className="dot" aria-hidden="true" /> {a.label === 'shared' ? 'Agents recovered' : TEAM_LABEL[a.label]}: <b>{a.found}/{a.total}</b>
          </p>
        ))}
      </div>

      {data.best && (
        <p className="report__line"><span className="report__k">Best transmission</span> <b>{data.best.word} · {data.best.count ?? '∞'}</b> ({ownerLabel(data.best.owner)}, turn {data.best.turn}): {data.best.correct} correct {data.best.correct === 1 ? 'guess' : 'guesses'}</p>
      )}
      {data.assassin && (
        <p className="report__line report__line--danger"><span className="report__k">Assassin</span> <b>{data.assassin.word}</b>, chosen by {name(data.assassin.by)}{data.assassin.loser !== 'cooperative' ? ` · ${TEAM_LABEL[data.assassin.loser]} loses` : ''}</p>
      )}

      {byPlayer.length > 0 && (
        <table className="report__table">
          <caption className="sr-only">Accuracy per player</caption>
          <thead><tr><th>Player</th><th>Hits</th><th>Guesses</th></tr></thead>
          <tbody>{byPlayer.map(({ p, total, good }) => <tr key={p.id}><td>{p.name}</td><td>{good}</td><td>{total}</td></tr>)}</tbody>
        </table>
      )}

      {board && (
        <div className="report__board" style={{ '--cols': match.dimensions.size } as CSSProperties} role="list" aria-label="Declassified board">
          {board.map((c, i) => (
            <span key={i} role="listitem" className={`rb tone-${toneOf(c.identity as never)} ${c.revealed ? 'is-revealed' : ''}`} title={`${c.word}: ${c.identity}${c.revealed ? ' (revealed)' : ''}`}>
              <IdentityGlyph tone={toneOf(c.identity as never)} />
              <span className="rb__word">{c.word}</span>
            </span>
          ))}
        </div>
      )}

      <button type="button" className="linkbtn report__toggle" aria-expanded={showHistory} onClick={() => setShowHistory(!showHistory)}>{showHistory ? 'Hide' : 'Show'} clue and guess history</button>
      {showHistory && <HistoryList match={match} players={players} />}

      <div className="modal__actions">
        <Button variant="secondary" onClick={onClose}>View board</Button>
        {onLobby && isHost && <Button variant="secondary" onClick={onLobby}>Return to lobby</Button>}
        {isHost && (
          <label className="check report__rotate">
            <input type="checkbox" checked={rotate} onChange={(e) => setRotate(e.target.checked)} />
            <span>{coop ? 'Swap partners' : 'Rotate handlers'}</span>
          </label>
        )}
        <Button onClick={() => onRematch(rotate)} disabled={!isHost} title={isHost ? undefined : 'Only the host can start a new operation'}>New operation</Button>
      </div>
    </Dossier>
  );
}
