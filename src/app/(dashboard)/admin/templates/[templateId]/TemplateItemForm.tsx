'use client'

// Formulario de alta/edición de ítem del template (Q3, extraído de
// TemplateBuilder.tsx). Antes era un componente definido DENTRO del render
// del builder: React lo remontaba en cada keystroke (pérdida de foco). Ahora
// es top-level y dueño de su propio estado; el caller recibe el form completo
// en onSave.

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { ItrItemType } from '@/types/database'
import {
  ITEM_TYPE_DEFS,
  fieldInput,
  fieldLabel,
  type BuilderItem,
  type ItemFormValues,
} from './template-builder-shared'

export default function TemplateItemForm({
  initial,
  allItems,
  saving,
  saveLabel,
  onSave,
  onCancel,
}: {
  /** Valores iniciales (DEFAULT_ITEM para alta, o los del ítem en edición). */
  initial: ItemFormValues
  /** Ítems del template para el dropdown de condición (sin el ítem en edición). */
  allItems: BuilderItem[]
  saving: boolean
  saveLabel: string
  onSave: (form: ItemFormValues) => Promise<string | null>
  onCancel: () => void
}) {
  const t = useTranslations('ItrTemplates.builder')
  const [form, setForm] = useState<ItemFormValues>(initial)
  const [error, setError] = useState<string | null>(null)

  const isMeasurement = form.item_type === 'measurement'

  // Determine appropriate condition_value UI based on the condition item's type
  const condItem = allItems.find(it => it.id === form.condition_item_id)
  const condType = condItem?.item_type ?? null
  const useBooleanValues = condType === 'yes_no' || condType === 'checkbox'

  const FLAGS = [
    { key: 'is_critical',          label: t('flagCritical'),          color: '#ef4444' },
    { key: 'is_required',          label: t('flagRequired'),          color: '#f59e0b' },
    { key: 'requires_photo',       label: t('flagRequiresPhoto'),     color: '#3b82f6' },
    { key: 'requires_measurement', label: t('flagRequiresMeasurement'), color: '#8b5cf6' },
  ] as const

  async function handleSave() {
    if (!form.description.trim()) {
      setError(t('errDescriptionRequired'))
      return
    }
    setError(null)
    const err = await onSave(form)
    if (err) setError(err)
  }

  return (
    <div style={{
      margin: '0 0 2px', padding: '16px 18px',
      background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: '10px',
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '10px', marginBottom: '10px' }}>
        <label style={fieldLabel}>
          {t('fieldItemNumber')}
          <input
            value={form.item_number ?? ''}
            onChange={e => setForm(f => ({ ...f, item_number: e.target.value }))}
            placeholder="1.0"
            style={{ ...fieldInput, fontFamily: 'monospace' }}
          />
        </label>
        <label style={fieldLabel}>
          {t('fieldType')}
          <select
            value={form.item_type}
            onChange={e => setForm(f => ({ ...f, item_type: e.target.value as ItrItemType }))}
            style={fieldInput}
          >
            {ITEM_TYPE_DEFS.map(tp => (
              <option key={tp.value} value={tp.value}>{t(tp.labelKey as Parameters<typeof t>[0])}</option>
            ))}
          </select>
        </label>
      </div>

      <label style={{ ...fieldLabel, marginBottom: '10px' }}>
        {t('fieldDescriptionEn')} <span style={{ color: '#ef4444' }}>*</span>
        <input
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Verify wiring connections..."
          style={fieldInput}
        />
      </label>

      <label style={{ ...fieldLabel, marginBottom: '10px' }}>
        {t('fieldDescriptionEs')}
        <input
          value={form.description_es ?? ''}
          onChange={e => setForm(f => ({ ...f, description_es: e.target.value }))}
          placeholder="Verificar conexiones de cableado..."
          style={fieldInput}
        />
      </label>

      {isMeasurement && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px', gap: '10px', marginBottom: '10px' }}>
          <label style={fieldLabel}>
            {t('fieldUnit')}
            <input
              value={form.unit ?? ''}
              onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
              placeholder="mA, psi, °C..."
              style={fieldInput}
            />
          </label>
          <label style={fieldLabel}>
            {t('fieldMinAcceptable')}
            <input
              type="number"
              value={form.acceptance_min ?? ''}
              onChange={e => setForm(f => ({ ...f, acceptance_min: e.target.value ? Number(e.target.value) : null }))}
              style={fieldInput}
            />
          </label>
          <label style={fieldLabel}>
            {t('fieldMaxAcceptable')}
            <input
              type="number"
              value={form.acceptance_max ?? ''}
              onChange={e => setForm(f => ({ ...f, acceptance_max: e.target.value ? Number(e.target.value) : null }))}
              style={fieldInput}
            />
          </label>
        </div>
      )}

      <label style={{ ...fieldLabel, marginBottom: '12px' }}>
        {t('fieldAcceptanceCriteria')}
        <input
          value={form.acceptance_text ?? ''}
          onChange={e => setForm(f => ({ ...f, acceptance_text: e.target.value }))}
          placeholder="Ej: Lectura dentro del ±0.1% del span"
          style={fieldInput}
        />
      </label>

      {/* Flags */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {FLAGS.map(flag => (
          <label key={flag.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500, color: 'var(--gray-700)' }}>
            <input
              type="checkbox"
              checked={form[flag.key] as boolean}
              onChange={e => setForm(f => ({ ...f, [flag.key]: e.target.checked }))}
              style={{ accentColor: flag.color, width: '14px', height: '14px' }}
            />
            <span style={{ color: (form[flag.key] as boolean) ? flag.color : 'var(--text-muted)' }}>{flag.label}</span>
          </label>
        ))}
      </div>

      {/* Conditional logic */}
      {allItems.length > 0 && (
        <div style={{
          padding: '12px 14px', background: '#fffbeb', border: '1px solid #fef3c7',
          borderRadius: '8px', marginBottom: '12px',
        }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
            {t('conditionSectionLabel')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: '8px' }}>
            <label style={fieldLabel}>
              {t('conditionItemLabel')}
              <select
                value={form.condition_item_id ?? ''}
                onChange={e => setForm(f => ({
                  ...f,
                  condition_item_id: e.target.value || null,
                  condition_value: null,
                }))}
                style={fieldInput}
              >
                <option value="">{t('conditionItemNone')}</option>
                {allItems.map(it => (
                  <option key={it.id} value={it.id}>
                    {it.item_number ? `${it.item_number} — ` : ''}{it.description.slice(0, 60)}
                  </option>
                ))}
              </select>
            </label>
            {form.condition_item_id && (
              <label style={fieldLabel}>
                {t('conditionValueLabel')}
                {useBooleanValues ? (
                  <select
                    value={form.condition_value ?? ''}
                    onChange={e => setForm(f => ({ ...f, condition_value: e.target.value || null }))}
                    style={fieldInput}
                  >
                    <option value="">{t('conditionItemNone')}</option>
                    <option value="true">{t('conditionValueTrue')}</option>
                    <option value="false">{t('conditionValueFalse')}</option>
                  </select>
                ) : (
                  <input
                    value={form.condition_value ?? ''}
                    onChange={e => setForm(f => ({ ...f, condition_value: e.target.value || null }))}
                    placeholder={t('conditionValuePlaceholder')}
                    style={fieldInput}
                  />
                )}
              </label>
            )}
          </div>
        </div>
      )}

      {error && (
        <p style={{ fontSize: '12px', color: '#ef4444', margin: '0 0 10px', padding: '8px 12px', background: '#fee2e2', borderRadius: '6px' }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '7px 16px', background: '#3b82f6', color: '#fff',
            borderRadius: '7px', fontSize: '12px', fontWeight: 500,
            border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? t('btnSavingItem') : saveLabel}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '7px 14px', background: 'var(--card-bg)', border: '1px solid var(--border)',
            borderRadius: '7px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer',
          }}
        >
          {t('btnCancel')}
        </button>
      </div>
    </div>
  )
}
