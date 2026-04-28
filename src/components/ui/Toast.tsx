'use client';

import { createContext, useCallback, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type ToastVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  title?: string;
  message: string;
  durationMs: number;
}

interface ToastContextValue {
  show: (toast: Omit<ToastItem, 'id' | 'durationMs'> & { durationMs?: number }) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT: Record<ToastVariant, { bg: string; fg: string; border: string }> = {
  success: { bg: 'var(--success-50)', fg: 'var(--success-700)', border: 'var(--success-500)' },
  warning: { bg: 'var(--warning-50)', fg: 'var(--warning-700)', border: 'var(--warning-500)' },
  danger:  { bg: 'var(--danger-50)',  fg: 'var(--danger-700)',  border: 'var(--danger-500)' },
  info:    { bg: 'var(--primary-50)', fg: 'var(--primary-700)', border: 'var(--primary-500)' },
  neutral: { bg: 'var(--gray-100)',   fg: 'var(--gray-700)',    border: 'var(--gray-400)' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<ToastContextValue['show']>((t) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const item: ToastItem = { id, durationMs: t.durationMs ?? 4000, ...t };
    setToasts((prev) => [...prev, item]);
    if (item.durationMs > 0) {
      setTimeout(() => dismiss(id), item.durationMs);
    }
  }, [dismiss]);

  const value: ToastContextValue = {
    show,
    dismiss,
    success: (message, title) => show({ variant: 'success', message, title }),
    error:   (message, title) => show({ variant: 'danger',  message, title }),
    warning: (message, title) => show({ variant: 'warning', message, title }),
    info:    (message, title) => show({ variant: 'info',    message, title }),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted && createPortal(<ToastViewport toasts={toasts} onDismiss={dismiss} />, document.body)}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

function ToastViewport({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  return (
    <div
      role="region"
      aria-label="Notifications"
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 1100,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 380,
        width: 'calc(100vw - 32px)',
      }}
    >
      {toasts.map((t) => (
        <ToastBubble key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastBubble({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const v = VARIANT[toast.variant];
  const style: CSSProperties = {
    background: v.bg,
    color: v.fg,
    borderLeft: `4px solid ${v.border}`,
    borderRadius: 'var(--radius-md)',
    padding: '12px 14px',
    boxShadow: 'var(--shadow-md)',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    fontSize: 'var(--text-sm)',
    animation: 'commup-toast-in 0.2s ease-out',
  };

  return (
    <div role="status" aria-live="polite" style={style}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {toast.title && <div style={{ fontWeight: 600, marginBottom: 2 }}>{toast.title}</div>}
        <div style={{ wordBreak: 'break-word' }}>{toast.message}</div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'currentColor',
          opacity: 0.7,
          cursor: 'pointer',
          fontSize: 18,
          lineHeight: 1,
          padding: 0,
          flexShrink: 0,
        }}
      >×</button>
      <style>{'@keyframes commup-toast-in{from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1}}'}</style>
    </div>
  );
}
