import type { CSSProperties } from 'react';
import { RARITY } from '../../config/game.ts';
import { utcDateKey } from '../../data/selection.ts';
import { currentStreak, type Progress } from '../../storage/progress.ts';
import { Button } from '../ui/Button.tsx';
import { MineralIcon } from '../ui/MineralIcon.tsx';

export function StatsScreen({ progress: p, onBack }: { progress: Progress; onBack: () => void }) {
  const avg = p.games ? Math.round(p.totalDepth / p.games) : 0;
  const pct = p.rounds ? Math.round((p.correct / p.rounds) * 100) : 0;
  const finds = RARITY.reduce((n, t) => n + p.tiers[t.id], 0);
  const max = Math.max(1, ...RARITY.map((t) => p.tiers[t.id]));
  const tiles = [
    ['Games played', p.games],
    ['Personal best', `${p.bestDepth}m`],
    ['Average depth', `${avg}m`],
    ['Total correct', p.correct, `of ${p.rounds} rounds · ${pct}%`],
    ['Current daily streak', currentStreak(p, utcDateKey(Date.now()))],
    ['Longest streak', p.daily.longest],
  ] as const;
  return (
    <section className="screen page">
      <header className="page-head">
        <Button variant="ghost" onClick={onBack}>← Back</Button>
        <h1>Statistics</h1>
      </header>
      <div className="stat-grid">
        {tiles.map(([label, value, sub]) => (
          <div key={label} className="panel stat">
            <span className="eyebrow">{label}</span>
            <span className="num stat-value">{value}</span>
            {sub && <span className="dim">{sub}</span>}
          </div>
        ))}
      </div>
      <div className="panel tier-bars">
        <span className="eyebrow">Discoveries by rarity · {finds} total</span>
        {RARITY.map((t) => (
          <div key={t.id} className="tier-bar" style={{ '--r': t.color } as CSSProperties}>
            <MineralIcon rarity={t.id} size={18} />
            <span className="tier-name">{t.mineral} <small className="dim">{t.label}</small></span>
            <span className="tier-track"><i style={{ width: `${(p.tiers[t.id] / max) * 100}%` }} /></span>
            <span className="num">{p.tiers[t.id]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
