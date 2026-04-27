import type { ReactNode, CSSProperties } from 'react'
import { Card } from '@/components/ui'

export const ITR_STYLE: Record<string, { color: string; bg: string }> = {
  not_started: { color: 'var(--gray-500)', bg: 'var(--gray-100)' },
  in_progress: { color: 'var(--primary-500)', bg: 'var(--primary-50)' },
  completed: { color: 'var(--success-500)', bg: 'var(--success-50)' },
  approved: { color: '#7c3aed', bg: '#f5f3ff' },
  rejected: { color: 'var(--danger-500)', bg: 'var(--danger-50)' },
}

export const PUNCH_STYLE: Record<string, { color: string; bg: string }> = {
  open: { color: 'var(--danger-500)', bg: 'var(--danger-50)' },
  in_progress: { color: 'var(--primary-500)', bg: 'var(--primary-50)' },
  closed: { color: 'var(--success-500)', bg: 'var(--success-50)' },
  cancelled: { color: 'var(--gray-500)', bg: 'var(--gray-100)' },
}

export const CATEGORY_CFG = {
  A: { label: 'Cat A', color: 'var(--danger-500)', bg: 'var(--danger-50)', border: '#fecaca' },
  B: { label: 'Cat B', color: 'var(--warning-500)', bg: 'var(--warning-50)', border: '#fde68a' },
  C: { label: 'Cat C', color: 'var(--gray-500)', bg: 'var(--gray-50)', border: 'var(--border)' },
}

export function SummaryPill({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'var(--card-bg)', borderRadius: 'var(--radius-pill)', border: `1px solid ${color}30`, boxShadow: 'var(--shadow-sm)' }}>
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
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-400)', margin: 0 }}>{emptyText}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 16px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

export function KpiCard({ label, value, color, sub, danger = false, progress = 0 }: {
  label: string; value: string; color: string; sub: string; danger?: boolean; progress?: number
}) {
  return (
    <Card padding="md" style={{ borderTop: `3px solid ${color}` }}>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</p>
      <p style={{ fontSize: 36, fontWeight: 700, color: danger ? color : 'var(--text-strong)', margin: '8px 0 4px', letterSpacing: '-1px' }}>{value}</p>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-400)' }}>{sub}</p>
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
        <div style={{ width: 42, height: 42, borderRadius: 'var(--radius-md)', background: 'var(--primary-50)', border: '1px solid var(--primary-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--primary-500)' }}>
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
          <div key={phase.id} title={phase.name} style={{ width: 28, height: 28, borderRadius: '50%', background: `${phase.color}20`, border: `2px solid ${phase.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-xs)', fontWeight: 700, color: phase.color }}>
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
