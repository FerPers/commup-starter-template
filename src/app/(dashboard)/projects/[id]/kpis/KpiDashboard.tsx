'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { takeProjectSnapshot } from '@/app/actions/kpi-snapshots'
import type { SubsystemKpi, SnapshotRow } from '@/app/actions/kpi-snapshots'
import type { ProjectAlert } from '@/app/actions/alerts'
import AlertsPanel from './AlertsPanel'

type PhaseKpi = {
  id: string
  code: string
  name: string
  color: string
  total: number
  approved: number
  pct: number
}

interface Props {
  projectId: string
  projectName: string
  projectCode: string
  startDate: string | null
  endDate: string | null
  phaseKpis: PhaseKpi[]
  subsystemKpis: SubsystemKpi[]
  snapshots: SnapshotRow[]
  canEdit: boolean
  alerts: ProjectAlert[]
}

// ── S-curve helpers ────────────────────────────────────────────────────────

function buildPlannedPoints(startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate) return []
  const start = new Date(startDate).getTime()
  const end = new Date(endDate).getTime()
  if (end <= start) return []

  const points: { date: string; planned: number }[] = []
  const cursor = new Date(startDate)
  cursor.setDate(1)

  while (cursor.getTime() <= end) {
    const elapsed = cursor.getTime() - start
    const pct = Math.max(0, Math.min(100, Math.round((elapsed / (end - start)) * 100)))
    points.push({ date: cursor.toISOString().split('T')[0], planned: pct })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  if (points[points.length - 1]?.date !== endDate) {
    points.push({ date: endDate, planned: 100 })
  }
  return points
}

type ChartPoint = { date: string; planned?: number; actual?: number }

function buildChartData(
  plannedPoints: { date: string; planned: number }[],
  snapshots: SnapshotRow[]
): ChartPoint[] {
  const map = new Map<string, ChartPoint>()

  for (const p of plannedPoints) {
    map.set(p.date, { date: p.date, planned: p.planned })
  }
  for (const s of snapshots) {
    const existing = map.get(s.snapshot_date) ?? { date: s.snapshot_date }
    map.set(s.snapshot_date, { ...existing, actual: s.completion_pct })
  }

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatusDot({ pct, hasPunches }: { pct: number; hasPunches: boolean }) {
  const color = pct === 100 && !hasPunches ? '#10b981' : pct > 0 ? '#f59e0b' : '#ef4444'
  return <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0, margin: '0 auto' }} />
}

// ── Main component ─────────────────────────────────────────────────────────

export default function KpiDashboard({
  projectId, projectName, projectCode, startDate, endDate,
  phaseKpis, subsystemKpis, snapshots, canEdit, alerts,
}: Props) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('Kpis.project')
  const [isPending, startTransition] = useTransition()
  const [snapshotMsg, setSnapshotMsg] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState<keyof SubsystemKpi>('code')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Pre-compute chart labels (can't use hooks inside recharts callbacks)
  const plannedLabel = t('scurvePlanned')
  const actualLabel = t('scurveActual')

  function formatDateTick(value: string) {
    if (!value) return ''
    const d = new Date(value + 'T00:00:00')
    return d.toLocaleDateString(locale, { month: 'short', year: '2-digit' })
  }

  function handleSnapshot() {
    setSnapshotMsg(null)
    startTransition(async () => {
      const res = await takeProjectSnapshot(projectId)
      if (res.success) {
        setSnapshotMsg(t('snapshotSaved'))
        router.refresh()
        window.open(`/projects/${projectId}/kpis/report`, '_blank')
      } else {
        setSnapshotMsg(`Error: ${res.error}`)
      }
    })
  }

  function handleSort(col: keyof SubsystemKpi) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const filteredSubsystems = subsystemKpis
    .filter(ss =>
      !search ||
      ss.code.toLowerCase().includes(search.toLowerCase()) ||
      ss.name.toLowerCase().includes(search.toLowerCase()) ||
      ss.systemCode.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const va = a[sortCol], vb = b[sortCol]
      const cmp = typeof va === 'string'
        ? (va as string).localeCompare(vb as string)
        : (va as number) - (vb as number)
      return sortDir === 'asc' ? cmp : -cmp
    })

  const plannedPoints = buildPlannedPoints(startDate, endDate)
  const chartData = buildChartData(plannedPoints, snapshots)
  const hasChart = chartData.length > 0
  const lastSnapshot = snapshots[snapshots.length - 1]

  const totalItrs = phaseKpis.reduce((s, p) => s + p.total, 0)
  const totalApproved = phaseKpis.reduce((s, p) => s + p.approved, 0)
  const overallPct = totalItrs > 0 ? Math.round((totalApproved / totalItrs) * 100) : 0

  const thStyle = (col: keyof SubsystemKpi): React.CSSProperties => ({
    padding: '10px 12px', fontSize: '11px', fontWeight: 600,
    color: sortCol === col ? '#3b82f6' : 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.04em',
    cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
    textAlign: 'left',
  })

  const tableCols: { key: keyof SubsystemKpi; label: string }[] = [
    { key: 'systemCode', label: t('colSystem') },
    { key: 'code', label: t('colSubsystem') },
    { key: 'totalItrs', label: t('colItrs') },
    { key: 'approvedItrs', label: t('colApproved') },
    { key: 'completionPct', label: t('colPct') },
    { key: 'openCatA', label: t('colPunchA') },
    { key: 'openCatB', label: t('colPunchB') },
  ]

  return (
    <div style={{ padding: '32px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <a href={`/projects/${projectId}`} style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none', display: 'inline-block', marginBottom: '8px' }}>
            {t('backLink', { name: projectName })}
          </a>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-strong)', letterSpacing: '-0.5px', margin: 0 }}>
            KPIs — {projectCode}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '4px 0 0' }}>
            {t('subtitle', { approved: totalApproved, total: totalItrs, pct: overallPct })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {canEdit && (
            <button
              onClick={handleSnapshot}
              disabled={isPending}
              style={{
                padding: '9px 16px', background: isPending ? 'var(--gray-100)' : 'var(--card-bg)',
                border: '1px solid var(--border)', borderRadius: '8px',
                fontSize: '13px', color: 'var(--text-muted)', cursor: isPending ? 'not-allowed' : 'pointer',
                fontWeight: 500, whiteSpace: 'nowrap',
              }}
            >
              {isPending ? t('snapshotGenerating') : t('snapshotBtn')}
            </button>
          )}
          {snapshots.length > 0 && (
            <a
              href={`/projects/${projectId}/kpis/report`}
              target="_blank"
              style={{
                padding: '9px 14px', background: 'var(--card-bg)', border: '1px solid var(--border)',
                borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)',
                textDecoration: 'none', whiteSpace: 'nowrap', fontWeight: 500,
              }}
            >
              {t('viewReport')}
            </a>
          )}
          <a
            href={`/projects/${projectId}/reports/system-completion/pdf`}
            target="_blank"
            style={{
              padding: '9px 14px', background: 'var(--card-bg)', border: '1px solid var(--border)',
              borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)',
              textDecoration: 'none', whiteSpace: 'nowrap', fontWeight: 500,
            }}
          >
            {t('systemCompletionPdf')}
          </a>
          <a
            href={`/projects/${projectId}/reports/phase-progress/pdf`}
            target="_blank"
            style={{
              padding: '9px 14px', background: 'var(--card-bg)', border: '1px solid var(--border)',
              borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)',
              textDecoration: 'none', whiteSpace: 'nowrap', fontWeight: 500,
            }}
          >
            {t('phaseProgressPdf')}
          </a>
          <a
            href={`/projects/${projectId}/reports/area-kpis/pdf`}
            target="_blank"
            style={{
              padding: '9px 14px', background: 'var(--card-bg)', border: '1px solid var(--border)',
              borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)',
              textDecoration: 'none', whiteSpace: 'nowrap', fontWeight: 500,
            }}
          >
            {t('areaKpisPdf')}
          </a>
          <a
            href={`/projects/${projectId}/kpis/export`}
            style={{
              padding: '9px 16px', background: '#3b82f6', color: '#fff',
              borderRadius: '8px', fontSize: '13px', fontWeight: 500,
              textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >
            {t('exportExcel')}
          </a>
        </div>
      </div>

      {snapshotMsg && (
        <div style={{
          padding: '10px 14px', borderRadius: '8px', marginBottom: '20px', fontSize: '13px',
          background: snapshotMsg.startsWith('Error') ? '#fee2e2' : '#ecfdf5',
          color: snapshotMsg.startsWith('Error') ? '#dc2626' : '#16a34a',
          border: `1px solid ${snapshotMsg.startsWith('Error') ? '#fecaca' : '#bbf7d0'}`,
        }}>
          {snapshotMsg}
        </div>
      )}

      {/* Alerts */}
      <AlertsPanel alerts={alerts} />

      {/* Phase KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        {phaseKpis.map(phase => (
          <div key={phase.id} style={{
            background: 'var(--card-bg)', borderRadius: '12px', padding: '18px 20px',
            border: '1px solid var(--border)', borderTop: `3px solid ${phase.color}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500, margin: 0 }}>{phase.name}</p>
              <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, background: `${phase.color}18`, color: phase.color }}>
                {phase.code}
              </span>
            </div>
            <p style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px', letterSpacing: '-1px' }}>{phase.pct}%</p>
            <p style={{ fontSize: '11px', color: 'var(--gray-400)', margin: '0 0 10px' }}>{phase.approved} / {phase.total} ITRs</p>
            <div style={{ height: '5px', background: 'var(--gray-100)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${phase.pct}%`, height: '100%', background: phase.color, borderRadius: '3px' }} />
            </div>
          </div>
        ))}
      </div>

      {/* S-curve */}
      <div style={{
        background: 'var(--card-bg)', borderRadius: '14px', padding: '24px',
        border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        marginBottom: '24px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)', margin: 0 }}>{t('sCurveTitle')}</h3>
            <p style={{ fontSize: '12px', color: 'var(--gray-400)', margin: '3px 0 0' }}>
              {snapshots.length > 0
                ? t('snapshotCount', { count: snapshots.length, date: lastSnapshot?.snapshot_date ?? '' })
                : canEdit
                  ? t('noSnapshotsEdit')
                  : t('noSnapshotsView')
              }
            </p>
          </div>
          {lastSnapshot && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#3b82f6', letterSpacing: '-1px' }}>
                {lastSnapshot.completion_pct}%
              </div>
              <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>{t('lastRecord')}</div>
            </div>
          )}
        </div>

        {hasChart ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 5, right: 24, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDateTick}
                tick={{ fontSize: 11, fill: 'var(--gray-400)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
              />
              <YAxis
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 11, fill: 'var(--gray-400)' }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                formatter={(value, name) => [`${value}%`, name === 'planned' ? plannedLabel : actualLabel]}
                labelFormatter={value => formatDateTick(String(value))}
                contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
              />
              <Legend
                formatter={(value: string) => value === 'planned' ? plannedLabel : actualLabel}
                wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
              />
              {plannedPoints.length > 0 && (
                <Line
                  dataKey="planned"
                  name="planned"
                  stroke="#cbd5e1"
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                  dot={false}
                  connectNulls
                />
              )}
              <Line
                dataKey="actual"
                name="actual"
                stroke="#3b82f6"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }}
                activeDot={{ r: 6 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{
            height: '200px', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'var(--gray-50)', borderRadius: '10px', border: '2px dashed #e2e8f0',
          }}>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 500, margin: '0 0 6px' }}>{t('noChartEmpty')}</p>
            <p style={{ fontSize: '12px', color: 'var(--gray-400)', margin: 0, textAlign: 'center' }}>
              {canEdit ? t('noChartEdit') : t('noChartView')}
            </p>
          </div>
        )}
      </div>

      {/* Subsystem completion table */}
      <div style={{
        background: 'var(--card-bg)', borderRadius: '14px',
        border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid #f1f5f9',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap',
        }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)', margin: 0 }}>
            {t('tableTitle')}
          </h3>
          {subsystemKpis.length > 0 && (
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                padding: '7px 12px', border: '1px solid var(--border)', borderRadius: '8px',
                fontSize: '13px', color: 'var(--text-strong)', background: 'var(--gray-50)', outline: 'none', width: '220px',
              }}
            />
          )}
        </div>

        {subsystemKpis.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <p style={{ color: 'var(--gray-400)', fontSize: '14px', margin: 0 }}>{t('noSubsystems')}</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid #f1f5f9' }}>
                  {tableCols.map(col => (
                    <th key={col.key} onClick={() => handleSort(col.key)} style={thStyle(col.key)}>
                      {col.label}{sortCol === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                  ))}
                  <th style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>
                    {t('colStatus')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredSubsystems.map((ss, i) => (
                  <tr key={ss.id} style={{ borderBottom: '1px solid #f8fafc', background: i % 2 === 0 ? 'var(--card-bg)' : 'var(--gray-50)' }}>
                    <td style={{ padding: '11px 12px', fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500 }}>
                      {ss.systemCode}
                    </td>
                    <td style={{ padding: '11px 12px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-strong)' }}>{ss.code}</div>
                      <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '1px' }}>{ss.name}</div>
                    </td>
                    <td style={{ padding: '11px 12px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>{ss.totalItrs}</td>
                    <td style={{ padding: '11px 12px', fontSize: '13px', color: '#10b981', fontWeight: 500, textAlign: 'center' }}>{ss.approvedItrs}</td>
                    <td style={{ padding: '11px 12px', minWidth: '130px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: '6px', background: 'var(--gray-100)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${ss.completionPct}%`, height: '100%', borderRadius: '3px',
                            background: ss.completionPct === 100 ? '#10b981' : ss.completionPct > 0 ? '#3b82f6' : 'var(--border)',
                          }} />
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-strong)', minWidth: '32px', textAlign: 'right' }}>
                          {ss.completionPct}%
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '11px 12px', fontSize: '13px', textAlign: 'center', color: ss.openCatA > 0 ? '#ef4444' : 'var(--gray-400)', fontWeight: ss.openCatA > 0 ? 600 : 400 }}>
                      {ss.openCatA > 0 ? ss.openCatA : '—'}
                    </td>
                    <td style={{ padding: '11px 12px', fontSize: '13px', textAlign: 'center', color: ss.openCatB > 0 ? '#f59e0b' : 'var(--gray-400)', fontWeight: ss.openCatB > 0 ? 600 : 400 }}>
                      {ss.openCatB > 0 ? ss.openCatB : '—'}
                    </td>
                    <td style={{ padding: '11px 12px', textAlign: 'center' }}>
                      <StatusDot pct={ss.completionPct} hasPunches={ss.openCatA > 0 || ss.openCatB > 0} />
                    </td>
                  </tr>
                ))}
                {filteredSubsystems.length === 0 && search && (
                  <tr>
                    <td colSpan={8} style={{ padding: '30px', textAlign: 'center', color: 'var(--gray-400)', fontSize: '13px' }}>
                      {t('noResults', { search })}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {subsystemKpis.length > 0 && (
          <div style={{ padding: '12px 24px', borderTop: '1px solid #f1f5f9', background: 'var(--gray-50)', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              <strong style={{ color: 'var(--text-strong)' }}>{t('footerSubsystems', { count: subsystemKpis.length })}</strong>
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              <strong style={{ color: '#10b981' }}>{t('footerComplete', { count: subsystemKpis.filter(ss => ss.completionPct === 100).length })}</strong>
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              <strong style={{ color: '#ef4444' }}>{t('footerPunchA', { count: subsystemKpis.reduce((s, ss) => s + ss.openCatA, 0) })}</strong>
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              <strong style={{ color: '#f59e0b' }}>{t('footerPunchB', { count: subsystemKpis.reduce((s, ss) => s + ss.openCatB, 0) })}</strong>
            </span>
          </div>
        )}
      </div>

    </div>
  )
}