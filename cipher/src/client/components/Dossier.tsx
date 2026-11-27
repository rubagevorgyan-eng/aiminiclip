import type { ReactNode } from 'react';
import { Stamp } from './Stamp.tsx';

/** Ivory "classified file" panel for menus, dialogs and reports. */
export function Dossier({ stamp, tab, title, className = '', children }: { stamp?: string; tab?: string; title?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`dossier ${className}`.trim()}>
      {tab && <span className="dossier__tab">{tab}</span>}
      {stamp && (
        <span className="dossier__stamp">
          <Stamp>{stamp}</Stamp>
        </span>
      )}
      {title && <h2 className="dossier__title">{title}</h2>}
      {children}
    </section>
  );
}
