'use client'

// Generar ITRs desde lazos (loop check) o desde causas C&E (prueba por causa) — fase 4-D, sesión 2.
// Se elige la plantilla (solo las activas con la tabla del origen correcto), el inspector y,
// las personas de los demás roles de firma que exija la plantilla (S04, D4: una distinta por rol).
// Las filas de la tabla las toma la BD al crear cada ITR.

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { generateCauseItrs, generateLoopItrs } from '@/app/actions/source-itrs'
import { assignmentError } from '@/lib/itr/signatures'

export type GenerationTemplate = { id: string; code: string; title: string; version: number; requiredSignatures: string[] }
export type GenerationMember = { user_id: string; name: string; role: string }

const field = { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card-bg)', color: 'var(--text-strong)', fontSize: '13px', boxSizing: 'border-box' } as const

export default function GenerateSourceItrsModal({ projectId, kind, items, templates, members, onClose }: {
  projectId: string
  kind: 'loop' | 'cause'
  /** Lazos o causas a generar (id + etiqueta para el resumen). */
  items: Array<{ id: string; label: string; revision?: boolean }>
  templates: GenerationTemplate[]
  members: GenerationMember[]
  onClose: () => void
}) {
  const router = useRouter()
  const tg = useTranslations('SourceItrs')
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const [inspectorId, setInspectorId] = useState('')
  const [supervisorId, setSupervisorId] = useState('')
  const [clientId, setClientId] = useState('')
  const required = templates.find(t => t.id === templateId)?.requiredSignatures ?? ['executor', 'supervisor']
  const needs = (role: string) => required.includes(role)
  const [error, setError] = useState('')
  const [report, setReport] = useState<{ created: number; errors: string[] } | null>(null)
  const [pending, start] = useTransition()
  const revisions = items.filter(i => i.revision).length

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const invalid = assignmentError(required, { executor: inspectorId, supervisor: needs('supervisor') ? supervisorId : null, client: needs('client') ? clientId : null })
    if (invalid) { setError(invalid); return }
    start(async () => {
      const input = { projectId, templateId, ids: items.map(i => i.id), inspectorId, supervisorId: needs('supervisor') ? supervisorId : null, clientId: needs('client') ? clientId : null }
      const res = kind === 'loop' ? await generateLoopItrs(input) : await generateCauseItrs(input)
      if (res.error) { setError(res.error); return }
      setReport({ created: res.created ?? 0, errors: res.errors ?? [] })
      router.refresh()
    })
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={tg(kind === 'loop' ? 'ariaLoop' : 'ariaCause')} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '16px' }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)', width: '100%', maxWidth: '520px', padding: '20px', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: '16px', margin: '0 0 6px', color: 'var(--text-strong)' }}>
          {tg(kind === 'loop' ? 'titleLoop' : 'titleCause', { n: items.length })}
        </h2>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px' }}>
          {items.slice(0, 8).map(i => i.label).join(', ')}{items.length > 8 ? tg('andMore', { n: items.length - 8 }) : ''}.
          {' '}{tg(kind === 'loop' ? 'rowsLoop' : 'rowsCause')}
          {revisions > 0 && <> {tg('revisions', { n: revisions })}</>}
        </p>

        {report ? (
          <>
            <p role="status" style={{ fontSize: '13px', color: '#047857', fontWeight: 600 }}>{tg('created', { n: report.created })}</p>
            {report.errors.length > 0 && (
              <ul style={{ fontSize: '12px', color: '#b45309', paddingLeft: '18px' }}>{report.errors.map(e => <li key={e}>{e}</li>)}</ul>
            )}
            <button type="button" onClick={onClose} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', fontSize: '13px' }}>{tg('close')}</button>
          </>
        ) : templates.length === 0 ? (
          <>
            <p role="alert" style={{ fontSize: '13px', color: '#b45309' }}>
              {tg(kind === 'loop' ? 'noTemplatesLoop' : 'noTemplatesCause')}
            </p>
            <button type="button" onClick={onClose} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', fontSize: '13px' }}>{tg('close')}</button>
          </>
        ) : (
          <form onSubmit={submit} style={{ display: 'grid', gap: '10px' }}>
            <label style={{ fontSize: '12px' }}>{tg('template')}
              <select required style={field} value={templateId} onChange={e => setTemplateId(e.target.value)}>
                {templates.map(t => <option key={t.id} value={t.id}>{t.code} v{t.version} · {t.title}</option>)}
              </select>
            </label>
            <label style={{ fontSize: '12px' }}>{tg('inspector')}
              <select required style={field} value={inspectorId} onChange={e => setInspectorId(e.target.value)}>
                <option value="">{tg('select')}</option>
                {members.map(m => <option key={m.user_id} value={m.user_id}>{m.name} ({m.role})</option>)}
              </select>
            </label>
            {needs('supervisor') && (
              <label style={{ fontSize: '12px' }}>{tg('supervisor')}
                <select required style={field} value={supervisorId} onChange={e => setSupervisorId(e.target.value)}>
                  <option value="">{tg('select')}</option>
                  {members.filter(m => m.user_id !== inspectorId).map(m => <option key={m.user_id} value={m.user_id}>{m.name} ({m.role})</option>)}
                </select>
              </label>
            )}
            {needs('client') && (
              <label style={{ fontSize: '12px' }}>{tg('client')}
                <select required style={field} value={clientId} onChange={e => setClientId(e.target.value)}>
                  <option value="">{tg('select')}</option>
                  {members.filter(m => m.user_id !== inspectorId && m.user_id !== supervisorId).map(m => <option key={m.user_id} value={m.user_id}>{m.name} ({m.role})</option>)}
                </select>
              </label>
            )}
            {error && <p role="alert" style={{ color: '#b91c1c', fontSize: '12px', margin: 0 }}>{error}</p>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" disabled={pending} style={{ padding: '9px 14px', borderRadius: '8px', border: 0, background: 'var(--primary-600, #2563eb)', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>{pending ? tg('generating') : tg('generate', { n: items.length })}</button>
              <button type="button" onClick={onClose} style={{ padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', fontSize: '13px' }}>{tg('cancel')}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
