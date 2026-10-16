'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  deleteDailyReportDraft, generateDailyReportAi, issueDailyReport, refreshDailyReportData, reviseDailyReport, updateDailyReportSections,
} from '@/app/actions/daily-report'
import { REPORT_SECTIONS, progressDelta, type ReportData, type ReportSections } from '@/lib/daily/report'
import { Alert, Chip, btn, card, input, label, small } from '../../daily-ui'

type Report = {
  id: string; number: string; date: string; revision: number; status: 'draft' | 'issued' | 'superseded'
  data: ReportData; dataAt: string; revisionReason: string | null; sections: ReportSections
  aiGeneratedAt: string | null; aiModel: string | null
  issuedBy: string | null; issuedAt: string | null; hash: string | null
  laterRevision: { id: string; number: string } | null
}

const TONE = { draft: 'amber', issued: 'green', superseded: 'struck' } as const
const mini: React.CSSProperties = { ...small, fontSize: 'var(--text-xs)', margin: 0 }

export default function ReportEditor({ project, report, canEdit, canIssue, canDelete, aiConfigured }: {
  project: { id: string; code: string; name: string }
  report: Report
  canEdit: boolean
  canIssue: boolean
  canDelete: boolean
  aiConfigured: boolean
}) {
  const t = useTranslations('Daily')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [sections, setSections] = useState<ReportSections>(report.sections)
  const draft = report.status === 'draft'
  const editable = draft && canEdit
  const dirty = REPORT_SECTIONS.some(s => sections[s] !== report.sections[s])
  const base = { projectId: project.id, reportId: report.id }
  const d = report.data
  const delta = progressDelta(d.progress)

  function run(tag: string, fn: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null); setSaved(false); setBusy(tag)
    startTransition(async () => {
      const res = await fn()
      setBusy(null)
      if (res.error) { setError(res.error); return }
      after?.()
      router.refresh()
    })
  }

  // Guardar antes de cualquier paso que lea las secciones desde la BD.
  async function saveFirst() {
    if (!dirty) return {}
    return updateDailyReportSections({ ...base, sections })
  }

  function save() { run('save', () => updateDailyReportSections({ ...base, sections }), () => setSaved(true)) }

  function ai() {
    const hasText = REPORT_SECTIONS.some(s => sections[s].trim())
    const replace = hasText ? window.confirm(t('report.aiReplaceConfirm')) : false
    run('ai', async () => {
      const first = await saveFirst()
      if (first.error) return first
      return generateDailyReportAi({ ...base, replace })
    })
  }

  function refresh() {
    run('refresh', async () => {
      const first = await saveFirst()
      if (first.error) return first
      return refreshDailyReportData(base)
    })
  }

  function issue() {
    if (!window.confirm(t('report.issueConfirm'))) return
    run('issue', async () => {
      const first = await saveFirst()
      if (first.error) return first
      return issueDailyReport(base)
    })
  }

  function revise() {
    const reason = window.prompt(t('report.revisePrompt'))
    if (!reason?.trim()) return
    setError(null); setBusy('revise')
    startTransition(async () => {
      const res = await reviseDailyReport({ ...base, reason })
      setBusy(null)
      if (res.error || !res.id) { setError(res.error ?? t('form.error')); return }
      router.push(`/projects/${project.id}/daily/reports/${res.id}`)
    })
  }

  function remove() {
    if (!window.confirm(t('detail.deleteConfirm'))) return
    run('delete', () => deleteDailyReportDraft(base), () => router.push(`/projects/${project.id}/daily/reports`))
  }

  // Sincroniza si el servidor cambió las secciones (IA, refresco) y no hay ediciones locales.
  const serverKey = REPORT_SECTIONS.map(s => report.sections[s]).join('\u0000')
  const [lastServerKey, setLastServerKey] = useState(serverKey)
  if (serverKey !== lastServerKey) {
    setLastServerKey(serverKey)
    setSections(report.sections)
  }

  const fact = (title: string, value: string | number, sub?: string) => (
    <div style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={label}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)' }}>{value}</div>
      {sub && <div style={mini}>{sub}</div>}
    </div>
  )
  const lv = d.constraints.open_by_level

  return (
    <div style={{ padding: 32, maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <Link href={`/projects/${project.id}/daily/reports`} style={{ fontSize: 'var(--text-sm)', color: 'var(--primary-600, #2563eb)', textDecoration: 'none', fontWeight: 500 }}>← {t('tab.reports')}</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-strong)', margin: 0, fontFamily: 'ui-monospace, monospace' }}>{report.number}</h1>
          <Chip tone={TONE[report.status]}>{t(`report.status.${report.status}`)}</Chip>
          {d.area && <Chip tone="muted">{d.area.code}</Chip>}
        </div>
        <p style={{ ...small, margin: '6px 0 0' }} suppressHydrationWarning>
          {project.code} · {report.date} · {t('report.dataAt', { when: new Date(report.dataAt).toLocaleString() })}
          {report.aiGeneratedAt && <> · {t('report.aiAt', { when: new Date(report.aiGeneratedAt).toLocaleString() })}</>}
          {report.issuedAt && <> · {t('report.issuedBy', { who: report.issuedBy ?? '—', when: new Date(report.issuedAt).toLocaleString() })}</>}
        </p>
        {report.revision > 0 && <p style={{ ...small, margin: '4px 0 0', fontStyle: 'italic' }}>{t('report.revisionOf', { n: report.revision, reason: report.revisionReason ?? '' })}</p>}
        {report.hash && <p style={{ ...mini, marginTop: 4, fontFamily: 'ui-monospace, monospace' }}>sha256 {report.hash}</p>}
      </div>

      {report.status === 'superseded' && report.laterRevision && (
        <Alert kind="warn">{t('report.superseded')} <Link href={`/projects/${project.id}/daily/reports/${report.laterRevision.id}`}>{report.laterRevision.number}</Link></Alert>
      )}
      {error && <Alert kind="error">{error}</Alert>}
      {saved && <Alert kind="ok">{t('form.saved')}</Alert>}
      {editable && !aiConfigured && <Alert kind="warn">{t('report.aiOff')}</Alert>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {editable && aiConfigured && <button type="button" style={btn('outline', isPending)} disabled={isPending} onClick={ai}>{busy === 'ai' ? t('report.aiWorking') : t('report.ai')}</button>}
        {editable && <button type="button" style={btn('outline', isPending)} disabled={isPending} onClick={refresh}>{busy === 'refresh' ? t('form.saving') : t('report.refresh')}</button>}
        {editable && <button type="button" style={btn('outline', isPending || !dirty)} disabled={isPending || !dirty} onClick={save}>{t('form.save')}</button>}
        {draft && canIssue && <button type="button" style={btn('primary', isPending || !sections.summary.trim())} disabled={isPending || !sections.summary.trim()} onClick={issue}>{t('report.issue')}</button>}
        {report.status === 'issued' && canIssue && !report.laterRevision && <button type="button" style={btn('outline', isPending)} disabled={isPending} onClick={revise}>{t('report.revise')}</button>}
        <a href={`/projects/${project.id}/daily/reports/${report.id}/pdf`} target="_blank" rel="noopener" style={btn('outline')}>{t('report.pdf')}</a>
        {draft && canDelete && <button type="button" style={{ ...btn('outline'), color: 'var(--danger-700)' }} disabled={isPending} onClick={remove}>{t('detail.delete')}</button>}
      </div>
      {draft && !canIssue && <p style={{ ...small, margin: 0 }}>{t('report.issueRole')}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(280px, 2fr)', gap: 16, alignItems: 'start' }}>
        <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }} aria-label={t('report.sectionsTitle')}>
          {REPORT_SECTIONS.map(s => (
            <label key={s} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={label}>{t(`report.section.${s}`)}{s === 'summary' ? ' *' : ''}</span>
              <textarea rows={s === 'summary' ? 4 : 5} style={{ ...input, fontFamily: 'inherit' }} value={sections[s]} disabled={!editable} maxLength={8000}
                placeholder={editable ? t(`report.placeholder.${s}`) : ''} onChange={e => setSections(v => ({ ...v, [s]: e.target.value }))} />
            </label>
          ))}
        </section>

        <aside style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }} aria-label={t('report.dataTitle')}>
          <div style={label}>{t('report.dataTitle')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {fact(t('report.fact.weighted'), `${(Number(d.progress.weighted_pct) * 100).toFixed(1)} %`, delta === null ? t('report.fact.noPrev') : `${delta >= 0 ? '+' : ''}${delta} pp`)}
            {fact(t('report.fact.gates'), `${d.progress.gates_approved}/${d.progress.gates_total}`)}
            {fact(t('report.fact.itrs'), d.itrs.approved_today.length, t('report.fact.itrsSub', { done: d.itrs.completed_today, wip: d.itrs.in_progress }))}
            {fact(t('report.fact.punches'), d.punches.raised_today.length, t('report.fact.punchesSub', { closed: d.punches.closed_today, a: d.punches.open_a }))}
            {fact(t('report.fact.constraints'), Number(lv['1']) + Number(lv['2']) + Number(lv['3']) + Number(lv['4']), `N3 ${lv['3']} · N4 ${lv['4']} · ${t('report.fact.overdue', { n: d.constraints.overdue })}`)}
            {fact(t('report.fact.actions'), d.actions.open, t('report.fact.overdue', { n: d.actions.overdue.length }))}
          </div>
          <List title={t('report.list.critical')} rows={d.constraints.open_high.map(c => `${c.number} N${c.level} · ${c.title}${c.system ? ` [${c.system}]` : ''} · ${c.need_date}`)} empty={t('report.list.none')} />
          <List title={t('report.list.regressed')} rows={d.gates.regressed.map(g => `${g.system} ${g.gate}`)} empty={t('report.list.none')} />
          <List title={t('report.list.field')} rows={d.registers_in_field.map(r => `${r.number} · ${r.kind} · ${r.title}${r.system ? ` [${r.system}]` : ''}`)} empty={t('report.list.none')} />
          <List title={t('report.list.lookahead')} rows={d.lookahead_7d.map(i => `${i.date} · ${i.ref} · ${i.title}${i.system ? ` [${i.system}]` : ''}`)} empty={t('report.list.none')} />
          <p style={mini}>{t('report.dataNote')}</p>
        </aside>
      </div>
    </div>
  )
}

function List({ title, rows, empty }: { title: string; rows: string[]; empty: string }) {
  return (
    <div>
      <div style={{ ...label, marginBottom: 4 }}>{title} ({rows.length})</div>
      {rows.length === 0 ? <p style={mini}>{empty}</p> : (
        <ul style={{ margin: 0, paddingLeft: 16, ...small, fontSize: 'var(--text-xs)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {rows.slice(0, 12).map((r, i) => <li key={i}>{r}</li>)}
          {rows.length > 12 && <li>+{rows.length - 12}</li>}
        </ul>
      )}
    </div>
  )
}
