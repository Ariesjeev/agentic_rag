import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { cx } from './ui';

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, tone = 'info', ttl = 4000) => {
    const id = Math.random().toString(36).slice(2);
    setItems((s) => [...s, { id, message, tone }]);
    if (ttl) setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), ttl);
  }, []);
  const remove = (id) => setItems((s) => s.filter((t) => t.id !== id));

  const toast = {
    info:    (m) => push(m, 'info', 5500),
    success: (m) => push(m, 'success', 5500),
    error:   (m) => push(m, 'error', 8000),
  };

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed left-3 right-3 top-[calc(env(safe-area-inset-top)+4.5rem)] z-[9999] mx-auto flex max-h-[calc(100dvh-6rem)] w-auto max-w-md flex-col gap-2 overflow-y-auto sm:left-auto sm:right-5 sm:top-20 sm:mx-0 sm:w-[min(26rem,calc(100vw-2.5rem))]">
          {items.map((t) => <ToastItem key={t.id} {...t} onClose={() => remove(t.id)} />)}
        </div>,
        document.body
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
};

function ToastItem({ message, tone, onClose }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? AlertTriangle : Info;
  const color = tone === 'success' ? 'text-success' : tone === 'error' ? 'text-danger' : 'text-accent';
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-border bg-surface p-3.5 text-ink shadow-soft animate-fade-up"
    >
      <Icon size={18} strokeWidth={1.9} className={cx('mt-0.5 shrink-0', color)} />
      <p className="flex-1 text-sm text-ink">{message}</p>
      <button
        onClick={onClose}
        aria-label="Dismiss notification"
        className="rounded-full p-1 text-muted hover:bg-surface-2 hover:text-ink"
      >
        <X size={14} />
      </button>
    </div>
  );
}