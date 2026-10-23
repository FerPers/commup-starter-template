'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { previewItrGeneration, runItrGenerationBatch } from '@/app/actions/itr-generation'
import { cleanAssignment, disciplineKey, GENERATION_ROLES, type Assignment, type GenerationRole, type GenerationSummary } from '@/lib/itr/generation'

type Phase = { id: string; code: string; name: string; color: string | null }
type System = { id: string; code: string; name: string }
type Subsystem = { id: string; code: string; name: string; system_id: string }
type Member = { user_id: string; role: string; full_name: string }
type ScopeMode = 'project' | 'systems' | 'subsystems'

const card: React.CSSProperties = { background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px', marginBottom: 16 }
const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }
const sel: React.CSSProperties = { padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--card-bg)', minWidth: 170 }

/**
 * S19 (C-14, decisión de Luis 2026-10-20): alcance (proyecto / sistemas / subsistemas) × fases → vista previa
 * calculada en la BD (qué se crea, qué ya existe, qué falta en la matriz) → responsables por disciplina (vacío =
 * sin asignar) → generación por lotes de 300 hasta terminar (idempotente: repetir no duplica).
 */
export default function GenerateItrsView({ projectId, projectName, phases, systems, subsystems, members }: {
  projectId: string; projectName: string; phases: Phase[]; systems: System[]; subsystems: Subsystem[]; members: Member[]
}) {
  const t = useTranslations('ItrGenerate')
  const [phaseIds, setPhaseIds] = useState<string[]>([])
  const [mode, setMode] = useState<ScopeMode>('project')
  const [picked, setPicked] = useState<string[]>([])
  const [summary, setSummary] = useState<GenerationSummary | null>(null)
  const [assign, setAssign] = useState<Assignment>({})
  const [busy, setBusy] = useState<'preview' | 'run' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ created: number; total: number; done: boolean } | null>(null)

  const scope = useMemo(() => ({
    projectId, phaseIds,
    systemIds: mode === 'systems' ? picked : null,
    subsystemIds: mode === 'subsystems' ? picked : null,
  }), [projectId, phaseIds, mode, picked])

  // Cualquier cambio de alcance invalida la vista previa.
  const reset = () => { setSummary(null); setProgress(null); setError(null) }
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter(x => x !== id) : [...list, id])

  async function preview() {
    setBusy('preview'); setError(null); setProgress(null)
    const res = await previewItrGeneration(scope)
    setBusy(null)
    if (res.error || !res.summary) { setError(res.error ?? t('error')); return }
    setSummary(res.summary)
  }

  async function run() {
    if (!summary) return
    const clean = cleanAssignment(assign)
    if ('error' in clean) { setError(t('samePerson')); return }
    setBusy('run'); setError(null)
    let created = 0
    setProgress({ created: 0, total: summary.create, done: false })
    for (let guard = 0; guard < 400; guard++) {
      const res = await runItrGenerationBatch({ ...scope, assign: clean.assign })
      if (res.error) { setError(res.error); break }
      created += res.created ?? 0
      setProgress({ created, total: created + (res.remaining ?? 0), done: (res.remaining ?? 0) === 0 })
      if ((res.remaining ?? 0) === 0 || (res.created ?? 0) === 0) break
    }
    setBusy(null)
  }

  const scopeList = mode === 'systems' ? systems : mode === 'subsystems' ? subsystems : []
  const canPreview = phaseIds.length > 0 && (mode === 'project' || picked.length > 0) && busy === null
  const peopleFor = (role: GenerationRole) => (role === 'executor' ? members.filter(m => m.role !== 'client') : members)
  const setPerson = (disc: string, role: GenerationRole, userId: string) =>
    setAssign(prev => ({ ...prev, [disc]: { ...(prev[disc] ?? {}), [role]: userId } }))

  return (
    <div style={{ padding: 32, maxWidth: 1000 }}>
      <Link href={`/projects/${projectId}/itrs`} style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none' }}>← {projectName} · ITRs</Link>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-strong)', margin: '8px 0 4px' }}>{t('title')}</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', maxWidth: 720 }}>
        {t.rich('intro', { matrix: chunks => <Link href="/admin/templates/matrix" style={{ color: 'var(--primary-700)' }}>{chunks}</Link> })}
      </p>

      {/* 1 — Alcance */}
      <section style={card}>
        <p style={label}>{t('step1')}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {phases.map(p => (
            <label key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 999, cursor: 'pointer', background: phaseIds.includes(p.id) ? 'var(--primary-50)' : 'transparent' }}>
              <input type="checkbox" checked={phaseIds.includes(p.id)} onChange={() => { setPhaseIds(toggle(phaseIds, p.id)); reset() }} />
              <strong>{p.code}</strong> {p.name}
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: 13 }}>
          {(['project', 'systems', 'subsystems'] as ScopeMode[]).map(m => (
            <label key={m} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input type="radio" name="scope" checked={mode === m} onChange={() => { setMode(m); setPicked([]); reset() }} />
              {t(`scope.${m}`)}
            </label>
          ))}
        </div>
        {mode !== 'project' && (
          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 4 }}>
            {scopeList.map(s => (
              <label key={s.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={picked.includes(s.id)} onChange={() => { setPicked(toggle(picked, s.id)); reset() }} />
                <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>{s.code}</span>
                <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
              </label>
            ))}
          </div>
        )}
        <button type="button" onClick={() => { void preview() }} disabled={!canPreview}
          style={{ marginTop: 14, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--primary-500)', background: canPreview ? 'var(--primary-600)' : 'var(--gray-200)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: canPreview ? 'pointer' : 'not-allowed' }}>
          {busy === 'preview' ? t('previewing') : t('preview')}
        </button>
      </section>

      {error && <div role="alert" style={{ ...card, background: 'var(--danger-50)', borderColor: 'var(--danger-200)', color: 'var(--danger-800)', fontSize: 13 }}>{error}</div>}

      {summary && (
        <>
          {/* 2 — Vista previa */}
          <section style={card}>
            <p style={label}>{t('step2')}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
              <Stat n={summary.create} label={t('stat.create')} tone="var(--success-700)" />
              <Stat n={summary.exists} label={t('stat.exists')} />
              <Stat n={summary.tags} label={t('stat.tags')} />
              <Stat n={summary.no_equipment_type} label={t('stat.noType')} tone={summary.no_equipment_type ? 'var(--warning-700)' : undefined} />
              <Stat n={summary.no_rule} label={t('stat.noRule')} tone={summary.no_rule ? 'var(--warning-700)' : undefined} />
              <Stat n={summary.no_subsystem} label={t('stat.noSubsystem')} tone={summary.no_subsystem ? 'var(--danger-700)' : undefined} />
              {summary.out_of_scope > 0 && <Stat n={summary.out_of_scope} label={t('stat.outOfScope')} />}
            </div>
            {(['no_equipment_type', 'no_rule', 'no_subsystem'] as const).map(k => summary.samples[k].length > 0 && (
              <p key={k} style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0' }}>
                <strong>{t(`sample.${k}`)}</strong> {summary.samples[k].join(', ')}{summary.samples[k].length >= 20 ? '…' : ''}
              </p>
            ))}
            {summary.samples.out_of_scope.length > 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0' }}>
                <strong>{t('sample.out_of_scope')}</strong> {summary.samples.out_of_scope.join(', ')}{summary.samples.out_of_scope.length >= 20 ? '…' : ''}{' '}
                <Link href={`/projects/${projectId}/scope`} style={{ color: 'var(--primary-700)', fontWeight: 600 }}>{t('scopeLink')}</Link>
              </p>
            )}
            {summary.by_template.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 10 }}>
                <thead><tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}><th style={{ padding: 6 }}>{t('col.template')}</th><th style={{ padding: 6 }}>{t('col.create')}</th><th style={{ padding: 6 }}>{t('col.exists')}</th></tr></thead>
                <tbody>
                  {summary.by_template.filter(tp => tp.create + tp.exists > 0).map(tp => (
                    <tr key={tp.code} style={{ borderTop: '1px solid var(--gray-100)' }}>
                      <td style={{ padding: 6 }}><strong style={{ fontFamily: 'ui-monospace, monospace' }}>{tp.code}</strong> {tp.title}</td>
                      <td style={{ padding: 6, fontWeight: 600 }}>{tp.create}</td>
                      <td style={{ padding: 6, color: 'var(--text-muted)' }}>{tp.exists}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* 3 — Responsables por disciplina */}
          {summary.create > 0 && (
            <section style={card}>
              <p style={label}>{t('step3')}</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px' }}>{t('assignHint')}</p>
              {summary.by_discipline.map(d => {
                const key = disciplineKey(d.discipline_id)
                const roles = (d.roles ?? []).filter((r): r is GenerationRole => GENERATION_ROLES.includes(r))
                return (
                  <div key={key} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--gray-100)' }}>
                    <div style={{ minWidth: 180, fontSize: 13 }}>
                      <strong>{d.code ?? t('noDiscipline')}</strong> {d.name ?? ''}
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('itrCount', { n: d.create })}</div>
                    </div>
                    {roles.map(role => (
                      <select key={role} value={assign[key]?.[role] ?? ''} onChange={e => setPerson(key, role, e.target.value)} style={sel} aria-label={t(`role.${role}`)}>
                        <option value="">{t(`role.${role}`)} — {t('unassigned')}</option>
                        {peopleFor(role).map(m => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
                      </select>
                    ))}
                  </div>
                )
              })}
              <button type="button" onClick={() => { void run() }} disabled={busy !== null || !!progress?.done}
                style={{ marginTop: 14, padding: '9px 18px', borderRadius: 8, border: '1px solid var(--success-700)', background: 'var(--solid-success-700)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                {busy === 'run' ? t('running') : t('run', { n: summary.create })}
              </button>
              {progress && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ height: 8, background: 'var(--gray-100)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${progress.total ? Math.round((progress.created / progress.total) * 100) : 100}%`, height: '100%', background: 'var(--solid-success-700)' }} />
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                    {progress.done ? t('done', { n: progress.created }) : t('progress', { created: progress.created, total: progress.total })}
                    {progress.done && <> · <Link href={`/projects/${projectId}/itrs?assignee=none`} style={{ color: 'var(--primary-700)' }}>{t('seeUnassigned')}</Link> · <Link href={`/projects/${projectId}/itrs`} style={{ color: 'var(--primary-700)' }}>{t('seeAll')}</Link></>}
                  </p>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: tone ?? 'var(--text-strong)' }}>{n}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  )
}
