'use client';

import { useCallback, useId, useRef, useState, type CSSProperties, type ReactElement, cloneElement } from 'react';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  content: string;
  placement?: TooltipPlacement;
  children: ReactElement;
  delayMs?: number;
}

function placementStyle(placement: TooltipPlacement): CSSProperties {
  switch (placement) {
    case 'top':    return { bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)' };
    case 'bottom': return { top: 'calc(100% + 6px)',    left: '50%', transform: 'translateX(-50%)' };
    case 'left':   return { right: 'calc(100% + 6px)',  top: '50%',  transform: 'translateY(-50%)' };
    case 'right':  return { left: 'calc(100% + 6px)',   top: '50%',  transform: 'translateY(-50%)' };
  }
}

export function Tooltip({ content, placement = 'top', children, delayMs = 200 }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setOpen(true), delayMs);
  }, [delayMs]);
  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOpen(false);
  }, []);

  const triggerProps = {
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
    'aria-describedby': open ? id : undefined,
  };

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      {/* eslint-disable-next-line react-hooks/refs -- triggerProps holds useCallback handlers that read timerRef only inside event handlers; the rule cannot statically infer this */}
      {cloneElement(children, triggerProps as Record<string, unknown>)}
      {open && (
        <span
          id={id}
          role="tooltip"
          style={{
            position: 'absolute',
            ...placementStyle(placement),
            background: 'var(--gray-900)',
            color: '#ffffff',
            fontSize: 'var(--text-xs)',
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 1200,
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
