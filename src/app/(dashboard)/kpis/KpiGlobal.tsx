'use client'

import { useTranslations } from 'next-intl'

const PROJECT_STATUS_COLOR: Record<string, string> = {
  planning:  '#6366f1',
  active:    '#10b981',
  on_hold:   '#f59e0b',
  completed: '#3b82f6',
  cancelled: '#94a3b8',
}

type ProjectKpi = {
  id: string
  name: string
  code: string
  status: string
  start_date: string | null
  end_date: string | null
  totalItrs: number
  approvedItrs: number
  inProgressItrs: number
  completionPct: number
  openCatA: number
  openCatB: number
  issuedCerts: number
  totalCerts: number
}

function ProgressBar({ pct, color, label }: { pct: number; color: string; label: string }) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '11px', color: '#64748b' }}>{label}</span>
        <span style={{ fontSize: '12px', fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '3px', transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

export default function KpiGlobal({ projectKpis }: { projectKpis: ProjectKpi[] }) {
  const t = useTranslations('Kpis')

  const totalItrs      = projectKpis.reduce((s, p) => s + p.totalItrs, 0)
  const totalApproved  = projectKpis.reduce((s, p) => s + p.approvedItrs, 0)
  const totalCatA      = projectKpis.reduce((s, p) => s + p.openCatA, 0)
  const totalCatB      = projectKpis.reduce((s, p) => s + p.openCatB, 0)
  const totalCerts     = projectKpis.reduce((s, p) => s + p.issuedCerts, 0)
  const globalPct      = totalItrs > 0 ? Math.round((totalApproved / totalItrs) * 100) : 0

  const statusLabels: Record<string, string> = {
    planning:  t('projectStatus.planning'),
    active:    t('projectStatus.active'),
    on_hold:   t('projectStatus.on_hold'),
    completed: t('projectStatus.completed'),
    cancelled: t('projectStatus.cancelled'),
  }

  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>{t('title')}</h1>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>{t('subtitle')}</p>
      </div>

      {/* Org-level summary bar */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px 24px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
              {t('org.globalProgress')}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '36px', fontWeight: 800, color: '#0f172a' }}>{globalPct}%</span>
              <span style={{ fontSize: '13px', color: '#64748b' }}>{t('org.approvedItrs', { approved: totalApproved, total: totalItrs })}</span>
            </div>
            <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${globalPct}%`, background: globalPct >= 80 ? '#10b981' : globalPct >= 50 ? '#3b82f6' : '#f59e0b', borderRadius: '4px', transition: 'width 0.4s ease' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#ef4444' }}>{totalCatA}</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>{t('org.catA')}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#f59e0b' }}>{totalCatB}</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>{t('org.catB')}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#10b981' }}>{totalCerts}</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>{t('org.issuedCerts')}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#3b82f6' }}>{projectKpis.filter(p => p.status === 'active').length}</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>{t('org.activeProjects')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Project cards */}
      {projectKpis.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <p style={{ fontSize: '14px', color: '#94a3b8' }}>{t('empty')}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {projectKpis.map(p => {
            const stColor  = PROJECT_STATUS_COLOR[p.status] ?? PROJECT_STATUS_COLOR.planning
            const barColor = p.completionPct >= 80 ? '#10b981' : p.completionPct >= 50 ? '#3b82f6' : '#f59e0b'
            const dates = [p.start_date?.slice(0, 7), p.end_date?.slice(0, 7)].filter(Boolean).join(' → ')

            return (
              <div
                key={p.id}
                style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}
              >
                {/* Card header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#3b82f615', border: '1px solid #3b82f625', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#3b82f6', flexShrink: 0 }}>
                      {p.code.slice(0, 6)}
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{p.name}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>
                        {dates || t('card.noDates')}
                      </div>
                    </div>
                  </div>
                  <span style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, background: `${stColor}18`, color: stColor, border: `1px solid ${stColor}30`, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {statusLabels[p.status] ?? p.status}
                  </span>
                </div>

                {/* Progress bar */}
                <ProgressBar pct={p.completionPct} color={barColor} label={t('card.itrProgress')} />

                {/* Stats row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                  <div style={{ textAlign: 'center', padding: '10px 4px', background: '#f8fafc', borderRadius: '8px' }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>{p.totalItrs}</div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '1px' }}>{t('card.totalItrs')}</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '10px 4px', background: '#f0fdf4', borderRadius: '8px' }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#10b981' }}>{p.approvedItrs}</div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '1px' }}>{t('card.approved')}</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '10px 4px', background: p.openCatA > 0 ? '#fee2e2' : '#f8fafc', borderRadius: '8px' }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: p.openCatA > 0 ? '#ef4444' : '#64748b' }}>{p.openCatA}</div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '1px' }}>{t('card.catA')}</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '10px 4px', background: p.openCatB > 0 ? '#fffbeb' : '#f8fafc', borderRadius: '8px' }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: p.openCatB > 0 ? '#f59e0b' : '#64748b' }}>{p.openCatB}</div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '1px' }}>{t('card.catB')}</div>
                  </div>
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px', borderTop: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    {p.totalCerts > 0
                      ? t('card.issuedOf', { issued: p.issuedCerts, total: p.totalCerts })
                      : t('card.issuedOnly', { issued: p.issuedCerts })}
                  </span>
                  <a
                    href={`/projects/${p.id}/kpis`}
                    style={{ fontSize: '11px', color: '#3b82f6', textDecoration: 'none', fontWeight: 500 }}
                  >
                    {t('card.viewDetail')}
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}