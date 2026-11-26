import type { ButtonHTMLAttributes } from 'react';
import { playClick } from '../../audio/sfx.ts';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost'; wide?: boolean; silent?: boolean };

export function Button({ variant = 'secondary', wide, silent, className = '', type = 'button', onClick, ...rest }: Props) {
  return (
    <button
      type={type}
      className={`btn btn--${variant}${wide ? ' btn--wide' : ''} ${className}`}
      onClick={(e) => {
        if (!silent) playClick();
        onClick?.(e);
      }}
      {...rest}
    />
  );
}
