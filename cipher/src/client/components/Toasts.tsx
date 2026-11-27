import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { IconButton } from './Button.tsx';
import { IconClose } from './Icons.tsx';

export type ToastTone = 'neutral' | 'info' | 'success' | 'danger';
export interface Toast { id: number; title: string; body?: string; tone: ToastTone }
type Notify = (title: string, body?: string, tone?: ToastTone) => void;

const Ctx = createContext<Notify>(() => {});
export const useNotify = () => useContext(Ctx);

const TTL = 4500;

/** Notification stack (bottom right). Announced politely to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const notify = useCallback<Notify>((title, body, tone = 'neutral') => {
    const id = next.current++;
    setToasts((t) => [...t.slice(-3), { id, title, body, tone }]);
    setTimeout(() => dismiss(id), TTL);
  }, [dismiss]);
  const value = useMemo(() => notify, [notify]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone}`} role="status">
            <span className="toast__bar" />
            <div>
              <p className="toast__title">{t.title}</p>
              {t.body && <p className="toast__body">{t.body}</p>}
            </div>
            <IconButton label="Dismiss" onClick={() => dismiss(t.id)}>
              <IconClose />
            </IconButton>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
