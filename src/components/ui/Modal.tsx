'use client';

import { useId, useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { useDialogA11y } from './dialog-a11y';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  size?: ModalSize;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  hideCloseButton?: boolean;
  footer?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}

const SIZE: Record<ModalSize, number> = { sm: 400, md: 560, lg: 720, xl: 960 };

export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  closeOnBackdrop = true,
  closeOnEsc = true,
  hideCloseButton = false,
  footer,
  children,
  style,
}: ModalProps) {
  const t = useTranslations('A11y');
  const dialogRef = useRef<HTMLDivElement>(null);
  // G-12: Esc, foco atrapado y pila de diálogos anidados en `useDialogA11y`; ids únicos (un AskDialog sobre otro Modal).
  useDialogA11y(dialogRef, { open, onClose, closeOnEsc });
  const titleId = useId();
  const descId = useId();

  if (!open || typeof window === 'undefined') return null;

  const modal = (
    <div
      role="presentation"
      // Solo el clic en el fondo mismo cierra (sin stopPropagation en el panel, que es un diálogo).
      onClick={closeOnBackdrop ? (e) => { if (e.target === e.currentTarget) onClose(); } : undefined}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        animation: 'commup-fade-in 0.15s ease-out',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        style={{
          background: 'var(--card-bg)',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth: SIZE[size],
          maxHeight: 'calc(100vh - 32px)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
          outline: 'none',
          ...style,
        }}
      >
        {(title ?? !hideCloseButton) && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            padding: '20px 24px 12px',
            borderBottom: '1px solid var(--border)',
          }}>
            <div style={{ minWidth: 0 }}>
              {title && (
                <h2 id={titleId} style={{
                  fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-strong)', lineHeight: 1.3,
                }}>{title}</h2>
              )}
              {description && (
                <p id={descId} style={{
                  fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5,
                }}>{description}</p>
              )}
            </div>
            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label={t('close')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 20,
                  lineHeight: 1,
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 4,
                  borderRadius: 'var(--radius-sm)',
                  flexShrink: 0,
                }}
              >×</button>
            )}
          </div>
        )}
        <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
          {children}
        </div>
        {footer && (
          <div style={{
            padding: '12px 24px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}>
            {footer}
          </div>
        )}
      </div>
      <style>{'@keyframes commup-fade-in{from{opacity:0}to{opacity:1}}'}</style>
    </div>
  );

  return createPortal(modal, document.body);
}
