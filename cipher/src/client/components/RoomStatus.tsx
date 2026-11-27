import type { ReactNode } from 'react';
import { Dossier } from './Dossier.tsx';

/** Full-screen state card for the room flow (loading, errors, name gate). */
export function RoomStatus({ tab, stamp, title, busy = false, children }: { tab: string; stamp?: string; title: string; busy?: boolean; children?: ReactNode }) {
  return (
    <div className="roomstate">
      <Dossier tab={tab} stamp={stamp} title={title}>
        {busy && (
          <p className="roomstate__busy" role="status">
            <span className="roomstate__bar" aria-hidden="true" />
            Establishing secure line
          </p>
        )}
        {children}
      </Dossier>
    </div>
  );
}
