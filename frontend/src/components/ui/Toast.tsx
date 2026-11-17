'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import Glyph from '@/components/ui/Glyph';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  success: () => {},
  error: () => {},
  info: () => {},
});

const TYPE_STYLES: Record<ToastType, string> = {
  success: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200',
  error: 'border-red-500/40 bg-red-500/15 text-red-200',
  info: 'border-blue-500/40 bg-blue-500/15 text-blue-200',
};

const TYPE_ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '⚠',
  info: 'ℹ',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (type: ToastType, message: string) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev.slice(-4), { id, type, message }]);
      window.setTimeout(() => remove(id), type === 'error' ? 7000 : 4000);
    },
    [remove]
  );

  const api = useMemo<ToastContextValue>(
    () => ({
      success: (message: string) => show('success', message),
      error: (message: string) => show('error', message),
      info: (message: string) => show('info', message),
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        dir="rtl"
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-4 left-1/2 z-[100] flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.type === 'error' ? 'alert' : 'status'}
            className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${TYPE_STYLES[toast.type]}`}
          >
            <span aria-hidden="true" className="mt-0.5">
              <Glyph name={TYPE_ICONS[toast.type]} size={16} />
            </span>
            <p className="flex-1 leading-relaxed">{toast.message}</p>
            <button
              type="button"
              aria-label="إغلاق التنبيه"
              onClick={() => remove(toast.id)}
              className="opacity-60 hover:opacity-100"
            >
              <Glyph name="✕" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
