'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { setProjectDisciplines } from '@/app/actions/projects'

export type ScopeRow = { id: string; code: string; name: string; color: string | null; included: boolean; requirements: number; itrs: number }
export type ScopeEvent = { id: string; action: 'add' | 'remove'; reason: string | null; itrs: number; discipline: string; who: string; at: string }

const MIN_REASON = 10

const card: React.CSSProperties = { background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12 }
const th: React.CSSProperties = { textAlign: 'left', padding: '8px', verticalAlign: 'bottom', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }
const td: React.CSSProperties = { padding: '0 8px', fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }
const num: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

/**
 * R1 (maquetas M): disciplinas en el alcance del proyecto. El impacto se calcula aquí con los números de
 * project_discipline_scope (requisitos de la matriz aceptada y ITR existentes por disciplina de plantilla); la RPC
 * vuelve a validar y exige el motivo si quedan ITR fuera.
 */
export default function ScopeView({ projectId, projectCode, rows, history, canEdit }: {
  projectId: string
  projectCode: string
  rows: ScopeRow[]
  history: ScopeEvent[]
  canEdit: boolean
}) {
  const t = useTranslations('ProjectScope')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const initial = useMemo(() => new Set(rows.filter(r => r.included).map(r => r.id)), [rows])
  const [picked, setPicked] = useState<Set<string>>(initial)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const removed = rows.filter(r => initial.has(r.id) && !picked.has(r.id))
  const added = rows.filter(r => !initial.has(r.id) && picked.has(r.id))
  const changed = removed.length + added.length > 0
  const itrsOut = removed.reduce((n, r) => n + r.itrs, 0)
  const reqOff = removed.reduce((n, r) => n + r.requirements, 0)
  const reqOn = added.reduce((n, r) => n + r.requirements, 0)
  const reqTotal = rows.filter(r => picked.has(r.id)).reduce((n, r) => n + r.requirements, 0)
  const needReason = itrsOut > 0
  const canSave = canEdit && changed && picked.size > 0 && (!needReason || reason.trim().length >= MIN_REASON) && !isPending

  function toggle(id: string) {
    setDone(null)
    setError(null)
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function reset() {
    setPicked(new Set(initial))
    setReason('')
    setError(null)
  }

  function save() {
    setError(null)
    startTransition(async () => {
      const res = await setProjectDisciplines(projectId, [...picked], needReason ? reason : null)
      if (res.error) {
        setError(['reason_required', 'scope_empty', 'discipline_not_in_org'].includes(res.error) ? t(`error.${res.error as 'reason_required'}`) : res.error)
        return
      }
      setReason('')
      setDone(t('saved', { added: res.result?.added ?? 0, removed: res.result?.removed ?? 0 }))
      router.refresh()
    })
  }

  return (
    <div style={{ padding: 'clamp(12px, 4vw, 32px)', maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: '-0.5px', margin: 0 }}>{t('title')}</h1>
        <p style={{ margin: '6px 0 0', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: 760 }}>
          {t.rich('intro', { strong: chunks => <strong style={{ color: 'var(--text-strong)' }}>{chunks}</strong>, project: projectCode })}
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <section style={{ ...card, flex: '999 1 520px', minWidth: 0, overflowX: 'auto' }} aria-labelledby="scope-list">
          <h2 id="scope-list" style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-strong)', margin: 0, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            {t('listTitle', { count: picked.size, total: rows.length })}
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 36 }}><span className="sr-only">{t('col.included')}</span></th>
                <th style={th}>{t('col.discipline')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{t('col.requirements')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{t('col.itrs')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const on = picked.has(r.id)
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)', opacity: on ? 1 : 0.65 }}>
                    <td style={{ ...td, height: 44 }}>
                      <input id={`d-${r.id}`} type="checkbox" checked={on} disabled={!canEdit || isPending} onChange={() => toggle(r.id)}
                        style={{ width: 20, height: 20, accentColor: 'var(--primary-600)', cursor: canEdit ? 'pointer' : 'default' }} />
                    </td>
                    <td style={td}>
                      <label htmlFor={`d-${r.id}`} style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px 8px', padding: '6px 0', cursor: canEdit ? 'pointer' : 'default' }}>
                        <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: r.color ?? 'var(--gray-400)', flexShrink: 0 }} />
                        {r.name} <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{r.code}</span>
                      </label>
                    </td>
                    <td style={num}>{r.requirements}</td>
                    <td style={num}>{r.itrs}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>

        <section style={{ ...card, flex: '1 1 300px', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} aria-live="polite" aria-labelledby="scope-impact">
          <h2 id="scope-impact" style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('impact.title')}</h2>
          {!changed ? (
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{done ?? t('impact.none')}</p>
          ) : (
            <>
              {removed.length > 0 && <Line label={t('impact.removed')} value={removed.map(r => r.name).join(', ')} />}
              {added.length > 0 && <Line label={t('impact.added')} value={added.map(r => r.name).join(', ')} />}
              {reqOff > 0 && <Line label={t('impact.reqOff')} value={`−${reqOff}`} />}
              {reqOn > 0 && <Line label={t('impact.reqOn')} value={`+${reqOn}`} />}
              <Line label={t('impact.reqTotal')} value={String(reqTotal)} />
              {removed.length > 0 && (
                <div style={{
                  padding: 12, borderRadius: 8, fontSize: 'var(--text-sm)', lineHeight: 1.45,
                  background: needReason ? 'var(--warning-50)' : 'var(--success-50)',
                  border: `1px solid ${needReason ? 'var(--warning-200)' : 'var(--success-200)'}`,
                  color: needReason ? 'var(--warning-900)' : 'var(--success-800)',
                }}>
                  <strong>{t('impact.itrsOut', { count: itrsOut })}</strong>
                  {needReason && <div>{t('impact.itrsKept')}</div>}
                </div>
              )}
              {needReason && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-strong)' }}>
                  {t('reason', { min: MIN_REASON })}
                  <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder={t('reasonPh')}
                    style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 'var(--text-sm)', fontWeight: 400, resize: 'vertical', background: 'var(--card-bg)', color: 'var(--text-strong)', fontFamily: 'inherit' }} />
                </label>
              )}
              {picked.size === 0 && <p role="alert" style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--danger-700)' }}>{t('error.scope_empty')}</p>}
            </>
          )}
          {error && <p role="alert" style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--danger-700)' }}>{error}</p>}
          {canEdit ? (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" onClick={reset} disabled={!changed || isPending}
                style={{ minHeight: 44, padding: '0 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card-bg)', color: 'var(--text-strong)', fontSize: 'var(--text-sm)', cursor: changed ? 'pointer' : 'default' }}>
                {t('undo')}
              </button>
              <button type="button" onClick={save} disabled={!canSave}
                style={{ minHeight: 44, padding: '0 16px', border: 0, borderRadius: 8, background: canSave ? 'var(--primary-600)' : 'var(--gray-300)', color: '#ffffff', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: canSave ? 'pointer' : 'not-allowed' }}>
                {isPending ? t('saving') : t('save')}
              </button>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{t('readOnly')}</p>
          )}
          <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
            {t('who')} <Link href={`/projects/${projectId}/itrs/generate`} style={{ color: 'var(--primary-600)' }}>{t('toGenerate')}</Link>
          </p>
        </section>
      </div>

      {history.length > 0 && (
        <section style={{ ...card, padding: 16 }} aria-labelledby="scope-history">
          <h2 id="scope-history" style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 10px' }}>{t('history.title')}</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map(h => (
              <li key={h.id} style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)', lineHeight: 1.45 }}>
                <strong>{t(`history.${h.action}`, { discipline: h.discipline })}</strong>
                {h.action === 'remove' && h.itrs > 0 && <span style={{ color: 'var(--text-muted)' }}> · {t('history.itrs', { count: h.itrs })}</span>}
                <span style={{ color: 'var(--text-muted)' }}> · {h.who ? `${h.who} · ` : ''}{h.at}</span>
                {h.reason && <div style={{ color: 'var(--text-muted)' }}>«{h.reason}»</div>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>
      <span>{label}</span><strong style={{ textAlign: 'right' }}>{value}</strong>
    </div>
  )
}
