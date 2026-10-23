'use client';

import { useEffect, useRef, type CSSProperties, type HTMLAttributes, type ReactNode, type RefObject } from 'react';

/**
 * Accesibilidad de diálogo (G-12): la que tenía `Modal`, sacada para los overlays propios que no usan `Modal`
 * (mismo aspecto, sin rehacerlos). Esc cierra, Tab queda dentro, el foco entra al abrir y vuelve al salir, y el fondo
 * no se desplaza. Con diálogos anidados (un `useAskDialog` sobre un modal) solo responde el de arriba.
 */
const stack: symbol[] = [];
let bodyOverflow = '';
// Quién tenía el foco antes: si un campo con autoFocus ya lo tomó al montar (antes del efecto), el que abrió el
// diálogo es el último que lo perdió.
let lastBlurred: HTMLElement | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('focusout', (e) => { lastBlurred = e.target as HTMLElement | null; }, true);
}
// El foco vuelve un tick después de cerrar: si en ese tick se monta otro diálogo (o el mismo, por el doble montaje de
// StrictMode en desarrollo), hereda a quien abrió el primero en vez de quitarle el foco a su campo.
let pendingRestore: { timer: ReturnType<typeof setTimeout>; target: HTMLElement | null } | null = null;

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogA11y(
  ref: RefObject<HTMLElement | null>,
  { open = true, onClose, closeOnEsc = true }: { open?: boolean; onClose?: () => void; closeOnEsc?: boolean } = {},
) {
  // El último onClose sin volver a montar el efecto (los overlays suelen pasar una flecha nueva en cada render).
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });

  useEffect(() => {
    if (!open) return;
    const id = Symbol('dialog');
    if (stack.length === 0) bodyOverflow = document.body.style.overflow;
    stack.push(id);
    let previouslyFocused: HTMLElement | null;
    if (pendingRestore) {
      clearTimeout(pendingRestore.timer);
      previouslyFocused = pendingRestore.target;
      pendingRestore = null;
    } else {
      const active = document.activeElement as HTMLElement | null;
      previouslyFocused = active && ref.current?.contains(active) ? lastBlurred : active;
    }
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === 'Escape' && closeOnEsc && close.current) { e.stopPropagation(); close.current(); return; }
      if (e.key === 'Tab' && ref.current) {
        const focusables = ref.current.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (focusables.length === 0) { e.preventDefault(); return; }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const inside = ref.current.contains(document.activeElement);
        if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
      }
    };

    document.addEventListener('keydown', onKey);
    // Si el contenido ya puso el foco en un campo (autoFocus), se respeta.
    const timer = setTimeout(() => { if (!ref.current?.contains(document.activeElement)) ref.current?.focus(); }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      if (stack.length === 0) document.body.style.overflow = bodyOverflow;
      const restore = setTimeout(() => { pendingRestore = null; previouslyFocused?.focus?.(); }, 0);
      pendingRestore = { timer: restore, target: previouslyFocused };
    };
  }, [open, closeOnEsc, ref]);
}

export type DialogSurfaceProps = Omit<HTMLAttributes<HTMLDivElement>, 'role'> & {
  /** Esc llama a esto; sin él, Esc no cierra (p. ej. mientras se guarda). */
  onClose?: () => void;
  closeOnEsc?: boolean;
  /** id del título visible del diálogo; sin título visible, usar `aria-label`. */
  labelledBy?: string;
  style?: CSSProperties;
  children: ReactNode;
};

/** El panel de un overlay propio: reemplaza el `<div>` interior (el que lleva el contenido) sin cambiar su estilo. */
export function DialogSurface({ onClose, closeOnEsc, labelledBy, style, children, ...rest }: DialogSurfaceProps) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogA11y(ref, { onClose, closeOnEsc });
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}
      {...rest} style={{ outline: 'none', ...style }}>
      {children}
    </div>
  );
}
