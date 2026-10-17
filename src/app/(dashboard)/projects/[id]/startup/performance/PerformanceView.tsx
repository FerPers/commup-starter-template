'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createPerformanceTest } from '@/app/actions/performance'
import { RESULT_TONE, type PerfResult, type PerfRunStatus, type RevisionStatus } from '@/lib/performance/catalog'
import { Alert, Chip, Field, SystemSelect, btn, card, grid, input, linkStyle, small } from '../../daily/daily-ui'
import StartupTabs from '../StartupTabs'

type TestRow = {
  id: string; number: string; title: string; system: string; currentRev: number | null
  openRev: { id: string; rev: number; status: RevisionStatus } | null
  lastRun: { id: string; number: string; status: PerfRunStatus; result: PerfResult | null } | null
}

export const RUN_TONE: Record<PerfRunStatus, 'muted' | 'blue' | 'amber' | 'green' | 'struck'> = {
  planned: 'muted', stabilizing: 'amber', formal: 'blue', closed: 'amber', evaluated: 'green', aborted: 'struck',
}
export const REV_TONE: Record<RevisionStatus, 'muted' | 'blue' | 'green' | 'struck'> = { draft: 'muted', in_review: 'blue', approved: 'green', superseded: 'struck' }

const th: React.CSSProperties = {
  textAlign: 'left', padding: '10px 12px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border)', background: 'var(--gray-50)', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-sm)', verticalAlign: 'top' }
const mono: React.CSSProperties = { fontWeight: 700, color: 'var(--text-strong)', textDecoration: 'none', fontFamily: 'ui-monospace, monospace' }

export default function PerformanceView({ project, systems, tests, canLead }: {
  project: { id: string; code: string; name: string }
  systems: { id: string; code: string; name: string }[]
  tests: TestRow[]
  canLead: boolean
}) {
  const t = useTranslations('Startup')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: '', systemId: '' })
  const root = `/projects/${project.id}/startup/performance`

  function create() {
    setError(null)
    startTransition(async () => {
      const res = await createPerformanceTest({ projectId: project.id, title: form.title, systemId: form.systemId })
      if (res.error || !res.id) { setError(res.error ?? t('error')); return }
      router.push(`${root}/${res.id}`)
    })
  }

  return (
    <div style={{ padding: 32, maxWidth: 1300, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <Link href={`/projects/${project.id}`} style={linkStyle}>← {project.code} · {project.name}</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('title')}</h1>
            <p style={{ ...small, margin: '4px 0 0', maxWidth: 780 }}>{t('perf.subtitle')}</p>
          </div>
          {canLead && <button type="button" style={btn('primary')} onClick={() => setCreating(!creating)}>+ {t('perf.new')}</button>}
        </div>
      </div>

      <StartupTabs projectId={project.id} active="performance" />

      {error && <Alert kind="error">{error}</Alert>}

      {creating && (
        <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={grid}>
            <Field text={t('field.title')} wide required>
              <input style={input} value={form.title} maxLength={200} placeholder={t('perf.titlePlaceholder')} onChange={e => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field text={t('perf.primarySystem')} required>
              <SystemSelect value={form.systemId} onChange={v => setForm({ ...form, systemId: v })} systems={systems} emptyLabel="—" />
            </Field>
          </div>
          <p style={{ ...small, margin: 0 }}>{t('perf.primaryHint')}</p>
          <div>
            <button type="button" style={btn('primary', isPending || !form.title.trim() || !form.systemId)} disabled={isPending || !form.title.trim() || !form.systemId} onClick={create}>{t('create')}</button>
          </div>
        </section>
      )}

      <section style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['number', 'title', 'system', 'revision', 'lastRun'].map(c => <th key={c} style={th}>{t(`perf.col.${c}`)}</th>)}</tr>
          </thead>
          <tbody>
            {tests.map(x => (
              <tr key={x.id}>
                <td style={td}><Link href={`${root}/${x.id}`} style={mono}>{x.number}</Link></td>
                <td style={{ ...td, color: 'var(--text-strong)' }}>{x.title}</td>
                <td style={td}>{x.system}</td>
                <td style={td}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {x.currentRev !== null ? <Chip tone="green">R{x.currentRev} · {t('revStatus.approved')}</Chip> : <Chip tone="muted">{t('notApproved')}</Chip>}
                    {x.openRev && <Chip tone={REV_TONE[x.openRev.status]}>R{x.openRev.rev} · {t(`revStatus.${x.openRev.status}`)}</Chip>}
                  </div>
                </td>
                <td style={td}>
                  {x.lastRun
                    ? <Link href={`${root}/runs/${x.lastRun.id}`} style={{ textDecoration: 'none', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ ...mono, fontWeight: 600 }}>{x.lastRun.number}</span>
                        {x.lastRun.result
                          ? <Chip tone={RESULT_TONE[x.lastRun.result]}>{t(`perf.result.${x.lastRun.result}`)}</Chip>
                          : <Chip tone={RUN_TONE[x.lastRun.status]}>{t(`perf.runStatus.${x.lastRun.status}`)}</Chip>}
                      </Link>
                    : <span style={small}>—</span>}
                </td>
              </tr>
            ))}
            {tests.length === 0 && <tr><td colSpan={5} style={{ ...td, ...small, textAlign: 'center', padding: 24 }}>{t('perf.empty')}</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  )
}
