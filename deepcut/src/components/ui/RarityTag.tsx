import type { CSSProperties } from 'react';
import { rarityOf, type RarityId } from '../../config/game.ts';
import { MineralIcon } from './MineralIcon.tsx';

/** Mineral gem + name, optionally with points. Colors come from the rarity config. */
export function RarityTag({ rarity, points }: { rarity: RarityId; points?: boolean }) {
  const t = rarityOf(rarity);
  return (
    <span className="tag" style={{ '--r': t.color } as CSSProperties}>
      <MineralIcon rarity={rarity} size={16} />
      {t.mineral}
      {points && <span className="tag-pts">+{t.points}m</span>}
    </span>
  );
}
