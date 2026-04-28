'use client'

import { useTranslations } from 'next-intl'
import { Card, EmptyState } from '@/components/ui'

const PROJECT_STATUS_COLOR: Record<string, string> = {
  planning:  '#6366f1',
  active:    'var(--success-500)',
  on_hold:   'var(--warning-500)',
  completed: 'var(--primary-500)',
  cancelled: 'var(--gray-400)',
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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ height: 6, background: 'var(--gray-100)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
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
    <div style={{ padding: 32, maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px' }}>{t('title')}</h1>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 0 }}>{t('subtitle')}</p>
      </div>

      {/* Org-level summary bar */}
      <Card padding="md" style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              {t('org.globalProgress')}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: 'var(--text-strong)' }}>{globalPct}%</span>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{t('org.approvedItrs', { approved: totalApproved, total: totalItrs })}</span>
            </div>
            <div style={{ height: 8, background: 'var(--gray-100)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${globalPct}%`,
                background: globalPct >= 80 ? 'var(--success-500)' : globalPct >= 50 ? 'var(--primary-500)' : 'var(--warning-500)',
                borderRadius: 4, transition: 'width 0.4s ease',
              }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
            <Stat value={totalCatA} color="var(--danger-500)"  label={t('org.catA')} />
            <Stat value={totalCatB} color="var(--warning-500)" label={t('org.catB')} />
            <Stat value={totalCerts} color="var(--success-500)" label={t('org.issuedCerts')} />
            <Stat value={projectKpis.filter(p => p.status === 'active').length} color="var(--primary-500)" label={t('org.activeProjects')} />
          </div>
        </div>
      </Card>

      {/* Project cards */}
      {projectKpis.length === 0 ? (
        <Card padding="lg">
          <EmptyState title={t('empty')} />
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {projectKpis.map(p => {
            const stColor  = PROJECT_STATUS_COLOR[p.status] ?? PROJECT_STATUS_COLOR.planning
            const barColor = p.completionPct >= 80
              ? 'var(--success-500)'
              : p.completionPct >= 50 ? 'var(--primary-500)'
              : 'var(--warning-500)'
            const dates = [p.start_date?.slice(0, 7), p.end_date?.slice(0, 7)].filter(Boolean).join(' → ')

            return (
              <Card key={p.id} padding="md" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Card header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 'var(--radius-md)',
                      background: 'var(--primary-50)', border: '1px solid var(--primary-200)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, color: 'var(--primary-500)', flexShrink: 0,
                    }}>
                      {p.code.slice(0, 6)}
                    </div>
                    <div>
                      <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-strong)' }}>{p.name}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 1 }}>
                        {dates || t('card.noDates')}
                      </div>
                    </div>
                  </div>
                  <span style={{
                    padding: '3px 9px', borderRadius: 'var(--radius-pill)',
                    fontSize: 'var(--text-xs)', fontWeight: 600,
                    background: `${stColor}18`, color: stColor, border: `1px solid ${stColor}30`,
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    {statusLabels[p.status] ?? p.status}
                  </span>
                </div>

                {/* Progress bar */}
                <ProgressBar pct={p.completionPct} color={barColor} label={t('card.itrProgress')} />

                {/* Stats row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  <StatCell value={p.totalItrs}    color="var(--text-strong)"   bg="var(--gray-50)"    label={t('card.totalItrs')} />
                  <StatCell value={p.approvedItrs} color="var(--success-500)"   bg="var(--success-50)" label={t('card.approved')} />
                  <StatCell value={p.openCatA}     color={p.openCatA > 0 ? 'var(--danger-500)' : 'var(--text-muted)'}  bg={p.openCatA > 0 ? 'var(--danger-50)'  : 'var(--gray-50)'} label={t('card.catA')} />
                  <StatCell value={p.openCatB}     color={p.openCatB > 0 ? 'var(--warning-500)' : 'var(--text-muted)'} bg={p.openCatB > 0 ? 'var(--warning-50)' : 'var(--gray-50)'} label={t('card.catB')} />
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4, borderTop: '1px solid var(--gray-100)' }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    {p.totalCerts > 0
                      ? t('card.issuedOf', { issued: p.issuedCerts, total: p.totalCerts })
                      : t('card.issuedOnly', { issued: p.issuedCerts })}
                  </span>
                  <a
                    href={`/projects/${p.id}/kpis`}
                    style={{ fontSize: 'var(--text-xs)', color: 'var(--primary-500)', textDecoration: 'none', fontWeight: 500 }}
                  >
                    {t('card.viewDetail')}
                  </a>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Stat({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{label}</div>
    </div>
  )
}

function StatCell({ value, color, bg, label }: { value: number; color: string; bg: string; label: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '10px 4px', background: bg, borderRadius: 'var(--radius-md)' }}>
      <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{label}</div>
    </div>
  )
}
