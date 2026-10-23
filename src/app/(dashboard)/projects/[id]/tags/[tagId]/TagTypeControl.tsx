'use client'

// R3: tipo de equipo del tag, arriba de «ITR requeridos». Propietario, Administrador y Arquitecto lo cambian con vista
// previa (tag_type_change_preview: gana X, quedan fuera Y); si deja ITR fuera de requisitos pide un motivo ≥ 10. Los
// ITR nunca se borran. El resto lo ve en solo lectura.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { assignEquipmentType, previewTagTypeChange } from '@/app/actions/tag-types'
import { TYPE_CHANGE_REASON_MIN, codeList, needsReason, type TagTypePreview } from '@/lib/tags/type-change'

export type TypeOption = { id: string; code: string; name: string }

const btn: React.CSSProperties = { minHeight: 36, padding: '0 14px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }

export default function TagTypeControl({ projectId, tagId, current, types, canEdit }: {
  projectId: string
  tagId: string
  current: TypeOption | null
  types: TypeOption[]
  canEdit: boolean
}) {
  const t = useTranslations('TagTypes')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState('')
  const [preview, setPreview] = useState<TagTypePreview | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const typeId = target === '__none' ? null : target
  const choose = (v: string) => {
    setTarget(v); setPreview(null); setError(null)
    if (!v) return
    startTransition(async () => {
      const res = await previewTagTypeChange({ projectId, tagIds: [tagId], typeId: v === '__none' ? null : v })
      if (res.error) { setError(res.error); return }
      setPreview(res.preview ?? null)
    })
  }
  const needs = !!preview && needsReason(preview)
  const ok = !!preview && preview.changed > 0 && (!needs || reason.trim().length >= TYPE_CHANGE_REASON_MIN)

  const confirm = () => startTransition(async () => {
    setError(null)
    const res = await assignEquipmentType({ projectId, tagIds: [tagId], typeId, reason: reason.trim() || null, source: 'manual' })
    if (res.error) { setError(res.error === 'reason_required' ? t('error.reason_required') : res.error); return }
    setOpen(false); setTarget(''); setPreview(null); setReason('')
    router.refresh()
  })

  return (
    <div style={{ marginBottom: 14, padding: '12px 16px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card-bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{t('tag.label')}</span>
        {current
          ? <strong style={{ fontSize: 14, color: 'var(--text-strong)' }}><span style={{ fontFamily: 'ui-monospace, monospace' }}>{current.code}</span> · {current.name}</strong>
          : <strong style={{ fontSize: 14, color: 'var(--warning-800)' }}>{t('tag.none')}</strong>}
        {!current && <Link href={`/projects/${projectId}/itrs/requirements/untyped`} style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary-700)' }}>{t('tag.groups')}</Link>}
        <span style={{ flex: 1 }} />
        {canEdit && (
          <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}
            style={{ ...btn, background: 'var(--card-bg)', color: 'var(--text-strong)', border: '1px solid var(--border)' }}>
            {open ? t('tag.close') : t('tag.change')}
          </button>
        )}
      </div>

      {open && canEdit && (
        <div style={{ marginTop: 12 }}>
          <label htmlFor={`tag-type-${tagId}`} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-strong)', display: 'block', marginBottom: 6 }}>{t('tag.target')}</label>
          <select id={`tag-type-${tagId}`} value={target} onChange={e => choose(e.target.value)} disabled={isPending}
            style={{ width: '100%', maxWidth: 420, minHeight: 36, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, background: 'var(--card-bg)', color: 'var(--text-strong)', fontFamily: 'inherit' }}>
            <option value="">{t('pick.placeholder')}</option>
            {types.filter(x => x.id !== current?.id).map(x => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
            {current && <option value="__none">{t('tag.removeType')}</option>}
          </select>

          {preview && (
            <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--text-strong)', lineHeight: 1.7 }}>
              <li>{t('preview.gain', { count: preview.gain })}{preview.gain_codes.length > 0 && <span style={{ color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace' }}> · {codeList(preview.gain_codes, 6)}</span>}</li>
              {preview.dropped > 0 && <li>{t('preview.dropped', { count: preview.dropped })}</li>}
              {preview.outside > 0 && <li style={{ color: 'var(--warning-800)' }}>{t('preview.outside', { count: preview.outside, signed: preview.outside_signed })} · {codeList(preview.outside_codes, 6)}</li>}
              {typeId && preview.type_rules === 0 && <li style={{ color: 'var(--warning-800)' }}>{t('preview.noRules')}</li>}
            </ul>
          )}

          {needs && (
            <div style={{ marginTop: 10 }}>
              <label htmlFor={`tag-type-reason-${tagId}`} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-strong)', display: 'block', marginBottom: 6 }}>
                {t('reason.label', { count: preview!.outside, codes: codeList(preview!.outside_codes) })}
              </label>
              <textarea id={`tag-type-reason-${tagId}`} rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder={t('reason.placeholder')}
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }} />
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>{t('reason.hint')}</p>
            </div>
          )}

          {preview && (
            <button type="button" disabled={!ok || isPending} onClick={confirm}
              style={{ ...btn, marginTop: 12, border: 'none', background: ok && !isPending ? 'var(--primary-600)' : 'var(--gray-100)', color: ok && !isPending ? '#ffffff' : 'var(--text-muted)', cursor: ok && !isPending ? 'pointer' : 'not-allowed' }}>
              {isPending ? t('tag.saving') : t('tag.confirm')}
            </button>
          )}
        </div>
      )}
      {error && <p role="alert" style={{ fontSize: 12, color: 'var(--danger-700)', margin: '10px 0 0' }}>{error}</p>}
    </div>
  )
}
