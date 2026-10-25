import type { CSSProperties, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Circle, CircleHelp, CircleDot, CircleX, Minus, PenLine, RotateCcw, Square, TriangleAlert, Undo2, type LucideIcon } from 'lucide-react';
import { TONE_STYLE, type DisplayState, type StateIcon } from '@/lib/states/tones';

const ICONS: Record<StateIcon, LucideIcon> = {
  none: Circle,
  nodata: CircleHelp,
  work: CircleDot,
  wait: PenLine,
  ok: Check,
  cond: TriangleAlert,
  bad: CircleX,
  returned: Undo2,
  regressed: RotateCcw,
  cancelled: Minus,
  category: Square,
};

const SIZE = {
  sm: { padding: '2px 8px', fontSize: 'var(--text-xs)', icon: 12, gap: 4 },
  md: { padding: '4px 10px', fontSize: 'var(--text-sm)', icon: 14, gap: 6 },
} as const;

export interface StateChipProps {
  /** Lo que devuelve `itrState`, `punchState`, `gateState`… de `@/lib/states`. */
  state: DisplayState;
  size?: keyof typeof SIZE;
  /** Texto que sigue a la etiqueta dentro del chip (p. ej. «falta Supervisor»). */
  children?: ReactNode;
  title?: string;
  style?: CSSProperties;
}

/** A08: un estado con su tono, su ícono y su etiqueta (`States.<familia>.<clave>`); nunca solo color. */
export function StateChip({ state, size = 'sm', children, title, style }: StateChipProps) {
  const t = useTranslations('States');
  const tone = TONE_STYLE[state.tone];
  const s = SIZE[size];
  const Icon = ICONS[state.icon];
  const accent = state.accent ? TONE_STYLE[state.accent] : null;
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: s.gap,
        padding: s.padding,
        fontSize: s.fontSize,
        fontWeight: 600,
        lineHeight: 1.3,
        whiteSpace: 'nowrap',
        borderRadius: 'var(--radius-pill)',
        background: tone.bg,
        color: tone.fg,
        border: accent ? `2px solid ${accent.border}` : `1px ${tone.borderStyle} ${tone.border}`,
        ...style,
      }}
    >
      <Icon size={s.icon} strokeWidth={2.25} aria-hidden="true" style={{ flexShrink: 0 }} />
      {t(`${state.family}.${state.key}`, state.params)}
      {children}
    </span>
  );
}
