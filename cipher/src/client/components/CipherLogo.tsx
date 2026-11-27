import { BRAND } from '../../shared/config.ts';
import { DecodeText } from '../fx/DecodeText.tsx';
import { PLANS } from '../fx/timing.ts';
import { sfx } from '../sound.ts';

/**
 * CIPHER logo: an original cipher-wheel seal mark beside a Cinzel wordmark.
 * `inline` is the compact header form; the default stacked form adds the "Recess" rule line.
 */
export function CipherLogo({ inline = false, className = '', decode = false }: { inline?: boolean; className?: string; decode?: boolean }) {
  return (
    <span className={`logo ${inline ? 'logo--inline' : ''} ${className}`.trim()} role="img" aria-label={BRAND.name}>
      <svg className="logo__mark" viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="24" cy="24" r="15" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2.2 2.6" />
        <circle cx="24" cy="24" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1="24" y1="3" x2="24" y2="7" stroke="currentColor" strokeWidth="1.2" transform={`rotate(${i * 30} 24 24)`} />
        ))}
        <path d="M24 15.5v17M15.5 24h17" stroke="currentColor" strokeWidth="1" />
        <circle cx="24" cy="24" r="2.2" fill="currentColor" />
      </svg>
      {decode ? (
        <DecodeText className="logo__word" text={BRAND.name} plan={PLANS.logo(BRAND.name.length)} onTick={() => sfx.type()} />
      ) : (
        <span className="logo__word" aria-hidden="true">{BRAND.name}</span>
      )}
      {!inline && <span className="logo__rule" aria-hidden="true">A {BRAND.parent} game</span>}
    </span>
  );
}
