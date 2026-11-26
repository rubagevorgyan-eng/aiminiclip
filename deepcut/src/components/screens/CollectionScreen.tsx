import type { CSSProperties } from 'react';
import { RARITY, ZONES } from '../../config/game.ts';
import type { Progress } from '../../storage/progress.ts';
import { Button } from '../ui/Button.tsx';
import { MineralIcon } from '../ui/MineralIcon.tsx';

export function CollectionScreen({ progress, onBack }: { progress: Progress; onBack: () => void }) {
  const found = RARITY.filter((t) => progress.tiers[t.id] > 0).length;
  return (
    <section className="screen page">
      <header className="page-head">
        <Button variant="ghost" onClick={onBack}>← Back</Button>
        <h1>Collection</h1>
        <span className="eyebrow page-count">{found}/{RARITY.length} minerals</span>
      </header>
      <div className="collection">
        {RARITY.map((t, i) => {
          const n = progress.tiers[t.id];
          return (
            <div key={t.id} className={`panel mineral${n ? '' : ' is-locked'}`} style={{ '--r': t.color } as CSSProperties}>
              <MineralIcon rarity={t.id} size={72} locked={!n} title={n ? t.mineral : 'Undiscovered mineral'} />
              <h2>{n ? t.mineral : 'Undiscovered'}</h2>
              {n ? (
                <>
                  <span className="eyebrow">{t.label} · +{t.points}m</span>
                  <span className="num mineral-count">Found ×{n}</span>
                </>
              ) : (
                <span className="dim mineral-hint">Somewhere around {ZONES[i].name}</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
