'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { createPunchOrQueue } from '@/lib/sync/outbox'
import { DialogSurface } from '@/components/ui'
import { PunchImpactAndGuide } from '@/components/punch/PunchCategoryGuide'
import type { PunchImpact } from '@/lib/punches/category-guide'
import { ink } from '@/lib/theme'

// S06 (C-22): el punch desde el ITR lleva el ítem de origen, responsable opcional y las fotos del defecto.
// Todo viaja junto (id generado aquí): sin red queda en la bandeja y se registra entero al reconectar.

type DraftPhoto = { key: string; file: File; preview: string }

export default function CreatePunchModal({
  itrId,
  itrItemId,
  itemLabel,
  assignees = [],
  projectId,
  tagId,
  disciplineCode,
  initialDescription,
  onClose,
  onCreated,
}: {
  itrId: string
  itrItemId: string | null
  /** Número y texto del ítem de origen, para mostrarlo. */
  itemLabel?: string | null
  /** Personas a las que se puede asignar (vacío = sin selector). */
  assignees?: Array<{ user_id: string; full_name: string }>
  projectId: string
  tagId: string
  disciplineCode: string | null
  initialDescription: string
  onClose: () => void
  /** `queued` = sin red: el punch quedó en la bandeja de salida y se registrará al reconectar. */
  onCreated: (result: { queued: boolean }) => void
}) {
  const t = useTranslations('ItrExecution')
  const tGuide = useTranslations('PunchGuide')
  const titleId = useId()
  const CATEGORY_CONFIG = {
    A: { label: t('punchModal.catA'), color: 'var(--danger-700)', bg: 'var(--danger-100)', border: 'var(--danger-200)' },
    B: { label: t('punchModal.catB'), color: 'var(--warning-700)', bg: 'var(--warning-50)', border: 'var(--warning-200)' },
    C: { label: t('punchModal.catC'), color: 'var(--text-muted)', bg: 'var(--gray-50)', border: 'var(--border)' },
  } as const

  const [description, setDescription] = useState(initialDescription)
  const [category, setCategory] = useState<'A' | 'B' | 'C'>('B')
  const [impact, setImpact] = useState<PunchImpact | null>(null)
  const [targetDate, setTargetDate] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [photos, setPhotos] = useState<DraftPhoto[]>([])
  const photoInput = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Un id por modal: si el envío se corta a la mitad, el reintento no duplica el punch.
  const [punchId] = useState(() => crypto.randomUUID())
  // Las vistas previas se liberan al cerrar el modal (y al quitar cada foto), no en cada cambio.
  const photosRef = useRef<DraftPhoto[]>([])
  useEffect(() => { photosRef.current = photos }, [photos])
  useEffect(() => () => photosRef.current.forEach(p => URL.revokeObjectURL(p.preview)), [])

  function addPhotos(files: FileList | null) {
    // Copiar ya: el FileList es «vivo» y se vacía al limpiar el input, antes de que corra el updater.
    const picked = Array.from(files ?? [])
    if (!picked.length) return
    const added = picked.map(file => ({ key: `${file.name}-${file.size}-${Math.random()}`, file, preview: URL.createObjectURL(file) }))
    setPhotos(prev => [...prev, ...added])
  }

  function handleSubmit() {
    if (!description.trim()) { setError(t('punchModal.errorRequired')); return }
    if (!impact) { setError(tGuide('impactRequired')); return }
    setError(null)
    startTransition(async () => {
      // Sprint O: sin red el punch se encola en IndexedDB y se crea al reconectar.
      const res = await createPunchOrQueue({
        projectId,
        tagId,
        itrId,
        category,
        impact,
        description: description.trim(),
        targetDate: targetDate || null,
        punchId,
        itrItemId,
        assignedTo: assignedTo || null,
        photos: photos.map(p => ({ fileName: p.file.name, fileType: p.file.type || 'image/jpeg', blob: p.file })),
      })
      if ('error' in res) { setError(res.error); return }
      onCreated({ queued: res.queued })
    })
  }

  return (
    <div
      role="presentation"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <DialogSurface onClose={onClose} labelledBy={titleId} style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 id={titleId} style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px' }}>{t('punchModal.title')}</h2>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: itemLabel ? '0 0 6px' : '0 0 20px' }}>{t('punchModal.subtitle')}</p>
        {itemLabel && <p style={{ fontSize: '12px', color: 'var(--text-body)', margin: '0 0 20px', fontWeight: 600 }}>{t('punchModal.fromItem', { item: itemLabel })}</p>}

        {/* Category */}
        <div role="group" aria-labelledby={`${titleId}-cat`} style={{ marginBottom: '16px' }}>
          <span id={`${titleId}-cat`} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-body)', display: 'block', marginBottom: '8px' }}>{t('punchModal.labelCategory')}</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['A', 'B', 'C'] as const).map(cat => {
              const cfg = CATEGORY_CONFIG[cat]
              const active = category === cat
              return (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  aria-pressed={active}
                  style={{ flex: 1, padding: '10px 8px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, border: `2px solid ${active ? cfg.color : 'var(--border)'}`, background: active ? cfg.bg : 'var(--card-bg)', color: ink(active ? cfg.color : 'var(--text-muted)'), cursor: 'pointer', textAlign: 'center' }}
                >
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Impacto obligatorio + guía de categorización (fase 4) */}
        <div style={{ marginBottom: '16px' }}>
          <PunchImpactAndGuide impact={impact} onImpact={setImpact} category={category} onCategory={setCategory} disciplineCode={disciplineCode} />
        </div>

        {/* Description */}
        <div style={{ marginBottom: '16px' }}>
          <label htmlFor={`${titleId}-desc`} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-body)', display: 'block', marginBottom: '6px' }}>{t('punchModal.labelDescription')}</label>
          <textarea
            id={`${titleId}-desc`}
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={t('punchModal.descPlaceholder')}
            style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>

        {/* Fotos del defecto (S06, C-22) */}
        <div role="group" aria-labelledby={`${titleId}-photos`} style={{ marginBottom: '16px' }}>
          <span id={`${titleId}-photos`} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-body)', display: 'block', marginBottom: '6px' }}>{t('punchModal.labelPhotos')}</span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {photos.map(p => (
              <div key={p.key} style={{ position: 'relative', width: '64px', height: '64px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--gray-50)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob URL) */}
                <img src={p.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button type="button" aria-label={t('punchModal.removePhoto')} onClick={() => { URL.revokeObjectURL(p.preview); setPhotos(prev => prev.filter(x => x.key !== p.key)) }}
                  style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '12px', lineHeight: '20px', cursor: 'pointer', padding: 0 }}>×</button>
              </div>
            ))}
            <button type="button" onClick={() => photoInput.current?.click()}
              style={{ padding: '8px 12px', background: 'var(--success-50)', border: '1px solid var(--success-200)', borderRadius: '8px', fontSize: '12px', color: 'var(--success-700)', fontWeight: 600, cursor: 'pointer' }}>
              {t('punchModal.addPhoto')}
            </button>
            <input ref={photoInput} type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }}
              onChange={e => { addPhotos(e.target.files); e.target.value = '' }} />
          </div>
          {photos.length > 0 && <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '6px 0 0' }}>{t('punchModal.photosOffline')}</p>}
        </div>

        {/* Responsable opcional (S06, C-22) */}
        {assignees.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <label htmlFor={`${titleId}-assignee`} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-body)', display: 'block', marginBottom: '6px' }}>{t('punchModal.labelAssignee')}</label>
            <select id={`${titleId}-assignee`} value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '13px', background: 'var(--card-bg)', color: 'var(--text-strong)' }}>
              <option value="">{t('punchModal.assigneeNone')}</option>
              {assignees.map(a => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}
            </select>
          </div>
        )}

        {/* Target date */}
        <div style={{ marginBottom: '20px' }}>
          <label htmlFor={`${titleId}-date`} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-body)', display: 'block', marginBottom: '6px' }}>{t('punchModal.labelTargetDate')}</label>
          <input
            id={`${titleId}-date`}
            type="date"
            value={targetDate}
            onChange={e => setTargetDate(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '13px' }}
          />
        </div>

        {error && (
          <p style={{ fontSize: '12px', color: 'var(--danger-700)', padding: '8px 12px', background: 'var(--danger-100)', borderRadius: '6px', margin: '0 0 16px' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '9px 16px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            {t('punchModal.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            style={{ padding: '9px 20px', background: isPending ? 'var(--orange-200)' : 'var(--orange-600)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: isPending ? 'default' : 'pointer' }}
          >
            {isPending ? t('punchModal.registering') : t('punchModal.register')}
          </button>
        </div>
      </DialogSurface>
    </div>
  )
}
