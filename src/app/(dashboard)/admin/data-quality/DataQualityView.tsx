'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type {
  DQIssue,
  DQSummaryRow,
  DQSeverity,
  Bottleneck,
} from '@/app/actions/data-quality'

type Project = { id: string; name: string }

type Props = {
  summary: DQSummaryRow[]
  issues: DQIssue[]
  bottlenecks: Bottleneck[]
  projects: Project[]
  activeFilters: { severity?: DQSeverity; category?: string; projectId?: string }
  error?: string
}

const SEVERITY_ORDER: DQSeverity[] = ['critical', 'error', 'warning']
const SEVERITY_COLORS: Record<DQSeverity, string> = {
  critical: '#dc2626',
  error: '#ea580c',
  warning: '#d97706',
}

const CATEGORIES = [
  'itr_integrity',
  'punch_orphans',
  'loop_coverage',
  'certificate_prereqs',
  'date_logic',
  'system_completeness',
] as const

export default function DataQualityView({
  summary,
  issues,
  bottlenecks,
  projects,
  activeFilters,
  error,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('DataQuality')

  const totals: Record<DQSeverity, number> = { critical: 0, error: 0, warning: 0 }
  for (const row of summary) totals[row.severity] += Number(row.count)

  const grandTotal = totals.critical + totals.error + totals.warning

  function updateFilter(key: 'severity' | 'category' | 'project', value: string | undefined) {
    const next = new URLSearchParams(searchParams.toString())
    if (value && value.length > 0) next.set(key, value)
    else next.delete(key)
    router.push(`/admin/data-quality${next.toString() ? `?${next.toString()}` : ''}`)
  }

  return (
    <div style={{ padding: '32px', maxWidth: '1400px' }}>
      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, margin: 0, color: 'var(--text-strong)' }}>
          {t('title')}
        </h1>
        <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '14px' }}>{t('subtitle')}</p>
      </header>

      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '16px',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {/* Severity summary cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px',
          marginBottom: '24px',
        }}
      >
        <SummaryCard label={t('total')} value={grandTotal} color="#0f172a" />
        {SEVERITY_ORDER.map(sev => (
          <SummaryCard
            key={sev}
            label={t(`severity.${sev}`)}
            value={totals[sev]}
            color={SEVERITY_COLORS[sev]}
            active={activeFilters.severity === sev}
            onClick={() =>
              updateFilter('severity', activeFilters.severity === sev ? undefined : sev)
            }
          />
        ))}
      </div>

      {/* Bottlenecks */}
      <section style={{ marginBottom: '32px' }}>
        <h2
          style={{
            fontSize: '16px',
            fontWeight: 600,
            margin: '0 0 12px',
            color: 'var(--text-strong)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '18px' }}>⛓</span>
          {t('bottlenecks.title')}
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 400 }}>
            {t('bottlenecks.hint')}
          </span>
        </h2>
        {bottlenecks.length === 0 ? (
          <EmptyState>{t('bottlenecks.empty')}</EmptyState>
        ) : (
          <div
            style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)', textAlign: 'left' }}>
                  <th style={thStyle}>{t('bottlenecks.score')}</th>
                  <th style={thStyle}>{t('bottlenecks.subsystem')}</th>
                  <th style={thStyle}>{t('bottlenecks.system')}</th>
                  <th style={thStyle}>{t('bottlenecks.itrs')}</th>
                  <th style={thStyle}>{t('bottlenecks.punches')}</th>
                  <th style={thStyle}>{t('bottlenecks.reasons')}</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {bottlenecks.map(b => (
                  <tr key={b.subsystem_id} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={tdStyle}>
                      <ScorePill score={b.bottleneck_score} />
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>
                      {b.subsystem_code}
                      <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{b.subsystem_name}</div>
                    </td>
                    <td style={tdStyle}>{b.system_name}</td>
                    <td style={tdStyle}>
                      {b.itrs_approved}/{b.total_itrs}
                      {b.itrs_remaining > 0 && (
                        <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>
                          (−{b.itrs_remaining})
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {b.punch_a_open > 0 && (
                        <span style={pillStyle('#dc2626')}>A: {b.punch_a_open}</span>
                      )}
                      {b.punch_b_open > 0 && (
                        <span style={pillStyle('#ea580c')}>B: {b.punch_b_open}</span>
                      )}
                      {b.punch_c_open > 0 && (
                        <span style={pillStyle('var(--text-muted)')}>C: {b.punch_c_open}</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {(b.reasons ?? []).map(r => (
                        <span key={r} style={reasonStyle}>
                          {t(`reason.${r}`)}
                        </span>
                      ))}
                    </td>
                    <td style={tdStyle}>
                      <a
                        href={`/projects/${b.project_id}/explorer?subsystem=${b.subsystem_id}`}
                        style={linkStyle}
                      >
                        →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Filters */}
      <section style={{ marginBottom: '16px' }}>
        <h2
          style={{
            fontSize: '16px',
            fontWeight: 600,
            margin: '0 0 12px',
            color: 'var(--text-strong)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '18px' }}>⚠</span>
          {t('issues.title')}
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 400 }}>
            {issues.length} {t('issues.shown')}
          </span>
        </h2>

        <div
          style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
            marginBottom: '12px',
            alignItems: 'center',
          }}
        >
          <select
            value={activeFilters.projectId ?? ''}
            onChange={e => updateFilter('project', e.target.value || undefined)}
            style={selectStyle}
          >
            <option value="">{t('filter.allProjects')}</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            value={activeFilters.category ?? ''}
            onChange={e => updateFilter('category', e.target.value || undefined)}
            style={selectStyle}
          >
            <option value="">{t('filter.allCategories')}</option>
            {CATEGORIES.map(c => (
              <option key={c} value={c}>
                {t(`category.${c}`)}
              </option>
            ))}
          </select>

          {(activeFilters.severity || activeFilters.category || activeFilters.projectId) && (
            <button
              onClick={() => router.push('/admin/data-quality')}
              style={{
                padding: '7px 12px',
                border: '1px solid var(--border)',
                background: 'var(--card-bg)',
                borderRadius: '8px',
                color: 'var(--text-muted)',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              {t('filter.clear')}
            </button>
          )}
        </div>
      </section>

      {/* Issues table */}
      {issues.length === 0 ? (
        <EmptyState>{t('issues.empty')}</EmptyState>
      ) : (
        <div
          style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)', textAlign: 'left' }}>
                <th style={thStyle}>{t('issues.severity')}</th>
                <th style={thStyle}>{t('issues.category')}</th>
                <th style={thStyle}>{t('issues.entity')}</th>
                <th style={thStyle}>{t('issues.description')}</th>
                <th style={thStyle}>{t('issues.fix')}</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {issues.map((iss, i) => (
                <tr key={`${iss.entity_type}-${iss.entity_id}-${i}`} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={tdStyle}>
                    <span
                      style={{
                        ...pillStyle(SEVERITY_COLORS[iss.severity]),
                        textTransform: 'uppercase',
                        fontSize: '10px',
                      }}
                    >
                      {t(`severity.${iss.severity}`)}
                    </span>
                  </td>
                  <td style={tdStyle}>{t(`category.${iss.category}`)}</td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>{iss.entity_label}</div>
                    <div style={{ color: 'var(--gray-400)', fontSize: '11px' }}>{iss.entity_type}</div>
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{iss.description}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: '12px' }}>{iss.suggested_fix}</td>
                  <td style={tdStyle}>
                    <a href={iss.fix_url} style={linkStyle}>
                      →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  color,
  active,
  onClick,
}: {
  label: string
  value: number
  color: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      style={{
        textAlign: 'left',
        background: active ? 'var(--gray-100)' : 'var(--card-bg)',
        border: `1px solid ${active ? color : 'var(--border)'}`,
        borderRadius: '10px',
        padding: '16px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: '28px', fontWeight: 700, color, marginTop: '4px' }}>{value}</div>
    </button>
  )
}

function ScorePill({ score }: { score: number }) {
  const color = score >= 70 ? '#dc2626' : score >= 40 ? '#ea580c' : '#d97706'
  return (
    <span
      style={{
        display: 'inline-block',
        minWidth: '36px',
        textAlign: 'center',
        padding: '3px 8px',
        fontSize: '12px',
        fontWeight: 700,
        background: color,
        color: '#fff',
        borderRadius: '6px',
      }}
    >
      {score}
    </span>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '40px',
        textAlign: 'center',
        color: 'var(--text-muted)',
        background: 'var(--gray-50)',
        border: '1px dashed #cbd5e1',
        borderRadius: '10px',
        fontSize: '14px',
      }}
    >
      {children}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontWeight: 600,
  color: 'var(--text-muted)',
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  verticalAlign: 'top',
}

const pillStyle = (color: string): React.CSSProperties => ({
  display: 'inline-block',
  padding: '2px 7px',
  background: color,
  color: '#fff',
  borderRadius: '4px',
  fontSize: '11px',
  fontWeight: 600,
  marginRight: '4px',
})

const reasonStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 7px',
  background: 'var(--gray-100)',
  color: 'var(--text-muted)',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  fontSize: '11px',
  marginRight: '4px',
  marginBottom: '2px',
}

const selectStyle: React.CSSProperties = {
  padding: '7px 10px',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  background: 'var(--card-bg)',
  fontSize: '13px',
  color: 'var(--text-strong)',
}

const linkStyle: React.CSSProperties = {
  color: '#3b82f6',
  textDecoration: 'none',
  fontWeight: 600,
  fontSize: '16px',
}
