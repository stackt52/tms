'use client';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

interface ToastItem {
  id: number;
  message: string;
  tone: 'default' | 'success' | 'error';
}
interface ToastApi {
  toast: (message: string, tone?: ToastItem['tone']) => void;
  success: (message: string) => void;
  error: (err: unknown, fallback?: string) => void;
}
const ToastCtx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const toast = useCallback((message: string, tone: ToastItem['tone'] = 'default') => {
    const id = ++seq.current;
    setItems((xs) => [...xs, { id, message, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4200);
  }, []);
  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (m) => toast(m, 'success'),
      error: (e, fallback = 'Something went wrong') => toast(e instanceof Error ? e.message : fallback, 'error'),
    }),
    [toast],
  );
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="m3-toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`m3-toast m3-toast--${t.tone}`}>
            {t.tone === 'success' ? <Icon name="check_circle" filled size={18} /> : t.tone === 'error' ? <Icon name="error" filled size={18} /> : null}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}
