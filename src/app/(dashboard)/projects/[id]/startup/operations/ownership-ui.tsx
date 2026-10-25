'use client'

import { useTranslations } from 'next-intl'
import type { OwnershipStage } from '@/lib/startup/catalog'
import { small } from '../../daily/daily-ui'
import { StateChip } from '@/components/ui'
import { transferStageState } from '@/lib/states'

// Piezas compartidas de la readiness de operaciones: chip de etapa y checklist del traspaso.

export const LEVEL_COLOR: Record<number, { bg: string; fg: string }> = {
  0: { bg: 'var(--gray-50)', fg: 'var(--text-muted)' },
  1: { bg: 'var(--primary-50)', fg: 'var(--primary-700)' },
  2: { bg: 'var(--sky-100)', fg: 'var(--sky-700)' },
  3: { bg: 'var(--success-50)', fg: 'var(--success-700)' },
  4: { bg: 'var(--success-50)', fg: 'var(--success-700)' },
}

/** A08: etapa del traspaso con su tono (Entregado a Operaciones = relleno sólido, como Liberado). */
export function StageChip({ stage }: { stage: OwnershipStage }) {
  return <StateChip state={transferStageState(stage)} />
}

export type CheckItem = { key: string; ok: boolean; detail: Record<string, unknown> }
type Staff = { level: number; required: number; by_shift: { shift: string; count: number }[] }

/** Una línea legible con el detalle de cada criterio (mismo JSON que devuelve `ownership_checklist`). */
export function useCheckDetail() {
  const t = useTranslations('Startup')
  return (it: CheckItem): string => {
    const d = it.detail ?? {}
    if (it.key.startsWith('staff_level_')) {
      const s = d as Staff
      if (!s.by_shift?.length) return t('ops.detail.noStaff')
      return s.by_shift.map(b => `${t('ops.shift')} ${b.shift}: ${b.count}/${s.required}`).join(' · ')
    }
    switch (it.key) {
      case 'startup_procedure': {
        const ps = (d.procedures ?? []) as { number: string; rev: number; field_verified: boolean }[]
        return ps.length ? ps.map(p => `${p.number} rev ${p.rev}${p.field_verified ? ' ✓' : ` (${t('notFieldVerified')})`}`).join(' · ') : t('ops.detail.noProcedure')
      }
      case 'startup_gate': return d.gate ? `${String(d.gate)} · ${String(d.status)}` : t('ops.detail.noGate')
      case 'lineup_verified': return d.number ? `${String(d.number)}${d.stale ? ` · ${t('ops.detail.stale')}` : ''}` : t('ops.detail.noLineup')
      case 'first_startup_witnessed': return d.number ? String(d.number) : t('ops.detail.noFirstStartup')
      case 'critical_spares': {
        const m = (d.missing ?? []) as { item: string; available: number; required: number }[]
        return m.length ? m.map(x => `${x.item} (${x.available}/${x.required})`).join(' · ') : t('ops.detail.sparesOk')
      }
      case 'no_open_cat_a': return t('ops.detail.catA', { n: Number(d.open ?? 0) })
      default: return ''
    }
  }
}

export function Checklist({ items, exceptions, renderException }: {
  items: CheckItem[]
  exceptions?: { key: string; justification: string }[]
  renderException?: (key: string) => React.ReactNode
}) {
  const t = useTranslations('Startup')
  const detail = useCheckDetail()
  if (!items.length) return <p style={small}>{t('ops.noCriteria')}</p>
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(it => {
        const exc = exceptions?.find(e => e.key === it.key)
        return (
          <li key={it.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span aria-hidden style={{ fontWeight: 700, color: it.ok ? 'var(--success-700)' : 'var(--danger-700)', minWidth: 16 }}>{it.ok ? '✓' : '✗'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-strong)' }}>{t(`ops.check.${it.key}`)}</div>
              <div style={small}>{detail(it)}</div>
              {exc && <div style={{ ...small, marginTop: 4, color: 'var(--warning-700)' }}>{t('ops.exception')}: {exc.justification}</div>}
              {!it.ok && renderException?.(it.key)}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
