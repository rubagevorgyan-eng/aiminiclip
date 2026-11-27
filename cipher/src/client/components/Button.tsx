import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; block?: boolean }) {
  const cls = ['btn', `btn--${variant}`, size === 'sm' && 'btn--sm', block && 'btn--block', className].filter(Boolean).join(' ');
  return <button type="button" className={cls} {...rest} />;
}

/** Square icon button; pass `pressed` for toggles and `badge` for counts (e.g. unread chat). */
export function IconButton({ label, pressed, badge, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; pressed?: boolean; badge?: number }) {
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} aria-pressed={pressed} {...rest}>
      {children}
      {badge ? <span className="badge">{badge > 99 ? '99+' : badge}</span> : null}
    </button>
  );
}
