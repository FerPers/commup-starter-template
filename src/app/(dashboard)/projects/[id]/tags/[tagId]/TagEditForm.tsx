'use client'

import type { Enums } from '@/types/supabase.generated'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { updateTag, deleteTag } from '@/app/actions/tags'
import { INST_DISCIPLINES, SIGNAL_TYPES, SIL_LEVELS, cardStyle, inputStyle, sectionLabel, type Tag } from './tag-detail-shared'

export default function TagEditForm({ tag, projectId, onCancel, canDelete }: {
  tag: Tag
  projectId: string
  onCancel: () => void
  canDelete: boolean
}) {
  const t = useTranslations('Tags')
  const isInst = INST_DISCIPLINES.includes(tag.disciplines.code)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Form state
  const [form, setForm] = useState({
    description:           tag.description ?? '',
    manufacturer:          tag.manufacturer ?? '',
    model:                 tag.model ?? '',
    serial_number:         tag.serial_number ?? '',
    status:                tag.status,
    preservation_required: tag.preservation_required,
    pid_drawing:           tag.pid_drawing ?? '',
    // Engineering
    range_min:    tag.range_min  != null ? String(tag.range_min)  : '',
    range_max:    tag.range_max  != null ? String(tag.range_max)  : '',
    eng_unit:     tag.eng_unit   ?? '',
    sp_hh:        tag.sp_hh     != null ? String(tag.sp_hh)     : '',
    sp_h:         tag.sp_h      != null ? String(tag.sp_h)      : '',
    sp_l:         tag.sp_l      != null ? String(tag.sp_l)      : '',
    sp_ll:        tag.sp_ll     != null ? String(tag.sp_ll)     : '',
    signal_type:      tag.signal_type      ?? '',
    sil_level:        tag.sil_level        ?? 'None',
    io_address:       tag.io_address       ?? '',
    junction_box:     tag.junction_box     ?? '',
    datasheet_number: tag.datasheet_number ?? '',
    revision:         tag.revision         ?? '',
    fluid_type:       tag.fluid_type       ?? '',
    mounting_typical: tag.mounting_typical ?? '',
  })

  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))

  const toNum = (s: string) => s.trim() === '' ? null : parseFloat(s)

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteTag(projectId, tag.id)
      if (res.error) {
        setError(res.error)
        setShowDeleteConfirm(false)
        return
      }
      router.replace(`/projects/${projectId}/tags`)
      router.refresh()
    })
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const res = await updateTag(projectId, tag.id, {
        description:           form.description.trim() || tag.description,
        manufacturer:          form.manufacturer.trim() || null,
        model:                 form.model.trim() || null,
        serial_number:         form.serial_number.trim() || null,
        status:                form.status,
        preservation_required: form.preservation_required,
        pid_drawing:           form.pid_drawing.trim() || null,
        range_min:    toNum(form.range_min),
        range_max:    toNum(form.range_max),
        eng_unit:     form.eng_unit.trim() || null,
        sp_hh:        toNum(form.sp_hh),
        sp_h:         toNum(form.sp_h),
        sp_l:         toNum(form.sp_l),
        sp_ll:        toNum(form.sp_ll),
        signal_type:      form.signal_type || null,
        sil_level:        form.sil_level || 'None',
        io_address:       form.io_address.trim() || null,
        junction_box:     form.junction_box.trim() || null,
        datasheet_number: form.datasheet_number.trim() || null,
        revision:         form.revision.trim() || null,
        fluid_type:       form.fluid_type.trim() || null,
        mounting_typical: form.mounting_typical.trim() || null,
      })
      if (res.error) {
        setError(res.error)
      } else {
        onCancel()
        window.location.reload()
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {error && (
        <div style={{
          padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: '8px', fontSize: '13px', color: '#dc2626',
        }}>
          {error}
        </div>
      )}

      {/* Basic info */}
      <div style={cardStyle}>
        <p style={sectionLabel}>{t('edit.sectionBasic')}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '12px' }}>

          <FormField label={t('edit.fieldDescription')} style={{ gridColumn: '1 / -1' }}>
            <input style={inputStyle} value={form.description} onChange={e => set('description', e.target.value)} />
          </FormField>

          <FormField label={t('edit.fieldManufacturer')}>
            <input style={inputStyle} value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)} />
          </FormField>

          <FormField label={t('edit.fieldModel')}>
            <input style={inputStyle} value={form.model} onChange={e => set('model', e.target.value)} />
          </FormField>

          <FormField label={t('edit.fieldSerial')}>
            <input style={inputStyle} value={form.serial_number} onChange={e => set('serial_number', e.target.value)} />
          </FormField>

          <FormField label={t('edit.fieldPidNumber')}>
            <input style={inputStyle} placeholder="Ej: P-1001" value={form.pid_drawing} onChange={e => set('pid_drawing', e.target.value)} />
          </FormField>

          <FormField label={t('edit.fieldStatus')}>
            <select style={inputStyle} value={form.status} onChange={e => set('status', e.target.value as Enums<'tag_status'>)}>
              <option value="not_started">{t('status.not_started')}</option>
              <option value="in_progress">{t('status.in_progress')}</option>
              <option value="completed">{t('status.completed')}</option>
              <option value="on_hold">{t('status.on_hold')}</option>
            </select>
          </FormField>

          <FormField label={t('edit.fieldPreservation')}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '34px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.preservation_required}
                onChange={e => set('preservation_required', e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: '#3b82f6' }}
              />
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{t('edit.preservationCheck')}</span>
            </label>
          </FormField>

        </div>
      </div>

      {/* Engineering parameters */}
      <div style={cardStyle}>
        <p style={sectionLabel}>{t('edit.sectionEngineering')}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginTop: '12px' }}>

          <FormField label={t('edit.fieldRangeMin')}>
            <input style={inputStyle} type="number" placeholder="0" value={form.range_min} onChange={e => set('range_min', e.target.value)} />
          </FormField>

          <FormField label={t('edit.fieldRangeMax')}>
            <input style={inputStyle} type="number" placeholder="100" value={form.range_max} onChange={e => set('range_max', e.target.value)} />
          </FormField>

          <FormField label={t('edit.fieldEngUnit')}>
            <input style={inputStyle} placeholder="Ej: mmH2O, bar, °C, kV" value={form.eng_unit} onChange={e => set('eng_unit', e.target.value)} />
          </FormField>

          {!isInst && (
            <FormField label={t('edit.fieldFluidType')}>
              <input style={inputStyle} placeholder="Ej: Gas Natural, Crudo, Agua Producida" value={form.fluid_type} onChange={e => set('fluid_type', e.target.value)} />
            </FormField>
          )}

          <FormField label={t('edit.fieldDatasheet')}>
            <input style={inputStyle} placeholder="Ej: DS-P-762802A" value={form.datasheet_number} onChange={e => set('datasheet_number', e.target.value)} />
          </FormField>

          <FormField label={t('edit.fieldRevision')}>
            <input style={inputStyle} placeholder="Ej: Rev. C" value={form.revision} onChange={e => set('revision', e.target.value)} />
          </FormField>

        </div>

        {/* Instrument-only fields */}
        {isInst && (
          <>
            <div style={{ margin: '20px 0 14px', paddingTop: '16px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {t('edit.sectionInstrumentation')}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--gray-300)' }}>{t('edit.instrSubtitle')}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>

              <FormField label={t('edit.fieldSpHH')}>
                <input style={inputStyle} type="number" placeholder="—" value={form.sp_hh} onChange={e => set('sp_hh', e.target.value)} />
              </FormField>

              <FormField label={t('edit.fieldSpH')}>
                <input style={inputStyle} type="number" placeholder="—" value={form.sp_h} onChange={e => set('sp_h', e.target.value)} />
              </FormField>

              <FormField label={t('edit.fieldSpL')}>
                <input style={inputStyle} type="number" placeholder="—" value={form.sp_l} onChange={e => set('sp_l', e.target.value)} />
              </FormField>

              <FormField label={t('edit.fieldSpLL')}>
                <input style={inputStyle} type="number" placeholder="—" value={form.sp_ll} onChange={e => set('sp_ll', e.target.value)} />
              </FormField>

              <FormField label={t('edit.fieldSignalType')}>
                <select style={inputStyle} value={form.signal_type} onChange={e => set('signal_type', e.target.value)}>
                  <option value="">{t('edit.signalUndefined')}</option>
                  {SIGNAL_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>

              <FormField label={t('edit.fieldSilLevel')}>
                <select style={inputStyle} value={form.sil_level} onChange={e => set('sil_level', e.target.value)}>
                  {SIL_LEVELS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>

              <FormField label={t('edit.fieldIoAddress')}>
                <input style={inputStyle} placeholder="Ej: AI-100" value={form.io_address} onChange={e => set('io_address', e.target.value)} />
              </FormField>

              <FormField label={t('edit.fieldJunctionBox')}>
                <input style={inputStyle} placeholder="Ej: JB-101A" value={form.junction_box} onChange={e => set('junction_box', e.target.value)} />
              </FormField>

              <FormField label={t('edit.fieldMounting')}>
                <input style={inputStyle} placeholder="Ej: TYP-INST-001" value={form.mounting_typical} onChange={e => set('mounting_typical', e.target.value)} />
              </FormField>

            </div>
          </>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          disabled={isPending}
          style={{
            padding: '9px 20px', background: 'var(--card-bg)', border: '1px solid var(--border)',
            borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer',
          }}
        >
          {t('edit.cancel')}
        </button>
        <button
          onClick={handleSave}
          disabled={isPending}
          style={{
            padding: '9px 20px', background: isPending ? '#93c5fd' : '#3b82f6', border: 'none',
            borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#fff',
            cursor: isPending ? 'not-allowed' : 'pointer',
          }}
        >
          {isPending ? t('edit.saving') : t('edit.save')}
        </button>
      </div>

      {/* Danger zone */}
      {canDelete && (
        <div style={{ borderTop: '1px solid #fee2e2', paddingTop: '16px', marginTop: '4px' }}>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                width: '100%', padding: '8px 12px', background: 'var(--card-bg)',
                border: '1px solid #fecaca', borderRadius: '7px',
                fontSize: '12px', color: '#dc2626', cursor: 'pointer', textAlign: 'left',
              }}
            >
              {t('edit.deleteBtn')}
            </button>
          ) : (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px' }}>
              <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#991b1b', fontWeight: 500 }}>
                {t('edit.deleteConfirmMsg', { tagNumber: tag.tag_number })}
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleDelete}
                  disabled={isPending}
                  style={{
                    padding: '7px 14px', background: '#dc2626', color: '#fff',
                    border: 'none', borderRadius: '6px', fontSize: '12px',
                    fontWeight: 600, cursor: isPending ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isPending ? t('edit.deleting') : t('edit.confirmDelete')}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isPending}
                  style={{
                    padding: '7px 12px', background: 'var(--card-bg)', color: 'var(--text-muted)',
                    border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
                  }}
                >
                  {t('edit.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}

function FormField({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '5px' }}>
        {label}
      </label>
      {children}
    </div>
  )
}
