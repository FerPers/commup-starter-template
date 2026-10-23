'use client'

import Link from 'next/link'
import { useAskDialog } from '@/components/ui/AskDialog'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  deletePerformanceTest, newPerformanceRevision, savePerformanceRevision, startPerformanceRun, transitionPerformanceRevision, updatePerformanceTest,
  withdrawPerformanceTest,
} from '@/app/actions/performance'
import {
  DERIVED_OPS, OPERATORS, PERFORMANCE_SECTIONS, STATISTICS, TOTAL_BASES, UNCERTAINTY_MODES, VARIABLE_SOURCES, LIVE_RUN_STATUSES,
  checkContent, criterionText, emptyCriterion, emptyPair, emptyVariable, isPerformanceLead, normKey,
  CERT_TONE, RESULT_TONE, type CertificateStatus, type ContentDraft, type CriterionDraft, type PairDraft, type PerfResult, type PerfRunStatus, type RevisionStatus, type VariableDraft,
} from '@/lib/performance/catalog'
import { Alert, Chip, Field, SystemSelect, btn, card, grid, input, label, small } from '../../../daily/daily-ui'
import { REV_TONE, RUN_TONE } from '../PerformanceView'
import { useLocalTime } from '@/lib/use-local-time'
import { ROLE_TIERS } from '@/lib/constants/roles'

type Rev = {
  id: string; rev: number; status: RevisionStatus; changeReason: string | null; returnedReason: string | null
  createdBy: string | null; submittedBy: string | null; submittedAt: string | null; approvedBy: string | null; approvedAt: string | null; hash: string | null
  /** S14 (E-30): quienes editaron el borrador (no lo aprueban). */
  editors: string[]
}
type Run = {
  id: string; number: string; attempt: number; status: PerfRunStatus; rev: number | null; created_at: string
  stabilization_started_at: string | null; formal_started_at: string | null; closed_at: string | null; early_close: boolean; aborted_at: string | null; result: PerfResult | null
}
type Signal = { id: string; tag: string; unit: string | null; systemId: string | null }

const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', background: 'var(--gray-50)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-sm)', verticalAlign: 'top' }
const cell: React.CSSProperties = { ...input, padding: '6px 8px' }
const sectionTitle: React.CSSProperties = { fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }

export default function TestView({ project, test, revisions, shownId, liveCertificate, content, runs, systems, signals, procedures, names, userId, role }: {
  project: { id: string; code: string; name: string }
  test: { id: string; number: string; title: string; primarySystemId: string; currentRevisionId: string | null; createdBy: string | null; status: string; withdrawReason: string | null }
  revisions: Rev[]; shownId: string; content: ContentDraft; runs: Run[]
  liveCertificate: { id: string; number: string; status: CertificateStatus; run_id: string } | null
  systems: { id: string; code: string; name: string }[]; signals: Signal[]; procedures: { id: string; label: string }[]
  names: Record<string, string>; userId: string; role: string
}) {
  const t = useTranslations('Startup')
  // S25b (E-34): diálogos propios en vez de window.prompt / window.confirm.
  const { dialog, ask } = useAskDialog()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [draft, setDraft] = useState<ContentDraft>(content)
  const [reason, setReason] = useState(revisions.find(r => r.id === shownId)?.changeReason ?? '')
  const [editingHead, setEditingHead] = useState(false)
  const [head, setHead] = useState({ title: test.title, systemId: test.primarySystemId })

  const root = `/projects/${project.id}/startup/performance`
  const ids = { projectId: project.id, testId: test.id }
  const lead = isPerformanceLead(role)
  const shown = revisions.find(r => r.id === shownId)!
  const editable = lead && shown.status === 'draft'
  const openRev = revisions.find(r => r.status === 'draft' || r.status === 'in_review')
  const liveRun = runs.find(r => LIVE_RUN_STATUSES.includes(r.status))
  const who = (id: string | null) => (id ? names[id] : undefined) ?? '—'
  const localTime = useLocalTime()  // S10 (E-15b): hora local con su zona, no la UTC del servidor
  const when = (iso: string | null) => localTime(iso)
  const sysLabel = (id: string) => { const s = systems.find(x => x.id === id); return s ? `${s.code} — ${s.name}` : '—' }
  const frontier = new Set([test.primarySystemId, ...draft.system_ids])
  const keys = draft.variables.map(v => normKey(v.key)).filter(Boolean)
  const problem = editable ? checkContent(draft) : null
  const neverApproved = !revisions.some(r => r.approvedAt)

  function act(fn: () => Promise<{ error?: string; id?: string }>, after?: (res: { id?: string }) => void, ok?: string) {
    setError(null); setNotice(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) { setError(res.error); return }
      if (ok) setNotice(ok)
      after?.(res)
      router.refresh()
    })
  }
  const askText = async (title: string, label: string, fn: (text: string) => void) => {
    const v = await ask({ title, confirmLabel: title, input: { label, minLength: 3 } })
    if (v) fn(v)
  }

  const setVar = (i: number, patch: Partial<VariableDraft>) => setDraft(d => ({ ...d, variables: d.variables.map((v, j) => (j === i ? { ...v, ...patch } : v)) }))
  const setCrit = (i: number, patch: Partial<CriterionDraft>) => setDraft(d => ({ ...d, criteria: d.criteria.map((c, j) => (j === i ? { ...c, ...patch } : c)) }))
  const setPair = (i: number, patch: Partial<PairDraft>) => setDraft(d => ({ ...d, pairs: d.pairs.map((p, j) => (j === i ? { ...p, ...patch } : p)) }))
  const unitOf = (k: string) => {
    const v = draft.variables.find(x => normKey(x.key) === normKey(k))
    if (v?.unit) return v.unit
    return signals.find(s => s.id === v?.signal_id)?.unit ?? ''
  }
  const keySelect = (value: string, onChange: (v: string) => void, aria: string) => (
    <select aria-label={aria} style={cell} value={normKey(value)} disabled={!editable} onChange={e => onChange(e.target.value)}>
      <option value="">—</option>
      {keys.map(k => <option key={k} value={k}>{k}</option>)}
    </select>
  )
  const inFrontier = signals.filter(s => s.systemId && frontier.has(s.systemId))
  const others = signals.filter(s => !s.systemId || !frontier.has(s.systemId))

  return (
    <div style={{ padding: '24px 16px', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {dialog}
      <div>
        <Link href={root} style={{ ...small, textDecoration: 'none', color: 'var(--primary-700)' }}>← {t('tab.performance')} · {project.code}</Link>
        {editingHead ? (
          <div style={{ ...grid, marginTop: 8 }}>
            <Field text={t('field.title')} wide><input style={input} value={head.title} maxLength={200} onChange={e => setHead({ ...head, title: e.target.value })} /></Field>
            <Field text={t('perf.primarySystem')}>
              <SystemSelect value={head.systemId} onChange={v => setHead({ ...head, systemId: v })} systems={systems} disabled={runs.length > 0} />
            </Field>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <button type="button" style={btn('primary', isPending || !head.title.trim())} disabled={isPending || !head.title.trim()}
                onClick={() => act(() => updatePerformanceTest({ ...ids, title: head.title, systemId: head.systemId }), () => setEditingHead(false))}>{t('save')}</button>
              <button type="button" style={btn('outline')} onClick={() => setEditingHead(false)}>{t('perf.cancel')}</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, fontFamily: 'ui-monospace, monospace', color: 'var(--text-strong)' }}>{test.number}</h1>
              {test.currentRevisionId ? <Chip tone="green">{t('perf.approvedRev', { rev: revisions.find(r => r.id === test.currentRevisionId)?.rev ?? 0 })}</Chip> : <Chip tone="muted">{t('notApproved')}</Chip>}
              {liveCertificate && (
                <Link href={`${root}/runs/${liveCertificate.run_id}`} style={{ textDecoration: 'none' }}>
                  <Chip tone={CERT_TONE[liveCertificate.status]}>{liveCertificate.number} · {t(`perf.certStatus.${liveCertificate.status}`)}</Chip>
                </Link>
              )}
              {test.status === 'withdrawn' && <Chip tone="muted">{t('perf.withdrawn')}</Chip>}
              {lead && <button type="button" style={{ ...btn('outline'), padding: '3px 10px' }} onClick={() => setEditingHead(true)}>{t('perf.editHead')}</button>}
              {/* S11 (E-14): una prueba que ya no aplica se retira (deja de bloquear el gate), con motivo */}
              {lead && test.status !== 'withdrawn' && !liveRun && (
                <button type="button" style={{ ...btn('outline'), padding: '3px 10px', color: 'var(--danger-700)' }} disabled={isPending}
                  onClick={async () => {
                    const r = await ask({ title: t('perf.withdraw'), confirmLabel: t('perf.withdraw'), danger: true, input: { label: t('perf.withdrawPrompt') } })
                    if (r !== null) act(() => withdrawPerformanceTest({ ...ids, reason: r }))
                  }}>{t('perf.withdraw')}</button>
              )}
            </div>
            <p style={{ margin: '4px 0 0', color: 'var(--text-strong)', fontSize: 'var(--text-base)' }}>{test.title}</p>
            <p style={{ ...small, margin: '2px 0 0' }}>{t('perf.primarySystem')}: {sysLabel(test.primarySystemId)}</p>
            {test.status === 'withdrawn' && <p style={{ ...small, margin: '2px 0 0' }}>{t('perf.withdrawnNote', { reason: test.withdrawReason ?? '' })}</p>}
          </>
        )}
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="ok">{notice}</Alert>}

      {/* Revisiones */}
      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={label}>{t('perf.revisions')}</span>
          {revisions.map(r => (
            <Link key={r.id} href={`${root}/${test.id}?rev=${r.rev}`} style={{ textDecoration: 'none', outline: r.id === shownId ? '2px solid var(--primary-500)' : undefined, borderRadius: 999 }}>
              <Chip tone={REV_TONE[r.status]}>R{r.rev} · {t(`revStatus.${r.status}`)}</Chip>
            </Link>
          ))}
        </div>
        <div style={{ ...small, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span>{t('perf.authoredBy', { who: who(shown.createdBy) })}{shown.changeReason ? ` · ${shown.changeReason}` : ''}</span>
          {shown.submittedAt && <span suppressHydrationWarning>{t('perf.submittedBy', { who: who(shown.submittedBy), when: when(shown.submittedAt) })}</span>}
          {shown.approvedAt && <span suppressHydrationWarning>{t('perf.approvedBy', { who: who(shown.approvedBy), when: when(shown.approvedAt) })}</span>}
          {shown.hash && <span style={{ fontFamily: 'ui-monospace, monospace' }}>sha256 {shown.hash.slice(0, 16)}…</span>}
        </div>
        {shown.status === 'draft' && shown.returnedReason && <Alert kind="warn">{t('perf.returned', { reason: shown.returnedReason })}</Alert>}
        {lead && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {shown.status === 'draft' && (
              <>
                <button type="button" style={btn('primary', isPending || !!problem)} disabled={isPending || !!problem}
                  onClick={() => act(() => savePerformanceRevision({ ...ids, revisionId: shown.id, content: draft, changeReason: reason }), undefined, t('saved'))}>{t('save')}</button>
                <button type="button" style={btn('outline', isPending || !!problem || draft.criteria.length === 0)} disabled={isPending || !!problem || draft.criteria.length === 0}
                  onClick={() => act(async () => {
                    const saved = await savePerformanceRevision({ ...ids, revisionId: shown.id, content: draft, changeReason: reason })
                    if (saved.error) return saved
                    return transitionPerformanceRevision({ ...ids, revisionId: shown.id, to: 'in_review' })
                  })}>{t('perf.submit')}</button>
              </>
            )}
            {shown.status === 'in_review' && (
              <>
                {userId !== shown.createdBy && userId !== shown.submittedBy && !shown.editors.includes(userId)
                  ? <button type="button" style={btn('primary', isPending)} disabled={isPending} onClick={() => act(() => transitionPerformanceRevision({ ...ids, revisionId: shown.id, to: 'approved' }))}>✓ {t('perf.approve')}</button>
                  : <span style={{ ...small, color: 'var(--warning-700)', alignSelf: 'center' }}>{t('perf.approveOther')}</span>}
                <button type="button" style={btn('outline', isPending)} disabled={isPending}
                  onClick={() => void askText(t('perf.return'), t('perf.returnPrompt'), c => act(() => transitionPerformanceRevision({ ...ids, revisionId: shown.id, to: 'draft', comment: c })))}>{t('perf.return')}</button>
              </>
            )}
            {shown.status === 'approved' && !openRev && (
              <button type="button" style={btn('outline', isPending)} disabled={isPending}
                onClick={() => void askText(t('perf.newRev'), t('perf.newRevPrompt'), r => act(() => newPerformanceRevision({ ...ids, reason: r }), () => router.push(`${root}/${test.id}`)))}>+ {t('perf.newRev')}</button>
            )}
            {neverApproved && runs.length === 0 && (userId === test.createdBy || ROLE_TIERS.admin.includes(role)) && (
              <button type="button" style={{ ...btn('outline'), color: 'var(--danger-700)' }} disabled={isPending}
                onClick={async () => { if ((await ask({ title: t('perf.delete'), message: t('perf.deleteConfirm'), confirmLabel: t('perf.delete'), danger: true })) !== null) act(() => deletePerformanceTest(ids), () => router.push(root)) }}>{t('perf.delete')}</button>
            )}
          </div>
        )}
        {problem && <Alert kind="warn">{problem}</Alert>}
      </section>

      {/* Intentos */}
      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2 style={sectionTitle}>{t('perf.runs')}</h2>
          {lead && test.currentRevisionId && !liveRun && (
            <button type="button" style={btn('primary', isPending)} disabled={isPending}
              onClick={() => act(() => startPerformanceRun(ids), res => res.id && router.push(`${root}/runs/${res.id}`))}>▶ {t('perf.startRun')}</button>
          )}
        </div>
        {!test.currentRevisionId && <p style={{ ...small, margin: 0 }}>{t('perf.needApproved')}</p>}
        {runs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {runs.map(r => (
              <Link key={r.id} href={`${root}/runs/${r.id}`} style={{ display: 'flex', gap: 8, alignItems: 'center', textDecoration: 'none', color: 'inherit', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: 'var(--text-strong)' }}>{r.number}</span>
                <Chip tone={RUN_TONE[r.status]}>{t(`perf.runStatus.${r.status}`)}</Chip>
                <span style={small}>R{r.rev}</span>
                {r.early_close && <Chip tone="amber">{t('perf.earlyClose')}</Chip>}
                {r.result && <Chip tone={RESULT_TONE[r.result]}>{t(`perf.result.${r.result}`)}</Chip>}
                {r.rev !== null && test.currentRevisionId && r.rev !== revisions.find(x => x.id === test.currentRevisionId)?.rev && LIVE_RUN_STATUSES.includes(r.status) && <Chip tone="amber">{t('perf.outdated')}</Chip>}
                <span style={small} suppressHydrationWarning>{when(r.closed_at ?? r.formal_started_at ?? r.stabilization_started_at ?? r.created_at)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Ajustes y frontera */}
      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={sectionTitle}>{t('perf.settings')}</h2>
        <div style={grid}>
          {(['stabilization_min', 'formal_min', 'sample_interval_s', 'min_coverage_pct'] as const).map(k => (
            <Field key={k} text={t(`perf.setting.${k}`)}>
              <input type="number" min={0} style={input} disabled={!editable} value={draft.settings[k]}
                onChange={e => setDraft(d => ({ ...d, settings: { ...d.settings, [k]: e.target.value } }))} />
            </Field>
          ))}
          <Field text={t('perf.setting.procedure')}>
            <select style={input} disabled={!editable} value={draft.settings.procedure_id} onChange={e => setDraft(d => ({ ...d, settings: { ...d.settings, procedure_id: e.target.value } }))}>
              <option value="">—</option>
              {procedures.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
        </div>
        <div>
          <div style={{ ...label, marginBottom: 6 }}>{t('perf.frontier')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {systems.map(s => {
              const primary = s.id === test.primarySystemId
              const checked = primary || draft.system_ids.includes(s.id)
              if (!editable && !checked) return null
              return (
                <label key={s.id} style={{ ...small, display: 'inline-flex', gap: 4, alignItems: 'center', padding: '2px 8px', border: '1px solid var(--border)', borderRadius: 999, background: checked ? 'var(--primary-50)' : undefined }}>
                  <input type="checkbox" checked={checked} disabled={!editable || primary}
                    onChange={e => setDraft(d => ({ ...d, system_ids: e.target.checked ? [...d.system_ids, s.id] : d.system_ids.filter(x => x !== s.id) }))} />
                  {s.code}{primary ? ` · ${t('perf.primary')}` : ''}
                </label>
              )
            })}
          </div>
        </div>
        {editable && shown.rev > 0 && (
          <Field text={t('perf.changeReason')} wide><input style={input} value={reason} maxLength={2000} onChange={e => setReason(e.target.value)} /></Field>
        )}
      </section>

      {/* Variables */}
      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 style={sectionTitle}>{t('perf.variables')}</h2>
        <p style={{ ...small, margin: 0 }}>{t('perf.variablesHint')}</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead><tr>{['key', 'label', 'source', 'definition', 'unit', 'maxStep', ''].map(c => <th key={c} style={th}>{c ? t(`perf.var.${c}`) : ''}</th>)}</tr></thead>
            <tbody>
              {draft.variables.map((v, i) => (
                <tr key={i}>
                  <td style={{ ...td, width: 90 }}><input aria-label={t('perf.var.key')} style={{ ...cell, fontFamily: 'ui-monospace, monospace' }} disabled={!editable} value={v.key} maxLength={10} onChange={e => setVar(i, { key: e.target.value.toUpperCase() })} /></td>
                  <td style={td}><input aria-label={t('perf.var.label')} style={cell} disabled={!editable} value={v.label} maxLength={200} onChange={e => setVar(i, { label: e.target.value })} /></td>
                  <td style={{ ...td, width: 130 }}>
                    <select aria-label={t('perf.var.source')} style={cell} disabled={!editable} value={v.source} onChange={e => setVar(i, { source: e.target.value as VariableDraft['source'] })}>
                      {VARIABLE_SOURCES.map(s => <option key={s} value={s}>{t(`perf.source.${s}`)}</option>)}
                    </select>
                  </td>
                  <td style={{ ...td, minWidth: 220 }}>
                    {v.source === 'signal' && (
                      <select aria-label={t('perf.source.signal')} style={cell} disabled={!editable} value={v.signal_id ?? ''}
                        onChange={e => { const sig = signals.find(s => s.id === e.target.value); setVar(i, { signal_id: e.target.value === '' ? null : e.target.value, unit: v.unit !== '' ? v.unit : sig?.unit ?? '' }) }}>
                        <option value="">—</option>
                        <optgroup label={t('perf.signalsFrontier')}>{inFrontier.map(s => <option key={s.id} value={s.id}>{s.tag}{s.unit ? ` (${s.unit})` : ''}</option>)}</optgroup>
                        <optgroup label={t('perf.signalsOther')}>{others.map(s => <option key={s.id} value={s.id}>{s.tag}{s.unit ? ` (${s.unit})` : ''}</option>)}</optgroup>
                      </select>
                    )}
                    {v.source === 'derived' && (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {keySelect(v.operand_a, x => setVar(i, { operand_a: x }), 'A')}
                        <select aria-label="op" style={{ ...cell, width: 56 }} disabled={!editable} value={v.op} onChange={e => setVar(i, { op: e.target.value as VariableDraft['op'] })}>
                          {DERIVED_OPS.map(o => <option key={o} value={o}>{o === '*' ? '×' : o === '/' ? '÷' : o}</option>)}
                        </select>
                        {keySelect(v.operand_b, x => setVar(i, { operand_b: x }), 'B')}
                      </div>
                    )}
                    {v.source === 'manual' && (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <span style={{ ...small, whiteSpace: 'nowrap' }}>{t('perf.everyLabel')}</span>
                        <input aria-label={t('perf.everyLabel')} type="number" min={1} max={1440} style={{ ...cell, width: 80 }} disabled={!editable}
                          value={v.manual_every_min} onChange={e => setVar(i, { manual_every_min: e.target.value })} />
                        <span style={small}>min</span>
                      </div>
                    )}
                  </td>
                  <td style={{ ...td, width: 110 }}><input aria-label={t('perf.var.unit')} style={cell} disabled={!editable} value={v.unit} maxLength={40} onChange={e => setVar(i, { unit: e.target.value })} /></td>
                  <td style={{ ...td, width: 100 }}>{v.source !== 'derived' && <input aria-label={t('perf.var.maxStep')} type="number" style={cell} disabled={!editable} value={v.max_step} onChange={e => setVar(i, { max_step: e.target.value })} />}</td>
                  <td style={{ ...td, width: 36 }}>{editable && <button type="button" aria-label={t('perf.remove')} style={{ ...btn('outline'), padding: '4px 8px' }} onClick={() => setDraft(d => ({ ...d, variables: d.variables.filter((_, j) => j !== i) }))}>×</button>}</td>
                </tr>
              ))}
              {draft.variables.length === 0 && <tr><td colSpan={7} style={{ ...td, ...small, textAlign: 'center' }}>{t('perf.noVariables')}</td></tr>}
            </tbody>
          </table>
        </div>
        {editable && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {VARIABLE_SOURCES.map(s => <button key={s} type="button" style={btn('outline')} onClick={() => setDraft(d => ({ ...d, variables: [...d.variables, emptyVariable(s)] }))}>+ {t(`perf.source.${s}`)}</button>)}
          </div>
        )}
      </section>

      {/* Criterios */}
      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 style={sectionTitle}>{t('perf.criteria')}</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
            <thead><tr>{['variable', 'statistic', 'param', 'operator', 'target', 'uncertainty', 'reads', ''].map(c => <th key={c} style={th}>{c ? t(`perf.crit.${c}`) : ''}</th>)}</tr></thead>
            <tbody>
              {draft.criteria.map((c, i) => (
                <tr key={i}>
                  <td style={{ ...td, width: 100 }}>{keySelect(c.variable_key, x => setCrit(i, { variable_key: x }), t('perf.crit.variable'))}</td>
                  <td style={{ ...td, width: 150 }}>
                    <select aria-label={t('perf.crit.statistic')} style={cell} disabled={!editable} value={c.statistic} onChange={e => setCrit(i, { statistic: e.target.value as CriterionDraft['statistic'] })}>
                      {STATISTICS.map(s => <option key={s} value={s}>{t(`perf.stat.${s}`)}</option>)}
                    </select>
                  </td>
                  <td style={{ ...td, width: 170 }}>
                    {c.statistic === 'pct_in_band' && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input aria-label={t('perf.crit.bandLo')} placeholder={t('perf.crit.bandLo')} type="number" style={cell} disabled={!editable} value={c.band_lo} onChange={e => setCrit(i, { band_lo: e.target.value })} />
                        <input aria-label={t('perf.crit.bandHi')} placeholder={t('perf.crit.bandHi')} type="number" style={cell} disabled={!editable} value={c.band_hi} onChange={e => setCrit(i, { band_hi: e.target.value })} />
                      </div>
                    )}
                    {c.statistic === 'total' && (
                      <select aria-label={t('perf.crit.basis')} style={cell} disabled={!editable} value={c.total_basis} onChange={e => setCrit(i, { total_basis: e.target.value as CriterionDraft['total_basis'] })}>
                        {TOTAL_BASES.map(b => <option key={b} value={b}>{t(`perf.basis.${b}`)}</option>)}
                      </select>
                    )}
                  </td>
                  <td style={{ ...td, width: 110 }}>
                    <select aria-label={t('perf.crit.operator')} style={cell} disabled={!editable} value={c.operator} onChange={e => setCrit(i, { operator: e.target.value as CriterionDraft['operator'] })}>
                      {OPERATORS.map(o => <option key={o} value={o}>{t(`perf.op.${o}`)}</option>)}
                    </select>
                  </td>
                  <td style={{ ...td, width: 170 }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input aria-label={t('perf.crit.target')} type="number" style={cell} disabled={!editable} value={c.target} onChange={e => setCrit(i, { target: e.target.value })} />
                      {c.operator === 'between' && <input aria-label={t('perf.crit.targetHi')} type="number" style={cell} disabled={!editable} value={c.target_hi} onChange={e => setCrit(i, { target_hi: e.target.value })} />}
                    </div>
                  </td>
                  <td style={{ ...td, width: 150 }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input aria-label={t('perf.crit.uncertainty')} type="number" min={0} style={cell} disabled={!editable} value={c.uncertainty} onChange={e => setCrit(i, { uncertainty: e.target.value })} />
                      <select aria-label={t('perf.crit.uncertaintyMode')} style={{ ...cell, width: 64 }} disabled={!editable} value={c.uncertainty_mode} onChange={e => setCrit(i, { uncertainty_mode: e.target.value as CriterionDraft['uncertainty_mode'] })}>
                        {UNCERTAINTY_MODES.map(m => <option key={m} value={m}>{m === 'pct' ? '%' : t('perf.abs')}</option>)}
                      </select>
                    </div>
                  </td>
                  <td style={{ ...td, ...small, fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap' }}>{c.variable_key && c.target ? criterionText(c, unitOf(c.variable_key)) : '—'}</td>
                  <td style={{ ...td, width: 36 }}>{editable && <button type="button" aria-label={t('perf.remove')} style={{ ...btn('outline'), padding: '4px 8px' }} onClick={() => setDraft(d => ({ ...d, criteria: d.criteria.filter((_, j) => j !== i) }))}>×</button>}</td>
                </tr>
              ))}
              {draft.criteria.length === 0 && <tr><td colSpan={8} style={{ ...td, ...small, textAlign: 'center' }}>{t('perf.noCriteria')}</td></tr>}
            </tbody>
          </table>
        </div>
        {editable && <div><button type="button" style={btn('outline', keys.length === 0)} disabled={keys.length === 0} onClick={() => setDraft(d => ({ ...d, criteria: [...d.criteria, emptyCriterion(keys[0])] }))}>+ {t('perf.addCriterion')}</button></div>}
      </section>

      {/* Pares de medidores */}
      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 style={sectionTitle}>{t('perf.pairs')}</h2>
        <p style={{ ...small, margin: 0 }}>{t('perf.pairsHint')}</p>
        {draft.pairs.map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ width: 110 }}>{keySelect(p.variable_a, x => setPair(i, { variable_a: x }), 'A')}</div>
            <span style={small}>↔</span>
            <div style={{ width: 110 }}>{keySelect(p.variable_b, x => setPair(i, { variable_b: x }), 'B')}</div>
            <span style={small}>{t('perf.maxDiff')}</span>
            <input aria-label={t('perf.maxDiff')} type="number" style={{ ...cell, width: 90 }} disabled={!editable} value={p.max_diff_pct} onChange={e => setPair(i, { max_diff_pct: e.target.value })} />
            <span style={small}>%</span>
            {editable && <button type="button" aria-label={t('perf.remove')} style={{ ...btn('outline'), padding: '4px 8px' }} onClick={() => setDraft(d => ({ ...d, pairs: d.pairs.filter((_, j) => j !== i) }))}>×</button>}
          </div>
        ))}
        {draft.pairs.length === 0 && !editable && <span style={small}>—</span>}
        {editable && <div><button type="button" style={btn('outline', keys.length < 2)} disabled={keys.length < 2} onClick={() => setDraft(d => ({ ...d, pairs: [...d.pairs, emptyPair()] }))}>+ {t('perf.addPair')}</button></div>}
      </section>

      {/* Secciones */}
      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={sectionTitle}>{t('perf.definition')}</h2>
        {PERFORMANCE_SECTIONS.map(k => (editable || draft.sections[k]) && (
          <Field key={k} text={t(`perf.section.${k}`)} wide>
            {editable
              ? <textarea style={{ ...input, minHeight: 70, resize: 'vertical' }} placeholder={t(`perf.sectionHint.${k}`)} value={draft.sections[k] ?? ''} maxLength={20000}
                  onChange={e => setDraft(d => ({ ...d, sections: { ...d.sections, [k]: e.target.value } }))} />
              : <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{draft.sections[k]}</p>}
          </Field>
        ))}
      </section>
    </div>
  )
}
