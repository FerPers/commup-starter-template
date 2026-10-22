'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { addVendorFinding, createVendorRetest, recordVendorActivityResult, saveVendorActivity } from '@/app/actions/vendors'
import { ACTIVITY_KINDS, ACTIVITY_RESULTS, PUNCH_CATEGORIES, RESULT_TONE, resultNeedsFindings, type ActivityKind, type ActivityResult, type PunchCategory } from '@/lib/vendors/catalog'
import { useLocalToday } from '@/lib/use-local-today'
import { Alert, Chip, Evidence, Field, MemberSelect, btn, card, grid, input, linkStyle, small, type Member } from '../../daily/daily-ui'
import type { ActivityRow } from './PackageView'

// FAT / SAT del paquete (fase 8, sesión 2; §15.7). Hallazgo con tag → punch del proyecto (Cat A bloquea la
// desmovilización y los gates como cualquier punch); sin tag → acción ACC con origen «vendor».

export default function ActivitiesSection({ projectId, pkgId, pkgNumber, closed, activities, tags, members, names, userId, canEdit, canLead }: {
  projectId: string; pkgId: string; pkgNumber: string; closed: boolean; activities: ActivityRow[]
  tags: { id: string; tag_number: string }[]; members: Member[]; names: Record<string, string>; userId: string; canEdit: boolean; canLead: boolean
}) {
  const t = useTranslations('Vendors')
  const router = useRouter()
  const today = useLocalToday()
  const [isPending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<null | { kind: ActivityKind; title: string; plannedDate: string; location: string; notes: string }>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [finding, setFinding] = useState({ description: '', tagId: '', category: 'B' as PunchCategory, ownerId: userId, dueDate: '' })
  const [result, setResult] = useState<{ result: Exclude<ActivityResult, 'pending'>; performedOn: string; notes: string }>({ result: 'passed', performedOn: '', notes: '' })

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
    <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }} aria-labelledby="vnd-tests">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h2 id="vnd-tests" style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-strong)' }}>{t('tests.title')}</h2>
        {canEdit && !closed && !form && (
          <button type="button" style={btn('outline')} onClick={() => setForm({ kind: 'fat', title: '', plannedDate: '', location: '', notes: '' })}>+ {t('tests.new')}</button>
        )}
      </div>
      <p style={{ ...small, margin: 0 }}>{t('tests.help')}</p>
      {error && <Alert kind="error">{error}</Alert>}

      {form && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
          <div style={grid}>
            <Field text={t('tests.kind')} required>
              <select style={input} value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as ActivityKind })}>
                {ACTIVITY_KINDS.map(k => <option key={k} value={k}>{t(`tests.kinds.${k}`)}</option>)}
              </select>
            </Field>
            <Field text={t('f.title')} required><input style={input} value={form.title} maxLength={200} onChange={e => setForm({ ...form, title: e.target.value })} /></Field>
            <Field text={t('tests.planned')}><input type="date" style={input} value={form.plannedDate} onChange={e => setForm({ ...form, plannedDate: e.target.value })} /></Field>
            <Field text={t('tests.location')}><input style={input} value={form.location} maxLength={200} onChange={e => setForm({ ...form, location: e.target.value })} /></Field>
            <Field text={t('tests.notes')} wide><input style={input} value={form.notes} maxLength={4000} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={isPending || !form.title.trim()} style={btn('primary', isPending || !form.title.trim())}
              onClick={() => run(() => saveVendorActivity({ projectId, packageId: pkgId, ...form, plannedDate: form.plannedDate || null }), () => setForm(null))}>{t('save')}</button>
            <button type="button" style={btn('outline')} onClick={() => setForm(null)}>{t('cancel')}</button>
          </div>
        </div>
      )}

      {activities.length === 0 && <p style={{ ...small, margin: 0 }}>{t('tests.empty')}</p>}
      {activities.map(a => {
        const isOpen = open === a.id
        const pending = a.result === 'pending'
        // S13 (F-05): cadena de re-pruebas; la fallida con re-prueba ya no cuenta para el KPI.
        const retestOf = a.retest_of ? activities.find(x => x.id === a.retest_of) ?? null : null
        const retest = activities.find(x => x.retest_of === a.id) ?? null
        const canRetest = !retest && (a.result === 'failed' || a.result === 'passed_with_findings')
        return (
          <article key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Chip tone="muted">{t(`tests.kinds.${a.kind}`)}</Chip>
              <strong style={{ color: 'var(--text-strong)' }}>{a.title}</strong>
              <Chip tone={RESULT_TONE[a.result]}>{t(`tests.results.${a.result}`)}</Chip>
              {retestOf && <Chip tone="blue">{t('tests.retestOf', { title: retestOf.title })}</Chip>}
              {retest && <Chip tone="struck">{t('tests.supersededBy')}</Chip>}
              <span style={small}>{a.performed_on ?? (a.planned_date ? t('tests.plannedOn', { date: a.planned_date }) : '')}{a.location ? ` · ${a.location}` : ''}</span>
              <span style={{ flex: 1 }} />
              <span style={small}>{t('tests.findingsN', { n: a.findings.length })}</span>
              <button type="button" style={{ ...btn('outline'), padding: '3px 10px' }} aria-expanded={isOpen}
                onClick={() => { setOpen(isOpen ? null : a.id); setResult({ result: 'passed', performedOn: today ?? '', notes: '' }) }}>{isOpen ? t('hide') : t('open')}</button>
            </div>

            {isOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {a.notes && <p style={{ ...small, margin: 0, whiteSpace: 'pre-wrap' }}>{a.notes}</p>}
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {a.findings.map(fd => (
                    <li key={fd.id} style={{ fontSize: 'var(--text-sm)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      {fd.punches ? (
                        <>
                          <Chip tone={fd.category === 'A' ? 'red' : 'amber'}>{t('tests.punchChip', { cat: fd.category ?? '' })}</Chip>
                          <Link href={`/projects/${projectId}/punches/${fd.punches.id}`} style={{ ...linkStyle, fontWeight: 700 }}>{fd.punches.punch_number}</Link>
                          <span style={small}>{fd.tags?.tag_number ?? ''} · {fd.punches.status}</span>
                        </>
                      ) : fd.actions ? (
                        <>
                          <Chip tone="blue">{t('tests.actionChip')}</Chip>
                          <Link href={`/projects/${projectId}/daily/action/${fd.actions.id}`} style={{ ...linkStyle, fontWeight: 700 }}>{fd.actions.number}</Link>
                          <span style={small}>{fd.actions.status}</span>
                        </>
                      ) : null}
                      <span>{fd.description}</span>
                    </li>
                  ))}
                  {a.findings.length === 0 && <li style={small}>{t('tests.noFindings')}</li>}
                </ul>

                {pending && canEdit && !closed && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--gray-50)', borderRadius: 8, padding: 10 }}>
                    <div style={grid}>
                      <Field text={t('tests.finding')} required wide><input style={input} value={finding.description} maxLength={2000} onChange={e => setFinding({ ...finding, description: e.target.value })} /></Field>
                      <Field text={t('tests.tag')}>
                        <select style={input} value={finding.tagId} onChange={e => setFinding({ ...finding, tagId: e.target.value })}>
                          <option value="">{t('tests.noTag')}</option>
                          {tags.map(x => <option key={x.id} value={x.id}>{x.tag_number}</option>)}
                        </select>
                      </Field>
                      {finding.tagId ? (
                        <Field text={t('tests.category')} required>
                          <select style={input} value={finding.category} onChange={e => setFinding({ ...finding, category: e.target.value as PunchCategory })}>
                            {PUNCH_CATEGORIES.map(c => <option key={c} value={c}>{t(`tests.cat.${c}`)}</option>)}
                          </select>
                        </Field>
                      ) : (
                        <>
                          <Field text={t('tests.owner')}><MemberSelect value={finding.ownerId} onChange={v => setFinding({ ...finding, ownerId: v })} members={members} ariaLabel={t('tests.owner')} /></Field>
                          <Field text={t('tests.due')}><input type="date" style={input} value={finding.dueDate} onChange={e => setFinding({ ...finding, dueDate: e.target.value })} /></Field>
                        </>
                      )}
                    </div>
                    <span style={{ ...small, fontSize: 'var(--text-xs)' }}>{finding.tagId ? t('tests.becomesPunch', { pkg: pkgNumber }) : t('tests.becomesAction')}</span>
                    <div>
                      <button type="button" disabled={isPending || !finding.description.trim()} style={btn('primary', isPending || !finding.description.trim())}
                        onClick={() => run(() => addVendorFinding({
                          projectId, packageId: pkgId, activityId: a.id, description: finding.description, tagId: finding.tagId || null,
                          category: finding.tagId ? finding.category : null, ownerId: finding.tagId ? null : finding.ownerId, dueDate: finding.tagId ? null : finding.dueDate || null,
                        }), () => setFinding({ ...finding, description: '' }))}>{t('tests.addFinding')}</button>
                    </div>
                  </div>
                )}

                {pending && canLead && !closed && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <Field text={t('tests.result')}>
                      <select style={input} value={result.result} onChange={e => setResult({ ...result, result: e.target.value as Exclude<ActivityResult, 'pending'> })}>
                        {ACTIVITY_RESULTS.filter(r => r !== 'pending').map(r => <option key={r} value={r}>{t(`tests.results.${r}`)}</option>)}
                      </select>
                    </Field>
                    <Field text={t('tests.performed')}><input type="date" style={input} value={result.performedOn} max={today ?? undefined} onChange={e => setResult({ ...result, performedOn: e.target.value })} /></Field>
                    <button type="button" disabled={isPending || !result.performedOn || (resultNeedsFindings(result.result) && a.findings.length === 0)}
                      style={btn('primary', isPending || !result.performedOn)} title={resultNeedsFindings(result.result) && a.findings.length === 0 ? t('tests.needFindings') : undefined}
                      onClick={() => { if (window.confirm(t('tests.resultConfirm'))) run(() => recordVendorActivityResult({ projectId, packageId: pkgId, activityId: a.id, ...result })) }}>{t('tests.record')}</button>
                  </div>
                )}
                {canRetest && canEdit && !closed && (
                  <div>
                    <button type="button" disabled={isPending} style={btn('outline', isPending)}
                      onClick={() => run(() => createVendorRetest({ projectId, packageId: pkgId, activityId: a.id }), () => setOpen(null))}>{t('tests.retest')}</button>
                    <span style={{ ...small, fontSize: 'var(--text-xs)', marginLeft: 8 }}>{t('tests.retestHint')}</span>
                  </div>
                )}
                {!pending && a.result_by && <p style={{ ...small, margin: 0 }} suppressHydrationWarning>{t('tests.recordedBy', { who: names[a.result_by] ?? '—', when: a.result_at ? new Date(a.result_at).toLocaleString() : '' })}</p>}

                <Evidence projectId={projectId} kind="vendor_activity" entityId={a.id} attachments={a.attachments} names={names} canAdd={canEdit && !closed} />
              </div>
            )}
          </article>
        )
      })}
    </section>
  )
}
