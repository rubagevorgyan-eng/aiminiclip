import type { CSSProperties } from 'react';
import { rarityOf, type RarityId } from '../../config/game.ts';

/*
 * Six original 12x12 pixel minerals. k outline, o body, h lit, d shade, r/R host rock (copper ore).
 * Colors are derived from the rarity color, so the palette stays in config.
 */
const SHAPES: Record<RarityId, string[]> = {
  // Coal: matte lump with a crack
  common: ['............', '....kkkk....', '..kkoohok...', '.kooohhook..', '.koooooodk..', 'kooodoooodk.', 'koooooodddk.', 'kdooooooddk.', '.kddoooddk..', '..kkdddkk...', '....kkk.....', '............'],
  // Copper: grey ore chunk with copper veins
  uncommon: ['............', '...kkkkk....', '..krrrrrkk..', '.krrorrRRrk.', '.krrrooRrrk.', 'krrrRRorrrRk', 'krrrrrrooRk.', 'kRrrooRrrRk.', '.kRrrroorRk.', '..kkRRRRkk..', '....kkkk....', '............'],
  // Silver: cast ingot
  notable: ['............', '............', '............', '...kkkkkk...', '..khhhhhhk..', '.khoooooodk.', '.khoohooodk.', 'khoooooooddk', 'kddddddddddk', '.kkkkkkkkkk.', '............', '............'],
  // Gold: bumpy nugget
  rare: ['............', '...kkk.kkk..', '..khhokhhok.', '.khooooooodk', 'khoooooooddk', 'koooohoooddk', 'kooooooodddk', '.kdooooodddk', '..kddoodddk.', '...kkkkkkk..', '............', '............'],
  // Emerald: tall hexagonal crystal with a small side crystal
  legendary: ['.....kk.....', '....khok....', '...khhodk...', '...khhodk...', '...khhodkk..', '...khhodkok.', '...khhodkodk', '...khhodkodk', '...khhodkodk', '...khhodkdk.', '....kodkkk..', '.....kk.....'],
  // Diamond: brilliant cut
  mythic: ['............', '............', '...hhhoooo..', '..hhooooodd.', '.hhooooooodd', '.hoooooooood', '..hoooooodd.', '...hoooodd..', '....hoodd...', '.....hdd....', '......d.....', '............'],
};

export function MineralIcon({ rarity, size = 24, locked = false, title }: { rarity: RarityId; size?: number; locked?: boolean; title?: string }) {
  const t = rarityOf(rarity);
  const base = rarity === 'common' ? '#3b3f47' : t.color;
  const style = { '--m': base, '--mh': rarity === 'common' ? t.color : base } as CSSProperties;
  return (
    <svg
      className={`mineral-icon${locked ? ' is-locked' : ''}`}
      viewBox="0 0 12 12"
      width={size}
      height={size}
      style={style}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {SHAPES[rarity].flatMap((row, y) =>
        [...row].map((c, x) => (c === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" className={`mi-${c}`} />)),
      )}
    </svg>
  );
}
