'use client'

import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import MicAppend from './MicAppend'
import PhotoUpload from './PhotoUpload'
import { computeIsPassed, type Attachment, type Item, type Response, type SaveData } from './types'

export default function ItemRow({
  item,
  response,
  canEdit,
  onSave,
  onAddPunch,
  itrId,
  projectId,
  tagId,
  itemAttachments,
  onAttachmentAdded,
  onAttachmentRemoved,
  lang,
}: {
  item: Item
  response: Response | null
  canEdit: boolean
  onSave: (itemId: string, data: SaveData) => void
  onAddPunch: (itemDesc: string, itemId: string) => void
  itrId: string
  projectId: string
  tagId: string
  itemAttachments: Attachment[]
  onAttachmentAdded: (att: Attachment) => void
  onAttachmentRemoved: (attId: string) => void
  lang: 'es' | 'en'
}) {
  const t = useTranslations('ItrExecution')
  const isPassed = response?.is_passed
  const textRef = useRef<HTMLTextAreaElement | null>(null)
  const remarksRef = useRef<HTMLTextAreaElement | null>(null)

  // `description` is the primary text (typically EN). `description_es` is the
  // Spanish translation. Pick the chosen lang; if empty, fall back to primary.
  const visibleDesc = lang === 'es'
    ? (item.description_es?.trim() ?? item.description)
    : item.description

  return (
    <div style={{ background: 'var(--card-bg)', border: `1px solid ${isPassed === false ? '#fecaca' : 'var(--border)'}`, borderRadius: '10px', padding: '14px 16px' }}>

      {/* Item header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: item.item_type === 'checkbox' || item.item_type === 'yes_no' ? '0' : '12px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {item.item_number && (
              <span style={{ fontSize: '11px', fontFamily: 'ui-monospace, monospace', color: 'var(--gray-400)', minWidth: '28px' }}>{item.item_number}</span>
            )}
            <div style={{ display: 'flex', gap: '4px' }}>
              {item.is_critical && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', display: 'inline-block', flexShrink: 0, marginTop: '3px' }} title={t('item.titleCritical')} />}
              {item.is_required && !item.is_critical && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block', flexShrink: 0, marginTop: '3px' }} title={t('item.titleRequired')} />}
              {item.requires_photo && <span style={{ fontSize: '10px', color: '#3b82f6' }} title={t('item.titlePhoto')}>⊙</span>}
            </div>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-strong)', margin: '2px 0 0', lineHeight: '1.4' }}>{visibleDesc}</p>
        </div>

        {/* Add punch button */}
        <button
          onClick={() => onAddPunch(visibleDesc, item.id)}
          title={t('item.punchTooltip')}
          style={{ flexShrink: 0, padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, color: '#c2410c', background: '#fff7ed', border: '1px solid #fed7aa', cursor: 'pointer', marginTop: '2px' }}
        >
          ⚑
        </button>

        {/* Inline input for checkbox / yes_no */}
        {item.item_type === 'checkbox' && (
          <input
            type="checkbox"
            checked={response?.value_bool ?? false}
            disabled={!canEdit}
            onChange={e => onSave(item.id, {
              valueBool: e.target.checked,
              isPassed: item.is_critical ? e.target.checked : null,
            })}
            style={{ width: '20px', height: '20px', cursor: canEdit ? 'pointer' : 'default', marginTop: '2px', flexShrink: 0 }}
          />
        )}

        {item.item_type === 'yes_no' && (
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            {[true, false].map(val => (
              <button
                key={String(val)}
                disabled={!canEdit}
                onClick={() => onSave(item.id, {
                  valueBool: val,
                  isPassed: item.is_critical ? val : null,
                })}
                style={{ padding: '6px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, border: '1.5px solid', borderColor: response?.value_bool === val ? (val ? '#10b981' : '#ef4444') : 'var(--border)', background: response?.value_bool === val ? (val ? '#ecfdf5' : '#fee2e2') : 'var(--card-bg)', color: response?.value_bool === val ? (val ? '#10b981' : '#ef4444') : 'var(--text-muted)', cursor: canEdit ? 'pointer' : 'default' }}
              >
                {val ? t('item.yesBtn') : t('item.noBtn')}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Text input */}
      {item.item_type === 'text' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <textarea
            ref={textRef}
            rows={2}
            defaultValue={response?.value_text ?? ''}
            disabled={!canEdit}
            placeholder={t('item.observationsPlaceholder')}
            onBlur={e => onSave(item.id, { valueText: e.target.value || null })}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
          />
          <div style={{ alignSelf: 'flex-end' }}>
            <MicAppend
              targetRef={textRef}
              disabled={!canEdit}
              onCommit={(value) => onSave(item.id, { valueText: value || null })}
            />
          </div>
        </div>
      )}

      {/* Number input */}
      {item.item_type === 'number' && (
        <input
          type="number"
          defaultValue={response?.value_numeric ?? ''}
          disabled={!canEdit}
          onBlur={e => onSave(item.id, { valueNumeric: e.target.value !== '' ? Number(e.target.value) : null })}
          style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '13px', width: '160px' }}
        />
      )}

      {/* Measurement input */}
      {item.item_type === 'measurement' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              type="number"
              step="0.001"
              defaultValue={response?.value_numeric ?? ''}
              disabled={!canEdit}
              onBlur={e => {
                const val = e.target.value !== '' ? Number(e.target.value) : null
                const passed = val !== null ? computeIsPassed(val, item.acceptance_min, item.acceptance_max) : null
                onSave(item.id, { valueNumeric: val, isPassed: passed })
              }}
              style={{ padding: '8px 10px', border: `1px solid ${isPassed === false ? '#fca5a5' : 'var(--border)'}`, borderRadius: '7px', fontSize: '13px', width: '140px' }}
            />
            {item.unit && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.unit}</span>}
          </div>
          {(item.acceptance_min !== null || item.acceptance_max !== null) && (
            <span style={{ fontSize: '11px', color: 'var(--gray-400)' }}>
              {item.acceptance_min !== null && item.acceptance_max !== null
                ? t('item.criterionBoth', { min: item.acceptance_min, max: item.acceptance_max, unit: item.unit ?? '' })
                : item.acceptance_min !== null
                ? t('item.criterionMin', { min: item.acceptance_min, unit: item.unit ?? '' })
                : t('item.criterionMax', { max: item.acceptance_max!, unit: item.unit ?? '' })}
            </span>
          )}
          {isPassed === true && <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 600 }}>{t('item.passed')}</span>}
          {isPassed === false && <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: 600 }}>{t('item.failed')}</span>}
        </div>
      )}

      {/* Select */}
      {item.item_type === 'select' && (
        <select
          value={response?.value_option ?? ''}
          disabled={!canEdit}
          onChange={e => onSave(item.id, { valueOption: e.target.value || null })}
          style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '13px', background: 'var(--card-bg)', fontFamily: 'inherit', minWidth: '200px' }}
        >
          <option value="">{t('item.selectPlaceholder')}</option>
          {(item.options ?? (item.acceptance_text ? item.acceptance_text.split(',').map(s => s.trim()) : [])).map((opt: string) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )}

      {/* Date */}
      {item.item_type === 'date' && (
        <input
          type="date"
          defaultValue={response?.value_text ?? ''}
          disabled={!canEdit}
          onBlur={e => onSave(item.id, { valueText: e.target.value || null })}
          style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '13px' }}
        />
      )}

      {/* Photo upload */}
      {(item.item_type === 'photo' || item.requires_photo) && (
        <PhotoUpload
          itrId={itrId}
          itemId={item.id}
          projectId={projectId}
          tagId={tagId}
          existingAttachments={itemAttachments}
          canEdit={canEdit}
          onAdded={onAttachmentAdded}
          onRemoved={onAttachmentRemoved}
        />
      )}

      {/* Remarks (for measurement + critical items) */}
      {(item.is_critical || item.item_type === 'measurement') && (
        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <textarea
            ref={remarksRef}
            rows={1}
            defaultValue={response?.remarks ?? ''}
            disabled={!canEdit}
            placeholder={t('item.remarksPlaceholder')}
            onBlur={e => onSave(item.id, { remarks: e.target.value || null })}
            style={{ width: '100%', padding: '6px 10px', border: '1px solid #f1f5f9', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box', color: 'var(--text-muted)' }}
          />
          <div style={{ alignSelf: 'flex-end' }}>
            <MicAppend
              targetRef={remarksRef}
              disabled={!canEdit}
              onCommit={value => onSave(item.id, { remarks: value || null })}
            />
          </div>
        </div>
      )}
    </div>
  )
}
