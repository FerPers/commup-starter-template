import type { ReactNode, CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import { alpha, ink } from '@/lib/theme'
import { Card } from '@/components/ui'

export function SummaryPill({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'var(--card-bg)', borderRadius: 'var(--radius-pill)', border: `1px solid ${alpha(color, 19)}`, boxShadow: 'var(--shadow-sm)' }}>
      <span style={{ fontSize: 'var(--text-md)', fontWeight: 700, color }}>{count}</span>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{label}</span>
    </div>
  )
}

export function TaskSection({ title, count, children, emptyText, style }: {
  title: string; count: number; children: ReactNode; emptyText: string; style?: CSSProperties
}) {
  return (
    <div style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden', ...style }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--gray-100)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-strong)' }}>{title}</span>
        {count > 0 && <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, background: 'var(--gray-100)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: 'var(--radius-pill)' }}>{count}</span>}
      </div>
      {count === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 0 }}>{emptyText}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 16px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * Delta vs hace 7 días. `goodWhenUp=false` para métricas donde bajar es bueno
 * (punches abiertos). `value: null` → historial aún insuficiente → chip "—".
 */
export type KpiDelta = { value: number | null; goodWhenUp: boolean }

function DeltaChip({ delta }: { delta: KpiDelta }) {
  const t = useTranslations('A11y')
  if (delta.value === null) {
    return (
      <span title={t('deltaNoHistory')} style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', background: 'var(--gray-100)', padding: '2px 8px', borderRadius: 'var(--radius-pill)' }}>—</span>
    )
  }
  const up = delta.value > 0
  const flat = delta.value === 0
  const good = flat ? null : (up === delta.goodWhenUp)
  const color = flat ? 'var(--text-muted)' : good ? 'var(--success-500)' : 'var(--danger-500)'
  const bg = flat ? 'var(--gray-100)' : good ? 'var(--success-50)' : 'var(--danger-50)'
  const arrow = flat ? '＝' : up ? '▲' : '▼'
  const num = Math.abs(delta.value)
  const txt = Number.isInteger(num) ? String(num) : num.toFixed(1)
  return (
    <span title={t('deltaVs7d')} style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color, background: bg, padding: '2px 8px', borderRadius: 'var(--radius-pill)' }}>
      {arrow} {up ? '+' : flat ? '' : '-'}{txt}
    </span>
  )
}

export function KpiCard({ label, value, color, sub, danger = false, progress = 0, delta }: {
  label: string; value: string; color: string; sub: string; danger?: boolean; progress?: number; delta?: KpiDelta
}) {
  return (
    <Card padding="md" style={{ borderTop: `3px solid ${color}` }}>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</p>
      <p style={{ fontSize: 36, fontWeight: 700, color: danger ? color : 'var(--text-strong)', margin: '8px 0 4px', letterSpacing: '-1px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {value}
        {delta ? <DeltaChip delta={delta} /> : null}
      </p>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{sub}</p>
      <div style={{ marginTop: 12, height: 6, background: 'var(--gray-100)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${progress}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
    </Card>
  )
}

export function ProjectRow({ project, phases, noMetaText, activeText }: {
  project: { id: string; name: string; code: string; location: string | null; client: string | null; start_date: string | null; end_date: string | null; status: string }
  phases: { id: string; name: string; code: string; color: string; order_index: number }[]
  noMetaText: string
  activeText: string
}) {
  return (
    <div style={{ padding: '16px 20px', background: 'var(--gray-50)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 42, height: 42, borderRadius: 'var(--radius-md)', background: 'var(--primary-50)', border: '1px solid var(--primary-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--primary-700)' }}>
          {project.code}
        </div>
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-strong)', fontSize: 'var(--text-base)' }}>{project.name}</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 2 }}>
            {[project.client, project.location].filter(Boolean).join(' · ') || noMetaText}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {phases.slice(0, 4).map(phase => (
          <div key={phase.id} title={phase.name} style={{ width: 28, height: 28, borderRadius: '50%', background: alpha(phase.color, 13), border: `2px solid ${alpha(phase.color, 25)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-xs)', fontWeight: 700, color: ink(phase.color) }}>
            {phase.code}
          </div>
        ))}
        <span style={{ marginLeft: 8, padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--text-xs)', fontWeight: 600, background: 'var(--success-50)', color: 'var(--success-700)', border: '1px solid var(--success-500)' }}>
          {activeText}
        </span>
      </div>
    </div>
  )
}
