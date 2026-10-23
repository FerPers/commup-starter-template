import type { CSSProperties } from 'react'
import type { ReqState } from './requirements'

/** Estilo por estado: falta (punteado) · generado · en curso · aprobado · excluido (tachado) · fuera de requisitos. */
export const REQ_CHIP_STYLE: Record<ReqState, CSSProperties> = {
  missing: { border: '1.5px dashed var(--gray-500)', color: 'var(--text-strong)', background: 'transparent' },
  generated: { background: 'var(--primary-50)', color: 'var(--primary-800)', border: '1px solid var(--primary-200)' },
  in_progress: { background: 'var(--primary-600)', color: '#ffffff', border: '1px solid var(--primary-600)' },
  approved: { background: 'var(--solid-success-700)', color: '#ffffff', border: '1px solid var(--solid-success-700)' },
  excluded: { background: 'var(--gray-100)', color: 'var(--text-muted)', textDecoration: 'line-through', border: '1px solid var(--border)' },
  outside: { background: 'var(--warning-50)', color: 'var(--warning-900)', border: '1px solid var(--warning-200)' },
}
