import { BRAND } from '../../config/game.ts';
import { Gem } from './Gem.tsx';

export function Wordmark({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  return (
    <div className={`wordmark wordmark--${size}`} role="img" aria-label={BRAND.name}>
      <span aria-hidden="true">DEEP</span>
      <span className="wordmark-cut" aria-hidden="true">
        CUT
        <span className="wordmark-gem"><Gem color="var(--diamond)" size={size === 'lg' ? 30 : 14} /></span>
      </span>
    </div>
  );
}
