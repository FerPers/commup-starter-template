'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { setTagItrOverride } from '@/app/actions/itr-requirements'
import { runItrGenerationBatch } from '@/app/actions/itr-generation'
import { buildChain, isRequired, type ReqChip } from '@/lib/itr/requirements'
import { REQ_CHIP_STYLE } from '@/lib/itr/requirements-style'

export type TagReq = ReqChip & { discipline: string }
export type ScopeTemplate = { code: string; title: string }

const MIN_REASON = 10

/**
 * R2a (maquetas M): «ITR requeridos» arriba de la pestaña ITR del tag. Cadena A → B → C por disciplina con aviso del
 * eslabón que falta; Líder en adelante genera lo que falta, excluye con motivo, agrega un código del alcance o quita
 * una excepción. El resto lo ve en solo lectura.
 */
export default function TagRequirementsPanel({ projectId, tagId, reqs, aiProposals = [], phaseCodes, phaseIds, scopeTemplates, canEdit, hasSubsystem }: {
  projectId: string
  tagId: string
  reqs: TagReq[]
  /** R4: ajustes de la IA por decidir para la firma de este tag. */
  aiProposals?: { code: string; action: 'add' | 'exclude' }[]
  /** Códigos de fase de la org en orden (A, B, C, SU…): columnas de la cadena. */
  phaseCodes: string[]
  /** Ids de todas las fases (la generación del tag cubre todas). */
  phaseIds: string[]
  /** Plantillas activas dentro del alcance de disciplinas (para «Agregar código»). */
  scopeTemplates: ScopeTemplate[]
  canEdit: boolean
  hasSubsystem: boolean
}) {
  const t = useTranslations('TagRequirements')
  const ts = useTranslations('ItrRequirements')
  const ta = useTranslations('ItrAiAdjust')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [excluding, setExcluding] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [adding, setAdding] = useState(false)
  const [addCode, setAddCode] = useState('')

  const required = reqs.filter(r => isRequired(r.state))
  const missing = required.filter(r => r.state === 'missing').length
  const approved = required.filter(r => r.state === 'approved').length
  const generated = required.length - missing - approved
  const usedPhases = phaseCodes.filter(p => reqs.some(r => r.phase === p))
  const chain = buildChain(reqs, usedPhases, r => (r as TagReq).discipline)
  const taken = new Set(reqs.filter(r => r.state !== 'outside').map(r => r.code))
  const addable = scopeTemplates.filter(x => !taken.has(x.code))

  const fail = (e: string) => setError(['reason_required', 'out_of_scope', 'template_not_found', 'invalid_override'].includes(e) ? t(`error.${e as 'reason_required'}`) : e)

  function override(code: string, action: 'add' | 'exclude' | 'clear', why?: string) {
    setError(null)
    startTransition(async () => {
      const res = await setTagItrOverride({ projectId, tagId, code, action, reason: why ?? null })
      if (res.error) return fail(res.error)
      setExcluding(null)
      setReason('')
      setAdding(false)
      setAddCode('')
      router.refresh()
    })
  }

  function generate() {
    setError(null)
    startTransition(async () => {
      for (let i = 0; i < 20; i++) {
        const res = await runItrGenerationBatch({ projectId, phaseIds, tagIds: [tagId], assign: {} })
        if (res.error) return fail(res.error)
        if (!res.remaining) break
      }
      router.refresh()
    })
  }

  return (
    <section aria-labelledby="tag-req-title" style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <h2 id="tag-req-title" style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-strong)' }}>{t('title')}</h2>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{t('counts', { required: required.length, approved, generated, missing })}</span>
        <span style={{ flex: 1 }} />
        {canEdit && addable.length > 0 && (
          <button type="button" onClick={() => setAdding(a => !a)} disabled={isPending} style={btn('outline')}>{t('add')}</button>
        )}
        {canEdit && missing > 0 && hasSubsystem && (
          <button type="button" onClick={generate} disabled={isPending} style={btn('primary')}>{isPending ? t('working') : t('generate', { count: missing })}</button>
        )}
      </div>

      {adding && (
        <form onSubmit={e => { e.preventDefault(); if (addCode) override(addCode, 'add') }}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--gray-50)' }}>
          <label htmlFor="req-add" style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-strong)' }}>{t('addLabel')}</label>
          <select id="req-add" value={addCode} onChange={e => setAddCode(e.target.value)} style={{ minHeight: 36, minWidth: 260, border: '1px solid var(--border)', borderRadius: 8, padding: '0 8px', background: 'var(--card-bg)', color: 'var(--text-strong)' }}>
            <option value="">{t('addPick')}</option>
            {addable.map(x => <option key={x.code} value={x.code}>{x.code} — {x.title}</option>)}
          </select>
          <button type="submit" disabled={!addCode || isPending} style={btn('primary')}>{t('addConfirm')}</button>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{t('addHint')}</span>
        </form>
      )}

      {aiProposals.length > 0 && (
        <div role="status" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--violet-50)', fontSize: 'var(--text-sm)', color: 'var(--violet-800)' }}>
          <span>✦ {ta('tagBox')}</span>
          {aiProposals.map(p => (
            <span key={`${p.action}${p.code}`} style={{ padding: '1px 7px', borderRadius: 5, fontSize: 12, fontWeight: 600, fontFamily: 'ui-monospace, monospace', background: 'var(--card-bg)', border: '1px solid var(--violet-200)' }}>
              {p.action === 'add' ? '+' : '−'}{p.code}
            </span>
          ))}
          <Link href={`/projects/${projectId}/itrs/requirements/ai?filter=open`} style={{ marginLeft: 'auto', fontWeight: 600, color: 'var(--violet-800)' }}>{ta('tagBoxLink')}</Link>
        </div>
      )}

      {error && <p role="alert" style={{ margin: 0, padding: '8px 16px', color: 'var(--danger-700)', fontSize: 'var(--text-sm)' }}>{error}</p>}

      {reqs.length === 0 ? (
        <p style={{ margin: 0, padding: '14px 16px', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{t('none')}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `150px repeat(${Math.max(usedPhases.length, 1)}, minmax(190px, 1fr))`, minWidth: 150 + 190 * Math.max(usedPhases.length, 1) }}>
            <div style={head} />
            {usedPhases.map(p => <div key={p} style={head}>{t('phase', { phase: p })}</div>)}
            {chain.map(row => (
              <div key={row.discipline} style={{ display: 'contents' }}>
                <div style={{ ...cell, fontWeight: 600, color: 'var(--text-strong)' }}>
                  {row.discipline}
                  {row.gaps.length > 0 && <div style={{ marginTop: 4, fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--warning-800)' }}>{t('gap', { phases: row.gaps.join(', ') })}</div>}
                </div>
                {row.columns.map(col => (
                  <div key={col.phase} style={{ ...cell, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {col.chips.map(c => (
                      <div key={c.code} style={{ ...REQ_CHIP_STYLE[c.state], borderRadius: 8, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {c.itr_id
                            ? <Link href={`/projects/${projectId}/tags/${tagId}/itrs/${c.itr_id}`} style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: 'inherit' }}>{c.code}</Link>
                            : <strong style={{ fontFamily: 'ui-monospace, monospace' }}>{c.code}</strong>}
                          <span style={{ fontSize: 12, marginLeft: 'auto' }}>{ts(`state.${c.state}`)}</span>
                        </div>
                        {c.title && <span style={{ fontSize: 12, textDecoration: 'none', opacity: 0.9 }}>{c.title}</span>}
                        {c.client_code && <span style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace', opacity: 0.9 }}>{ts('clientCode', { code: c.client_code })}</span>}
                        {(c.origin === 'manual' || c.origin === 'ai' || c.reason) && (
                          <span style={{ fontSize: 12, opacity: 0.85 }}>{[c.origin && c.origin !== 'matrix' ? ts(`origin.${c.origin}`) : null, c.reason].filter(Boolean).join(' · ')}</span>
                        )}
                        {canEdit && c.state !== 'outside' && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {c.state === 'excluded' && <button type="button" onClick={() => override(c.code, 'clear')} disabled={isPending} style={mini}>{t('restore')}</button>}
                            {c.state !== 'excluded' && c.origin === 'manual' && !c.itr_id && <button type="button" onClick={() => override(c.code, 'clear')} disabled={isPending} style={mini}>{t('remove')}</button>}
                            {c.state !== 'excluded' && c.origin !== 'manual' && <button type="button" onClick={() => { setExcluding(c.code); setReason('') }} disabled={isPending} style={mini}>{t('exclude')}</button>}
                          </div>
                        )}
                        {excluding === c.code && (
                          <form onSubmit={e => { e.preventDefault(); override(c.code, 'exclude', reason) }} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4, textDecoration: 'none' }}>
                            <label htmlFor={`ex-${c.code}`} style={{ fontSize: 12, fontWeight: 600 }}>{t('reason', { min: MIN_REASON })}</label>
                            <input id={`ex-${c.code}`} value={reason} onChange={e => setReason(e.target.value)} autoFocus
                              style={{ minHeight: 32, border: '1px solid var(--border)', borderRadius: 6, padding: '0 8px', background: 'var(--card-bg)', color: 'var(--text-strong)', fontSize: 12 }} />
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button type="submit" disabled={reason.trim().length < MIN_REASON || isPending} style={mini}>{t('excludeConfirm')}</button>
                              <button type="button" onClick={() => setExcluding(null)} style={mini}>{t('cancel')}</button>
                            </div>
                          </form>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

const head: React.CSSProperties = { padding: '8px 12px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }
const cell: React.CSSProperties = { padding: '10px 12px', fontSize: 'var(--text-sm)', borderBottom: '1px solid var(--border)' }
const mini: React.CSSProperties = { minHeight: 28, padding: '0 8px', borderRadius: 6, border: '1px solid currentColor', background: 'transparent', color: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'none' }

function btn(kind: 'primary' | 'outline'): React.CSSProperties {
  return {
    minHeight: 40, padding: '0 14px', borderRadius: 8, fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer',
    ...(kind === 'primary'
      ? { background: 'var(--primary-600)', color: '#ffffff', border: '1px solid var(--primary-600)' }
      : { background: 'var(--card-bg)', color: 'var(--text-strong)', border: '1px solid var(--border)' }),
  }
}
