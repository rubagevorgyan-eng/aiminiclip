import { useEffect, useRef, type ReactNode } from 'react';
import { IconButton } from './Button.tsx';
import { IconClose } from './Icons.tsx';

/** Native <dialog> modal: focus trapping, Escape and backdrop come from the browser. */
export function Modal({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // Start in the first field (not the close button), so Enter submits instead of closing.
      d.querySelector<HTMLElement>('[autofocus], input:not([disabled]):not([type="checkbox"]), textarea')?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={label}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {open && (
        <>
          <span className="modal__close">
            <IconButton label="Close" onClick={onClose}>
              <IconClose />
            </IconButton>
          </span>
          {children}
        </>
      )}
    </dialog>
  );
}
