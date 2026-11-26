import { useEffect, useRef, type ReactNode } from 'react';

/** Native <dialog> modal: focus trap, Esc and backdrop close. */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal panel" aria-label={title} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="modal-body">
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 7 7" width="14" height="14" shapeRendering="crispEdges" aria-hidden="true">
              <path fill="currentColor" d="M0 0h1v1h1v1h1v1h1V2h1V1h1V0h1v1H6v1H5v1H4v1h1v1h1v1h1v1H6V6H5V5H4V4H3v1H2v1H1v1H0V6h1V5h1V4h1V3H2V2H1V1H0z" />
            </svg>
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
