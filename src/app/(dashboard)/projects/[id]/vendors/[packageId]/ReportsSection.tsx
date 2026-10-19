'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { addVendorReport, decideVendorRecommendation, implementVendorRecommendation, proposeVendorRecommendation } from '@/app/actions/vendors'
import { RECOMMENDATION_TONE, canImplement, type PackageStatus, type ReportKind } from '@/lib/vendors/catalog'
import { useLocalToday } from '@/lib/use-local-today'
import { Alert, Chip, Evidence, Field, btn, card, grid, input, small } from '../../daily/daily-ui'
import type { RecommendationRow, ReportRow } from './PackageView'

// Reportes del vendor (estructurados e inmutables; el final es único y requisito de la desmovilización, §15.11)
// y recomendaciones (aprobar/rechazar = líder+; «requiere MOC» no se implementa sin número de MOC, §15.10).

export default function ReportsSection({ projectId, pkgId, status, reports, recommendations, names, canEdit, canLead }: {
  projectId: string; pkgId: string; status: PackageStatus; reports: ReportRow[]; recommendations: RecommendationRow[]
  names: Record<string, string>; canEdit: boolean; canLead: boolean
}) {
  const t = useTranslations('Vendors')
  const router = useRouter()
  const today = useLocalToday()
  const [isPending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [rep, setRep] = useState<null | { kind: ReportKind; reportDate: string; headcount: string; hours: string; activities: string; issues: string }>(null)
  const [openRep, setOpenRep] = useState<string | null>(null)
  const [rec, setRec] = useState<null | { description: string; rationale: string; requiresMoc: boolean }>(null)
  const [decide, setDecide] = useState<Record<string, { reason: string; moc: string; note: string }>>({})
  const who = (uid: string | null) => (uid ? names[uid] : undefined) ?? '—'
  const hasFinal = reports.some(r => r.kind === 'final')
  const closed = status === 'demobilized' || status === 'cancelled'
  const d = (id: string) => decide[id] ?? { reason: '', moc: '', note: '' }

  function run(fn: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null)
    start(async () => {
      const res = await fn()
      if (res.error) { setError(res.error); return }
      after?.()
      router.refresh()
    })
  }

  return (
    <>
      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }} aria-labelledby="vnd-reports">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2 id="vnd-reports" style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-strong)' }}>{t('reports.title')}</h2>
          {canEdit && status === 'mobilized' && !rep && (
            <button type="button" style={btn('outline')} onClick={() => setRep({ kind: 'daily', reportDate: today ?? '', headcount: '', hours: '', activities: '', issues: '' })}>+ {t('reports.new')}</button>
          )}
        </div>
        <p style={{ ...small, margin: 0 }}>{status === 'planned' ? t('reports.notMobilized') : t('reports.help')}</p>
        {error && <Alert kind="error">{error}</Alert>}
        {rep && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
            <div style={grid}>
              <Field text={t('reports.kind')} required>
                <select style={input} value={rep.kind} onChange={e => setRep({ ...rep, kind: e.target.value as ReportKind })}>
                  <option value="daily">{t('reports.kinds.daily')}</option>
                  {!hasFinal && <option value="final">{t('reports.kinds.final')}</option>}
                </select>
              </Field>
              <Field text={t('reports.date')} required><input type="date" style={input} value={rep.reportDate} max={today ?? undefined} onChange={e => setRep({ ...rep, reportDate: e.target.value })} /></Field>
              <Field text={t('reports.headcount')}><input type="number" min={0} style={input} value={rep.headcount} onChange={e => setRep({ ...rep, headcount: e.target.value })} /></Field>
              <Field text={t('reports.hours')}><input type="number" min={0} step="0.5" style={input} value={rep.hours} onChange={e => setRep({ ...rep, hours: e.target.value })} /></Field>
              <Field text={t('reports.activities')} required wide><textarea rows={3} style={input} value={rep.activities} maxLength={8000} onChange={e => setRep({ ...rep, activities: e.target.value })} /></Field>
              <Field text={t('reports.issues')} wide><textarea rows={2} style={input} value={rep.issues} maxLength={8000} onChange={e => setRep({ ...rep, issues: e.target.value })} /></Field>
            </div>
            {rep.kind === 'final' && <Alert kind="warn">{t('reports.finalWarn')}</Alert>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" disabled={isPending || !rep.activities.trim() || !rep.reportDate} style={btn('primary', isPending)}
                onClick={() => { if (rep.kind !== 'final' || window.confirm(t('reports.finalConfirm'))) run(() => addVendorReport({
                  projectId, packageId: pkgId, kind: rep.kind, reportDate: rep.reportDate, activities: rep.activities, issues: rep.issues,
                  headcount: rep.headcount === '' ? null : Number(rep.headcount), hours: rep.hours === '' ? null : Number(rep.hours),
                }), () => setRep(null)) }}>{t('reports.save')}</button>
              <button type="button" style={btn('outline')} onClick={() => setRep(null)}>{t('cancel')}</button>
            </div>
          </div>
        )}
        {reports.length === 0 ? <p style={{ ...small, margin: 0 }}>{t('reports.empty')}</p> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {reports.map(r => (
              <li key={r.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 'var(--text-sm)' }}>
                  <Chip tone={r.kind === 'final' ? 'green' : 'muted'}>{t(`reports.kinds.${r.kind}`)}</Chip>
                  <strong>{r.report_date}</strong>
                  <span style={small}>{t('reports.summary', { people: r.headcount ?? '—', hours: r.hours ?? '—' })} · {who(r.issued_by)}</span>
                  <span style={{ flex: 1 }} />
                  <button type="button" style={{ ...btn('outline'), padding: '3px 10px' }} aria-expanded={openRep === r.id} onClick={() => setOpenRep(openRep === r.id ? null : r.id)}>{openRep === r.id ? t('hide') : t('open')}</button>
                </div>
                {openRep === r.id && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 'var(--text-sm)' }}>{r.activities}</p>
                    {r.issues && <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 'var(--text-sm)' }}><strong>{t('reports.issues')}:</strong> {r.issues}</p>}
                    <Evidence projectId={projectId} kind="vendor_report" entityId={r.id} attachments={r.attachments} names={names} canAdd={canEdit && !closed} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }} aria-labelledby="vnd-recs">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2 id="vnd-recs" style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-strong)' }}>{t('recs.title')}</h2>
          {canEdit && !closed && !rec && <button type="button" style={btn('outline')} onClick={() => setRec({ description: '', rationale: '', requiresMoc: false })}>+ {t('recs.new')}</button>}
        </div>
        <p style={{ ...small, margin: 0 }}>{t('recs.help')}</p>
        {rec && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
            <Field text={t('recs.description')} required><textarea rows={2} style={input} value={rec.description} maxLength={4000} onChange={e => setRec({ ...rec, description: e.target.value })} /></Field>
            <Field text={t('recs.rationale')}><textarea rows={2} style={input} value={rec.rationale} maxLength={4000} onChange={e => setRec({ ...rec, rationale: e.target.value })} /></Field>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--text-sm)' }}>
              <input type="checkbox" checked={rec.requiresMoc} onChange={e => setRec({ ...rec, requiresMoc: e.target.checked })} /> {t('recs.requiresMoc')}
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" disabled={isPending || !rec.description.trim()} style={btn('primary', isPending)}
                onClick={() => run(() => proposeVendorRecommendation({ projectId, packageId: pkgId, ...rec }), () => setRec(null))}>{t('recs.propose')}</button>
              <button type="button" style={btn('outline')} onClick={() => setRec(null)}>{t('cancel')}</button>
            </div>
          </div>
        )}
        {recommendations.length === 0 ? <p style={{ ...small, margin: 0 }}>{t('recs.empty')}</p> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recommendations.map(r => (
              <li key={r.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--text-sm)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong>R{r.seq}</strong>
                  <Chip tone={RECOMMENDATION_TONE[r.status]}>{t(`recs.status.${r.status}`)}</Chip>
                  {r.requires_moc && <Chip tone="amber">{r.moc_reference ? t('recs.mocRef', { moc: r.moc_reference }) : t('recs.mocChip')}</Chip>}
                  <span>{r.description}</span>
                </div>
                {r.rationale && <span style={small}>{r.rationale}</span>}
                {r.decided_by && <span style={{ ...small, fontSize: 'var(--text-xs)' }}>{t('recs.decidedBy', { who: who(r.decided_by) })}{r.decision_reason ? ` — “${r.decision_reason}”` : ''}</span>}
                {r.implemented_by && <span style={{ ...small, fontSize: 'var(--text-xs)' }}>{t('recs.implementedBy', { who: who(r.implemented_by) })}{r.implementation_note ? ` — “${r.implementation_note}”` : ''}</span>}
                {r.status === 'proposed' && canLead && !closed && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input style={{ ...input, flex: 1, minWidth: 200 }} value={d(r.id).reason} maxLength={2000} placeholder={t('recs.reason')} aria-label={t('recs.reason')}
                      onChange={e => setDecide({ ...decide, [r.id]: { ...d(r.id), reason: e.target.value } })} />
                    <button type="button" disabled={isPending} style={btn('primary', isPending)}
                      onClick={() => run(() => decideVendorRecommendation({ projectId, packageId: pkgId, id: r.id, decision: 'approved', reason: d(r.id).reason }))}>{t('recs.approve')}</button>
                    <button type="button" disabled={isPending || d(r.id).reason.trim().length < 3} style={btn('danger', isPending || d(r.id).reason.trim().length < 3)}
                      onClick={() => run(() => decideVendorRecommendation({ projectId, packageId: pkgId, id: r.id, decision: 'rejected', reason: d(r.id).reason }))}>{t('recs.reject')}</button>
                  </div>
                )}
                {r.status === 'approved' && canEdit && !closed && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {r.requires_moc && (
                      <input style={{ ...input, width: 180 }} value={d(r.id).moc} maxLength={80} placeholder={t('recs.mocPh')} aria-label={t('recs.mocPh')}
                        onChange={e => setDecide({ ...decide, [r.id]: { ...d(r.id), moc: e.target.value } })} />
                    )}
                    <input style={{ ...input, flex: 1, minWidth: 200 }} value={d(r.id).note} maxLength={2000} placeholder={t('recs.note')} aria-label={t('recs.note')}
                      onChange={e => setDecide({ ...decide, [r.id]: { ...d(r.id), note: e.target.value } })} />
                    <button type="button" disabled={isPending || !canImplement(r, d(r.id).moc)} style={btn('primary', isPending || !canImplement(r, d(r.id).moc))}
                      onClick={() => run(() => implementVendorRecommendation({ projectId, packageId: pkgId, id: r.id, mocReference: d(r.id).moc, note: d(r.id).note }))}>{t('recs.implement')}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
