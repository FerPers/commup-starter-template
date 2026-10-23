'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { createDailyReportDraft } from '@/app/actions/daily-report'
import { formatInZone, todayIn } from '@/lib/time/zone'
import { Alert, Chip, DailyTabs, btn, card, input, small } from '../daily-ui'

export type ReportRow = {
  id: string; number: string; date: string; revision: number; status: 'draft' | 'issued' | 'superseded'
  issuedAt: string | null; issuedBy: string | null; updatedAt: string; area: string | null; hasSummary: boolean
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '10px 12px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border)', background: 'var(--gray-50)', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-sm)', verticalAlign: 'top' }
const TONE = { draft: 'amber', issued: 'green', superseded: 'struck' } as const

export default function ReportsListView({ project, reports, areas, canCreate }: {
  project: { id: string; code: string; name: string; timezone: string }
  reports: ReportRow[]
  areas: { id: string; code: string; name: string }[]
  canCreate: boolean
}) {
  const t = useTranslations('Daily')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // S10 (D-05/G-13): «hoy» del proyecto, igual en el servidor (UTC) y en el navegador
  const today = useMemo(() => todayIn(project.timezone), [project.timezone])
  const locale = useLocale()
  const [date, setDate] = useState(today)
  const [areaId, setAreaId] = useState('')

  function create() {
    setError(null)
    startTransition(async () => {
      const res = await createDailyReportDraft({ projectId: project.id, date, areaId: areaId || null })
      if (res.error || !res.id) { setError(res.error ?? t('form.error')); return }
      router.push(`/projects/${project.id}/daily/reports/${res.id}`)
    })
  }

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <DailyTabs projectId={project.id} active="reports" subtitle={t('reports.subtitle')} />

      {canCreate && (
        <section style={{ ...card, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={small}>{t('report.date')}</span>
            <input type="date" style={{ ...input, width: 170 }} value={date} max={today} onChange={e => setDate(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={small}>{t('report.area')}</span>
            <select style={{ ...input, width: 260 }} value={areaId} onChange={e => setAreaId(e.target.value)}>
              <option value="">{t('report.allAreas')}</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </label>
          <button type="button" style={btn('primary', isPending || !date)} disabled={isPending || !date} onClick={create}>
            {isPending ? t('report.generating') : t('report.createDraft')}
          </button>
          <p style={{ ...small, margin: 0, flexBasis: '100%' }}>{t('report.createHelp')}</p>
        </section>
      )}
      {error && <Alert kind="error">{error}</Alert>}

      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            {['number', 'date', 'area', 'status', 'issued'].map(c => <th key={c} style={th}>{t(`report.col.${c}`)}</th>)}
            <th style={th}><span className="sr-only">PDF</span></th>
          </tr></thead>
          <tbody>
            {reports.map(r => (
              <tr key={r.id}>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <Link href={`/projects/${project.id}/daily/reports/${r.id}`} style={{ fontWeight: 700, color: 'var(--text-strong)', textDecoration: 'none', fontFamily: 'ui-monospace, monospace' }}>{r.number}</Link>
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{r.date}</td>
                <td style={td}>{r.area ?? t('report.allAreas')}</td>
                <td style={td}><Chip tone={TONE[r.status]}>{t(`report.status.${r.status}`)}</Chip></td>
                <td style={{ ...td, ...small }}>{r.issuedAt ? `${r.issuedBy ?? '—'} · ${formatInZone(r.issuedAt, project.timezone, locale)}` : '—'}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <a href={`/projects/${project.id}/daily/reports/${r.id}/pdf`} target="_blank" rel="noopener" style={{ fontSize: 'var(--text-sm)', color: 'var(--primary-700)' }}>PDF</a>
                </td>
              </tr>
            ))}
            {reports.length === 0 && <tr><td colSpan={6} style={{ ...td, ...small, textAlign: 'center', padding: 32 }}>{t('report.empty')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
