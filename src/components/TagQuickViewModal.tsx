'use client'

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  not_started: { label: 'Sin iniciar', color: '#94a3b8', bg: '#f1f5f9' },
  in_progress:  { label: 'En progreso', color: '#3b82f6', bg: '#eff6ff' },
  completed:    { label: 'Completo',    color: '#10b981', bg: '#ecfdf5' },
  on_hold:      { label: 'En pausa',    color: '#f59e0b', bg: '#fffbeb' },
}

export interface TagQuickViewData {
  id: string
  tag_number: string
  description: string
  status: string
  discipline: { code: string; color: string; name: string }
  open_punches_a: number
  open_punches_b: number
  itr_completion_pct: number
}

interface Props {
  tag: TagQuickViewData
  projectId: string
  onClose: () => void
}

export default function TagQuickViewModal({ tag, projectId, onClose }: Props) {
  const status = STATUS_CONFIG[tag.status] ?? STATUS_CONFIG.not_started
  const pct = Math.round(tag.itr_completion_pct)

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: '14px',
          width: '100%',
          maxWidth: '420px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{
                fontFamily: 'ui-monospace, monospace',
                fontSize: '20px',
                fontWeight: 700,
                color: '#0f172a',
                letterSpacing: '-0.5px',
              }}>
                {tag.tag_number}
              </div>
              <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', lineHeight: '1.4' }}>
                {tag.description}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#94a3b8', fontSize: '20px', lineHeight: 1,
                padding: '0 0 0 12px', flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>

          {/* Badges */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
            <span style={{
              padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
              background: `${tag.discipline.color}18`,
              color: tag.discipline.color,
            }}>
              {tag.discipline.code} · {tag.discipline.name}
            </span>
            <span style={{
              padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 500,
              background: status.bg, color: status.color,
            }}>
              {status.label}
            </span>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px' }}>
          {/* ITR Progress */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>Progreso ITR</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: pct === 100 ? '#10b981' : '#0f172a' }}>
                {pct}%
              </span>
            </div>
            <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${pct}%`,
                background: pct === 100 ? '#10b981' : '#3b82f6',
                borderRadius: '999px',
                transition: 'width 0.3s',
              }} />
            </div>
          </div>

          {/* Punch counts */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <span style={{
              padding: '4px 12px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
              background: tag.open_punches_a > 0 ? '#fef2f2' : '#f0fdf4',
              color: tag.open_punches_a > 0 ? '#dc2626' : '#16a34a',
              border: `1px solid ${tag.open_punches_a > 0 ? '#fecaca' : '#bbf7d0'}`,
            }}>
              Cat A: {tag.open_punches_a}
            </span>
            <span style={{
              padding: '4px 12px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
              background: tag.open_punches_b > 0 ? '#fffbeb' : '#f0fdf4',
              color: tag.open_punches_b > 0 ? '#d97706' : '#16a34a',
              border: `1px solid ${tag.open_punches_b > 0 ? '#fde68a' : '#bbf7d0'}`,
            }}>
              Cat B: {tag.open_punches_b}
            </span>
          </div>

          {/* CTA */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <a
              href={`/projects/${projectId}/twin?tag=${tag.id}`}
              style={{
                flex: 1, textAlign: 'center',
                padding: '9px 12px',
                background: '#eff6ff', color: '#2563eb',
                borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                textDecoration: 'none', border: '1px solid #bfdbfe',
              }}
            >
              🔷 Digital Twin
            </a>
            <a
              href={`/projects/${projectId}/tags/${tag.id}`}
              style={{
                flex: 1, textAlign: 'center',
                padding: '9px 12px',
                background: '#0f172a', color: 'white',
                borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              Ver detalle →
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
