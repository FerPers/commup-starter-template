'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  updateTemplateHeader,
  publishTemplateVersion,
  createSection, updateSection, deleteSection, reorderSections,
  createItem, updateItem, deleteItem, reorderItems,
  type ItemPayload,
} from '@/app/actions/itr-templates'
import type { ItrItemType } from '@/types/database'
import ImportItemsModal from './ImportItemsModal'

// ── Types ──────────────────────────────────────────────────────

interface BuilderItem {
  id: string
  item_number: string | null
  description: string
  description_es: string | null
  item_type: ItrItemType
  is_required: boolean
  is_critical: boolean
  requires_photo: boolean
  requires_measurement: boolean
  unit: string | null
  acceptance_min: number | null
  acceptance_max: number | null
  acceptance_text: string | null
  order_index: number
  condition_item_id: string | null
  condition_value: string | null
}

interface BuilderSection {
  id: string
  title: string
  order_index: number
  items: BuilderItem[]
}

interface TemplateData {
  id: string
  code: string
  title: string
  description: string | null
  version: number
  is_active: boolean
  disciplines: { id: string; code: string; name: string; color: string } | null
  project_phases: { id: string; code: string; name: string; color: string } | null
  itr_template_sections: Array<{
    id: string; title: string; order_index: number
    itr_template_items: BuilderItem[]
  }>
}

interface Discipline { id: string; code: string; name: string; color: string }
interface Phase { id: string; code: string; name: string; color: string; order_index: number }

interface Props {
  template: TemplateData
  disciplines: Discipline[]
  phases: Phase[]
  canEdit: boolean
}

// ── Default item form ──────────────────────────────────────────

const DEFAULT_ITEM: Omit<ItemPayload, 'order_index'> = {
  item_number: '',
  description: '',
  description_es: '',
  item_type: 'checkbox',
  is_required: true,
  is_critical: false,
  requires_photo: false,
  requires_measurement: false,
  unit: '',
  acceptance_min: null,
  acceptance_max: null,
  acceptance_text: '',
  condition_item_id: null,
  condition_value: null,
}

// ── Helpers (outside component to avoid dep array issues) ────────

function buildSections(raw: TemplateData['itr_template_sections']): BuilderSection[] {
  return [...raw]
    .sort((a, b) => a.order_index - b.order_index)
    .map(s => ({
      ...s,
      items: [...s.itr_template_items].sort((a, b) => a.order_index - b.order_index),
    }))
}

// ── Main component ─────────────────────────────────────────────

export default function TemplateBuilder({ template, canEdit }: Props) {
  const router = useRouter()
  const t = useTranslations('ItrTemplates.builder')
  const [isPending, startTransition] = useTransition()

  // Item type config — labels resolved via i18n
  const ITEM_TYPES: { value: ItrItemType; label: string; color: string }[] = [
    { value: 'checkbox',    label: t('itemTypeCheckbox'),    color: '#3b82f6' },
    { value: 'yes_no',      label: t('itemTypeYesNo'),       color: '#10b981' },
    { value: 'number',      label: t('itemTypeNumber'),      color: '#f59e0b' },
    { value: 'measurement', label: t('itemTypeMeasurement'), color: '#8b5cf6' },
    { value: 'text',        label: t('itemTypeText'),        color: '#64748b' },
    { value: 'select',      label: t('itemTypeSelect'),      color: '#14b8a6' },
    { value: 'photo',       label: t('itemTypePhoto'),       color: '#ec4899' },
    { value: 'signature',   label: t('itemTypeSignature'),   color: '#6366f1' },
    { value: 'date',        label: t('itemTypeDate'),        color: '#f97316' },
  ]

  function TypeBadge({ type }: { type: string }) {
    const cfg = ITEM_TYPES.find(it => it.value === type) ?? { label: type, color: '#94a3b8' }
    return (
      <span style={{
        padding: '2px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 600,
        background: `${cfg.color}18`, color: cfg.color, border: `1px solid ${cfg.color}30`,
        whiteSpace: 'nowrap',
      }}>
        {cfg.label}
      </span>
    )
  }

  // ── Template data state
  const [sections, setSections] = useState<BuilderSection[]>(() => buildSections(template.itr_template_sections))

  // Sync state when server props refresh (after import)
  useEffect(() => {
    setSections(buildSections(template.itr_template_sections))
  }, [template])

  // ── Import modal state
  const [showImport, setShowImport] = useState(false)

  // ── Publish version state
  const [showPublishConfirm, setShowPublishConfirm] = useState(false)
  const [publishResult, setPublishResult] = useState<string | null>(null)

  // ── Header state
  const [headerEditing, setHeaderEditing] = useState(false)
  const [headerForm, setHeaderForm] = useState({
    code: template.code,
    title: template.title,
    description: template.description ?? '',
    is_active: template.is_active,
  })
  const [headerError, setHeaderError] = useState<string | null>(null)

  // ── Section state
  const [showAddSection, setShowAddSection] = useState(false)
  const [newSectionTitle, setNewSectionTitle] = useState('')
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null)
  const [editingSectionTitle, setEditingSectionTitle] = useState('')

  // ── Item state
  const [addingItemSectionId, setAddingItemSectionId] = useState<string | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [itemForm, setItemForm] = useState<Omit<ItemPayload, 'order_index'>>(DEFAULT_ITEM)
  const [itemError, setItemError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // ── Header save ────────────────────────────────────────────────

  function saveHeader() {
    if (!headerForm.code.trim() || !headerForm.title.trim()) {
      setHeaderError(t('errCodeTitleRequired'))
      return
    }
    setHeaderError(null)
    startTransition(async () => {
      const res = await updateTemplateHeader(template.id, {
        code: headerForm.code.trim().toUpperCase(),
        title: headerForm.title.trim(),
        description: headerForm.description.trim() || null,
        is_active: headerForm.is_active,
      })
      if (res.error) { setHeaderError(res.error); return }
      setHeaderEditing(false)
      router.refresh()
    })
  }

  // ── Publish version ───────────────────────────────────────────

  function handlePublishVersion() {
    setPublishResult(null)
    startTransition(async () => {
      const res = await publishTemplateVersion(template.id)
      if (res.error) { setPublishResult(`error:${res.error}`); return }
      setShowPublishConfirm(false)
      if (res.bumpedInPlace) {
        setPublishResult(`ok:${t('publishBumpedInPlace')}`)
        router.refresh()
      } else {
        // Redirect to new template
        router.push(`/admin/templates/${res.newTemplateId}`)
      }
    })
  }

  // ── Section operations ────────────────────────────────────────

  function handleAddSection() {
    if (!newSectionTitle.trim()) return
    const orderIndex = sections.length
    startTransition(async () => {
      const res = await createSection(template.id, newSectionTitle.trim(), orderIndex)
      if (res.error) { setActionError(res.error); return }
      setSections(prev => [...prev, {
        id: res.id!,
        title: newSectionTitle.trim(),
        order_index: orderIndex,
        items: [],
      }])
      setNewSectionTitle('')
      setShowAddSection(false)
    })
  }

  function handleSaveSection(sectionId: string) {
    if (!editingSectionTitle.trim()) return
    startTransition(async () => {
      const res = await updateSection(sectionId, editingSectionTitle.trim())
      if (res.error) { setActionError(res.error); return }
      setSections(prev => prev.map(s =>
        s.id === sectionId ? { ...s, title: editingSectionTitle.trim() } : s
      ))
      setEditingSectionId(null)
    })
  }

  function handleDeleteSection(sectionId: string, title: string) {
    if (!confirm(t('confirmDeleteSection', { title }))) return
    startTransition(async () => {
      const res = await deleteSection(sectionId)
      if (res.error) { setActionError(res.error); return }
      setSections(prev => {
        const updated = prev.filter(s => s.id !== sectionId)
          .map((s, i) => ({ ...s, order_index: i }))
        return updated
      })
    })
  }

  function handleMoveSection(sectionId: string, direction: 'up' | 'down') {
    setSections(prev => {
      const idx = prev.findIndex(s => s.id === sectionId)
      if (idx < 0) return prev
      const newIdx = direction === 'up' ? idx - 1 : idx + 1
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      const reindexed = next.map((s, i) => ({ ...s, order_index: i }))
      startTransition(async () => {
        await reorderSections(reindexed.map(s => ({ id: s.id, order_index: s.order_index })))
      })
      return reindexed
    })
  }

  // ── Item operations ───────────────────────────────────────────

  function openAddItem(sectionId: string) {
    setEditingItemId(null)
    setItemError(null)
    setItemForm(DEFAULT_ITEM)
    setAddingItemSectionId(sectionId)
  }

  function openEditItem(item: BuilderItem) {
    setAddingItemSectionId(null)
    setItemError(null)
    setItemForm({
      item_number: item.item_number ?? '',
      description: item.description,
      description_es: item.description_es ?? '',
      item_type: item.item_type,
      is_required: item.is_required,
      is_critical: item.is_critical,
      requires_photo: item.requires_photo,
      requires_measurement: item.requires_measurement,
      unit: item.unit ?? '',
      acceptance_min: item.acceptance_min,
      acceptance_max: item.acceptance_max,
      acceptance_text: item.acceptance_text ?? '',
      condition_item_id: item.condition_item_id,
      condition_value: item.condition_value,
    })
    setEditingItemId(item.id)
  }

  function handleSaveNewItem(sectionId: string) {
    if (!itemForm.description.trim()) {
      setItemError(t('errDescriptionRequired'))
      return
    }
    setItemError(null)
    const section = sections.find(s => s.id === sectionId)
    const orderIndex = section ? section.items.length : 0
    startTransition(async () => {
      const payload: ItemPayload = {
        ...itemForm,
        item_number: (itemForm.item_number as string)?.trim() || null,
        description: (itemForm.description as string).trim(),
        description_es: (itemForm.description_es as string)?.trim() || null,
        unit: (itemForm.unit as string)?.trim() || null,
        acceptance_text: (itemForm.acceptance_text as string)?.trim() || null,
        order_index: orderIndex,
      }
      const res = await createItem(sectionId, template.id, payload)
      if (res.error) { setItemError(res.error); return }
      setSections(prev => prev.map(s =>
        s.id === sectionId
          ? { ...s, items: [...s.items, { id: res.id!, ...payload } as BuilderItem] }
          : s
      ))
      setAddingItemSectionId(null)
      setItemForm(DEFAULT_ITEM)
    })
  }

  function handleSaveEditItem() {
    if (!editingItemId) return
    if (!itemForm.description.trim()) {
      setItemError(t('errDescriptionRequired'))
      return
    }
    setItemError(null)
    startTransition(async () => {
      const payload: Partial<ItemPayload> = {
        ...itemForm,
        item_number: (itemForm.item_number as string)?.trim() || null,
        description: (itemForm.description as string).trim(),
        description_es: (itemForm.description_es as string)?.trim() || null,
        unit: (itemForm.unit as string)?.trim() || null,
        acceptance_text: (itemForm.acceptance_text as string)?.trim() || null,
      }
      const res = await updateItem(editingItemId, payload)
      if (res.error) { setItemError(res.error); return }
      setSections(prev => prev.map(s => ({
        ...s,
        items: s.items.map(it =>
          it.id === editingItemId ? { ...it, ...payload } as BuilderItem : it
        ),
      })))
      setEditingItemId(null)
    })
  }

  function handleDeleteItem(itemId: string, sectionId: string) {
    if (!confirm(t('confirmDeleteItem'))) return
    startTransition(async () => {
      const res = await deleteItem(itemId)
      if (res.error) { setActionError(res.error); return }
      setSections(prev => prev.map(s =>
        s.id === sectionId
          ? { ...s, items: s.items.filter(it => it.id !== itemId).map((it, i) => ({ ...it, order_index: i })) }
          : s
      ))
    })
  }

  function handleMoveItem(itemId: string, sectionId: string, direction: 'up' | 'down') {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s
      const idx = s.items.findIndex(it => it.id === itemId)
      if (idx < 0) return s
      const newIdx = direction === 'up' ? idx - 1 : idx + 1
      if (newIdx < 0 || newIdx >= s.items.length) return s
      const next = [...s.items]
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      const reindexed = next.map((it, i) => ({ ...it, order_index: i }))
      startTransition(async () => {
        await reorderItems(reindexed.map(it => ({ id: it.id, order_index: it.order_index })))
      })
      return { ...s, items: reindexed }
    }))
  }

  // ── Item form component (shared for add/edit) ─────────────────

  function ItemForm({ onSave, onCancel, sectionId, currentItemId }: {
    onSave: () => void
    onCancel: () => void
    sectionId?: string
    currentItemId?: string
  }) {
    const isMeasurement = itemForm.item_type === 'measurement'

    // All items in this template (for condition dropdown), excluding the item being edited
    const allTemplateItems = sections.flatMap(s => s.items).filter(it => it.id !== currentItemId)

    // Determine appropriate condition_value UI based on the condition item's type
    const condItem = allTemplateItems.find(it => it.id === itemForm.condition_item_id)
    const condType = condItem?.item_type ?? null
    const useBooleanValues = condType === 'yes_no' || condType === 'checkbox'

    const FLAGS = [
      { key: 'is_critical',          label: t('flagCritical'),          color: '#ef4444' },
      { key: 'is_required',          label: t('flagRequired'),          color: '#f59e0b' },
      { key: 'requires_photo',       label: t('flagRequiresPhoto'),     color: '#3b82f6' },
      { key: 'requires_measurement', label: t('flagRequiresMeasurement'), color: '#8b5cf6' },
    ] as const

    return (
      <div style={{
        margin: '0 0 2px', padding: '16px 18px',
        background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '10px', marginBottom: '10px' }}>
          <label style={fieldLabel}>
            {t('fieldItemNumber')}
            <input
              value={itemForm.item_number as string ?? ''}
              onChange={e => setItemForm(f => ({ ...f, item_number: e.target.value }))}
              placeholder="1.0"
              style={{ ...fieldInput, fontFamily: 'monospace' }}
            />
          </label>
          <label style={fieldLabel}>
            {t('fieldType')}
            <select
              value={itemForm.item_type as string}
              onChange={e => setItemForm(f => ({ ...f, item_type: e.target.value as ItrItemType }))}
              style={fieldInput}
            >
              {ITEM_TYPES.map(tp => (
                <option key={tp.value} value={tp.value}>{tp.label}</option>
              ))}
            </select>
          </label>
        </div>

        <label style={{ ...fieldLabel, marginBottom: '10px' }}>
          {t('fieldDescriptionEn')} <span style={{ color: '#ef4444' }}>*</span>
          <input
            value={itemForm.description as string}
            onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Verify wiring connections..."
            style={fieldInput}
          />
        </label>

        <label style={{ ...fieldLabel, marginBottom: '10px' }}>
          {t('fieldDescriptionEs')}
          <input
            value={itemForm.description_es as string ?? ''}
            onChange={e => setItemForm(f => ({ ...f, description_es: e.target.value }))}
            placeholder="Verificar conexiones de cableado..."
            style={fieldInput}
          />
        </label>

        {isMeasurement && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px', gap: '10px', marginBottom: '10px' }}>
            <label style={fieldLabel}>
              {t('fieldUnit')}
              <input
                value={itemForm.unit as string ?? ''}
                onChange={e => setItemForm(f => ({ ...f, unit: e.target.value }))}
                placeholder="mA, psi, °C..."
                style={fieldInput}
              />
            </label>
            <label style={fieldLabel}>
              {t('fieldMinAcceptable')}
              <input
                type="number"
                value={itemForm.acceptance_min ?? ''}
                onChange={e => setItemForm(f => ({ ...f, acceptance_min: e.target.value ? Number(e.target.value) : null }))}
                style={fieldInput}
              />
            </label>
            <label style={fieldLabel}>
              {t('fieldMaxAcceptable')}
              <input
                type="number"
                value={itemForm.acceptance_max ?? ''}
                onChange={e => setItemForm(f => ({ ...f, acceptance_max: e.target.value ? Number(e.target.value) : null }))}
                style={fieldInput}
              />
            </label>
          </div>
        )}

        <label style={{ ...fieldLabel, marginBottom: '12px' }}>
          {t('fieldAcceptanceCriteria')}
          <input
            value={itemForm.acceptance_text as string ?? ''}
            onChange={e => setItemForm(f => ({ ...f, acceptance_text: e.target.value }))}
            placeholder="Ej: Lectura dentro del ±0.1% del span"
            style={fieldInput}
          />
        </label>

        {/* Flags */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '14px', flexWrap: 'wrap' }}>
          {FLAGS.map(flag => (
            <label key={flag.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500, color: '#374151' }}>
              <input
                type="checkbox"
                checked={itemForm[flag.key] as boolean}
                onChange={e => setItemForm(f => ({ ...f, [flag.key]: e.target.checked }))}
                style={{ accentColor: flag.color, width: '14px', height: '14px' }}
              />
              <span style={{ color: (itemForm[flag.key] as boolean) ? flag.color : '#64748b' }}>{flag.label}</span>
            </label>
          ))}
        </div>

        {/* Conditional logic */}
        {allTemplateItems.length > 0 && (
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
                  value={itemForm.condition_item_id ?? ''}
                  onChange={e => setItemForm(f => ({
                    ...f,
                    condition_item_id: e.target.value || null,
                    condition_value: null,
                  }))}
                  style={fieldInput}
                >
                  <option value="">{t('conditionItemNone')}</option>
                  {allTemplateItems.map(it => (
                    <option key={it.id} value={it.id}>
                      {it.item_number ? `${it.item_number} — ` : ''}{it.description.slice(0, 60)}
                    </option>
                  ))}
                </select>
              </label>
              {itemForm.condition_item_id && (
                <label style={fieldLabel}>
                  {t('conditionValueLabel')}
                  {useBooleanValues ? (
                    <select
                      value={itemForm.condition_value ?? ''}
                      onChange={e => setItemForm(f => ({ ...f, condition_value: e.target.value || null }))}
                      style={fieldInput}
                    >
                      <option value="">{t('conditionItemNone')}</option>
                      <option value="true">{t('conditionValueTrue')}</option>
                      <option value="false">{t('conditionValueFalse')}</option>
                    </select>
                  ) : (
                    <input
                      value={itemForm.condition_value ?? ''}
                      onChange={e => setItemForm(f => ({ ...f, condition_value: e.target.value || null }))}
                      placeholder={t('conditionValuePlaceholder')}
                      style={fieldInput}
                    />
                  )}
                </label>
              )}
            </div>
          </div>
        )}

        {itemError && (
          <p style={{ fontSize: '12px', color: '#ef4444', margin: '0 0 10px', padding: '8px 12px', background: '#fee2e2', borderRadius: '6px' }}>
            {itemError}
          </p>
        )}

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onSave}
            disabled={isPending}
            style={{
              padding: '7px 16px', background: '#3b82f6', color: 'white',
              borderRadius: '7px', fontSize: '12px', fontWeight: 500,
              border: 'none', cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.6 : 1,
            }}
          >
            {isPending ? t('btnSavingItem') : sectionId ? t('btnAddItemSave') : t('btnSaveChanges')}
          </button>
          <button
            onClick={onCancel}
            style={{
              padding: '7px 14px', background: 'white', border: '1px solid #e2e8f0',
              borderRadius: '7px', fontSize: '12px', color: '#64748b', cursor: 'pointer',
            }}
          >
            {t('btnCancel')}
          </button>
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────

  const disc = template.disciplines
  const phase = template.project_phases
  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0)

  return (
    <div style={{ padding: '32px', maxWidth: '1000px' }}>

      {/* Breadcrumb */}
      <a href="/admin/templates" style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        fontSize: '13px', color: '#64748b', textDecoration: 'none', marginBottom: '20px',
      }}>
        {t('breadcrumb')}
      </a>

      {/* Header card */}
      <div style={{
        background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0',
        padding: '22px 24px', marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        {!headerEditing ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '22px', fontWeight: 800, color: '#0f172a',
                  fontFamily: 'monospace', letterSpacing: '-0.5px',
                }}>
                  {template.code}
                </span>
                {disc && (
                  <span style={{
                    padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
                    background: `${disc.color}15`, color: disc.color,
                  }}>
                    {disc.code} — {disc.name}
                  </span>
                )}
                {phase && (
                  <span style={{
                    padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                    background: `${phase.color}18`, color: phase.color,
                  }}>
                    {t('headerPhaseLabel', { code: phase.code })}
                  </span>
                )}
                <span style={{
                  padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700,
                  background: '#eff6ff', color: '#3b82f6',
                  border: '1px solid #bfdbfe',
                }}>
                  v{template.version}
                </span>
                <span style={{
                  padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
                  background: template.is_active ? '#10b98115' : '#94a3b815',
                  color: template.is_active ? '#10b981' : '#94a3b8',
                  border: `1px solid ${template.is_active ? '#10b98130' : '#e2e8f0'}`,
                }}>
                  {template.is_active ? t('statusActive') : t('statusInactive')}
                </span>
              </div>
              <p style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b', margin: '0 0 4px' }}>{template.title}</p>
              {template.description && (
                <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>{template.description}</p>
              )}
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '8px 0 0' }}>
                {t('versionMeta', {
                  version: template.version,
                  items: totalItems,
                  itemsPlural: totalItems !== 1 ? 's' : '',
                  sections: sections.length,
                  sectionsPlural: sections.length !== 1 ? 'es' : '',
                })}
              </p>
              {publishResult && (() => {
                const isErr = publishResult.startsWith('error:')
                return (
                  <p style={{ fontSize: '12px', margin: '8px 0 0', padding: '6px 10px', borderRadius: '5px',
                    background: isErr ? '#fee2e2' : '#ecfdf5', color: isErr ? '#dc2626' : '#16a34a' }}>
                    {publishResult.slice(6)}
                  </p>
                )
              })()}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <a
                href={`/admin/templates/${template.id}/preview`}
                style={{
                  padding: '7px 14px', background: '#f5f3ff', border: '1px solid #ddd6fe',
                  borderRadius: '8px', fontSize: '12px', color: '#7c3aed', cursor: 'pointer',
                  fontWeight: 500, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px',
                }}
              >
                {t('btnFieldView')}
              </a>
              {canEdit && (
                <>
                  <button
                    onClick={() => setShowImport(true)}
                    style={{
                      padding: '7px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0',
                      borderRadius: '8px', fontSize: '12px', color: '#16a34a', cursor: 'pointer',
                      fontWeight: 500,
                    }}
                  >
                    {t('btnImportExcel')}
                  </button>
                  <button
                    onClick={() => setShowPublishConfirm(true)}
                    disabled={isPending}
                    style={{
                      padding: '7px 14px', background: '#1e40af', border: 'none',
                      borderRadius: '8px', fontSize: '12px', color: 'white', cursor: isPending ? 'not-allowed' : 'pointer',
                      fontWeight: 600, opacity: isPending ? 0.7 : 1,
                    }}
                  >
                    {t('btnPublishVersion')}
                  </button>
                  <button
                    onClick={() => setHeaderEditing(true)}
                    style={{
                      padding: '7px 14px', background: 'white', border: '1px solid #e2e8f0',
                      borderRadius: '8px', fontSize: '12px', color: '#475569', cursor: 'pointer',
                    }}
                  >
                    {t('btnEditHeader')}
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', margin: '0 0 16px' }}>
              {t('headerEditTitle')}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px', marginBottom: '12px' }}>
              <label style={fieldLabel}>
                {t('fieldCode')} <span style={{ color: '#ef4444' }}>*</span>
                <input
                  value={headerForm.code}
                  onChange={e => setHeaderForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  style={{ ...fieldInput, fontFamily: 'monospace', fontWeight: 700 }}
                  maxLength={20}
                />
              </label>
              <label style={fieldLabel}>
                {t('fieldTitle')} <span style={{ color: '#ef4444' }}>*</span>
                <input
                  value={headerForm.title}
                  onChange={e => setHeaderForm(f => ({ ...f, title: e.target.value }))}
                  style={fieldInput}
                />
              </label>
            </div>
            <label style={{ ...fieldLabel, marginBottom: '12px' }}>
              {t('fieldDescription')}
              <input
                value={headerForm.description}
                onChange={e => setHeaderForm(f => ({ ...f, description: e.target.value }))}
                placeholder={t('placeholderDescription')}
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '16px' }}>
              <input
                type="checkbox"
                checked={headerForm.is_active}
                onChange={e => setHeaderForm(f => ({ ...f, is_active: e.target.checked }))}
                style={{ accentColor: '#10b981', width: '14px', height: '14px' }}
              />
              <span style={{ fontSize: '13px', color: '#374151' }}>{t('flagActiveLabel')}</span>
            </label>
            {headerError && (
              <p style={{ fontSize: '12px', color: '#ef4444', margin: '0 0 12px', padding: '8px 12px', background: '#fee2e2', borderRadius: '6px' }}>
                {headerError}
              </p>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={saveHeader}
                disabled={isPending}
                style={{ padding: '8px 18px', background: '#3b82f6', color: 'white', borderRadius: '8px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}
              >
                {isPending ? t('btnSaving') : t('btnSave')}
              </button>
              <button
                onClick={() => { setHeaderEditing(false); setHeaderError(null) }}
                style={{ padding: '8px 14px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#64748b', cursor: 'pointer' }}
              >
                {t('btnCancel')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Global error */}
      {actionError && (
        <div style={{ padding: '10px 14px', background: '#fee2e2', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', color: '#ef4444' }}>
          {actionError}
          <button onClick={() => setActionError(null)} style={{ marginLeft: '12px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* Sections */}
      {sections.length === 0 && (
        <div style={{
          background: 'white', borderRadius: '14px', border: '2px dashed #e2e8f0',
          padding: '48px', textAlign: 'center', marginBottom: '16px',
        }}>
          <div style={{ fontSize: '28px', opacity: 0.3, marginBottom: '10px' }}>▤</div>
          <p style={{ fontSize: '14px', fontWeight: 500, color: '#475569', margin: '0 0 4px' }}>
            {t('emptyTitle')}
          </p>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
            {t('emptyDesc')}
          </p>
        </div>
      )}

      {sections.map((section, sIdx) => (
        <div key={section.id} style={{
          background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0',
          marginBottom: '12px', overflow: 'hidden',
        }}>
          {/* Section header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
          }}>
            {editingSectionId === section.id ? (
              <>
                <input
                  value={editingSectionTitle}
                  onChange={e => setEditingSectionTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveSection(section.id); if (e.key === 'Escape') setEditingSectionId(null) }}
                  autoFocus
                  style={{ ...fieldInput, flex: 1, fontSize: '13px', fontWeight: 600 }}
                />
                <button onClick={() => handleSaveSection(section.id)} style={iconBtn('#3b82f6')}>✓</button>
                <button onClick={() => setEditingSectionId(null)} style={iconBtn('#94a3b8')}>✕</button>
              </>
            ) : (
              <>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', flex: 1 }}>
                  {section.title}
                </span>
                <span style={{ fontSize: '11px', color: '#94a3b8', marginRight: '8px' }}>
                  {t('sectionItemCount', { count: section.items.length, plural: section.items.length !== 1 ? 's' : '' })}
                </span>
                {canEdit && (
                  <>
                    <button
                      onClick={() => handleMoveSection(section.id, 'up')}
                      disabled={sIdx === 0 || isPending}
                      style={{ ...iconBtn('#64748b'), opacity: sIdx === 0 ? 0.3 : 1 }}
                      title={t('tooltipMoveUp')}
                    >▲</button>
                    <button
                      onClick={() => handleMoveSection(section.id, 'down')}
                      disabled={sIdx === sections.length - 1 || isPending}
                      style={{ ...iconBtn('#64748b'), opacity: sIdx === sections.length - 1 ? 0.3 : 1 }}
                      title={t('tooltipMoveDown')}
                    >▼</button>
                    <button
                      onClick={() => { setEditingSectionId(section.id); setEditingSectionTitle(section.title) }}
                      style={iconBtn('#3b82f6')}
                      title={t('tooltipRename')}
                    >✎</button>
                    <button
                      onClick={() => handleDeleteSection(section.id, section.title)}
                      style={iconBtn('#ef4444')}
                      title={t('tooltipDeleteSection')}
                    >✕</button>
                  </>
                )}
              </>
            )}
          </div>

          {/* Items */}
          <div style={{ padding: '8px 0' }}>
            {section.items.length === 0 && addingItemSectionId !== section.id && (
              <p style={{ fontSize: '12px', color: '#94a3b8', padding: '12px 18px', margin: 0 }}>
                {t('emptySectionHint')}
              </p>
            )}

            {section.items.map((item, iIdx) => (
              editingItemId === item.id ? (
                <div key={item.id} style={{ padding: '8px 12px' }}>
                  <ItemForm
                    currentItemId={item.id}
                    onSave={handleSaveEditItem}
                    onCancel={() => { setEditingItemId(null); setItemError(null) }}
                  />
                </div>
              ) : (
                <div
                  key={item.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '55px 1fr 100px 36px 36px 36px 80px',
                    gap: '8px',
                    padding: '9px 16px',
                    borderBottom: iIdx < section.items.length - 1 ? '1px solid #f8fafc' : 'none',
                    alignItems: 'center', fontSize: '12px',
                  }}
                >
                  <span style={{ color: '#64748b', fontFamily: 'monospace', fontWeight: 600, fontSize: '11px' }}>
                    {item.item_number ?? '—'}
                  </span>
                  <div>
                    <div style={{ color: '#0f172a', fontWeight: 500 }}>{item.description}</div>
                    {item.description_es && (
                      <div style={{ color: '#64748b', fontSize: '11px', marginTop: '1px' }}>{item.description_es}</div>
                    )}
                    {item.condition_item_id && (() => {
                      const condItem = sections.flatMap(s => s.items).find(it => it.id === item.condition_item_id)
                      return condItem ? (
                        <div style={{ fontSize: '10px', color: '#92400e', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <span style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '3px', padding: '0 4px' }}>
                            {t('conditionBadgePrefix')} &ldquo;{condItem.item_number ?? condItem.description.slice(0, 25)}&rdquo; = {item.condition_value}
                          </span>
                        </div>
                      ) : null
                    })()}
                  </div>
                  <TypeBadge type={item.item_type} />
                  <span title={t('tooltipCritical')} style={{ textAlign: 'center', fontSize: '14px' }}>
                    {item.is_critical ? <span style={{ color: '#ef4444' }}>●</span> : <span style={{ color: '#e2e8f0' }}>○</span>}
                  </span>
                  <span title={t('tooltipRequired')} style={{ textAlign: 'center', fontSize: '14px' }}>
                    {item.is_required ? <span style={{ color: '#f59e0b' }}>●</span> : <span style={{ color: '#e2e8f0' }}>○</span>}
                  </span>
                  <span title={t('tooltipPhoto')} style={{ textAlign: 'center', fontSize: '14px' }}>
                    {item.requires_photo ? <span style={{ color: '#3b82f6' }}>⊙</span> : <span style={{ color: '#e2e8f0' }}>○</span>}
                  </span>
                  {canEdit ? (
                    <div style={{ display: 'flex', gap: '2px', justifyContent: 'flex-end' }}>
                      <button onClick={() => handleMoveItem(item.id, section.id, 'up')} disabled={iIdx === 0} style={{ ...miniBtn, opacity: iIdx === 0 ? 0.3 : 1 }}>▲</button>
                      <button onClick={() => handleMoveItem(item.id, section.id, 'down')} disabled={iIdx === section.items.length - 1} style={{ ...miniBtn, opacity: iIdx === section.items.length - 1 ? 0.3 : 1 }}>▼</button>
                      <button onClick={() => openEditItem(item)} style={{ ...miniBtn, color: '#3b82f6' }}>✎</button>
                      <button onClick={() => handleDeleteItem(item.id, section.id)} style={{ ...miniBtn, color: '#ef4444' }}>✕</button>
                    </div>
                  ) : <span />}
                </div>
              )
            ))}

            {/* Add item form */}
            {addingItemSectionId === section.id && (
              <div style={{ padding: '8px 12px' }}>
                <ItemForm
                  sectionId={section.id}
                  onSave={() => handleSaveNewItem(section.id)}
                  onCancel={() => { setAddingItemSectionId(null); setItemError(null) }}
                />
              </div>
            )}

            {/* Add item button */}
            {canEdit && addingItemSectionId !== section.id && (
              <div style={{ padding: '6px 14px' }}>
                <button
                  onClick={() => openAddItem(section.id)}
                  style={{
                    padding: '6px 14px', background: 'transparent', border: '1px dashed #cbd5e1',
                    borderRadius: '7px', fontSize: '12px', color: '#64748b', cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#3b82f6'; (e.currentTarget as HTMLElement).style.color = '#3b82f6' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#cbd5e1'; (e.currentTarget as HTMLElement).style.color = '#64748b' }}
                >
                  {t('btnAddItem')}
                </button>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Add section */}
      {canEdit && (
        <div style={{ marginTop: '8px' }}>
          {showAddSection ? (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                value={newSectionTitle}
                onChange={e => setNewSectionTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddSection(); if (e.key === 'Escape') { setShowAddSection(false); setNewSectionTitle('') } }}
                placeholder={t('placeholderSectionName')}
                autoFocus
                style={{ ...fieldInput, flex: 1, fontSize: '13px' }}
              />
              <button
                onClick={handleAddSection}
                disabled={isPending || !newSectionTitle.trim()}
                style={{ padding: '9px 18px', background: '#3b82f6', color: 'white', borderRadius: '8px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}
              >
                {t('btnAddSection')}
              </button>
              <button
                onClick={() => { setShowAddSection(false); setNewSectionTitle('') }}
                style={{ padding: '9px 14px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#64748b', cursor: 'pointer' }}
              >
                {t('btnCancel')}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddSection(true)}
              style={{
                padding: '10px 20px', background: 'white', border: '1px dashed #cbd5e1',
                borderRadius: '10px', fontSize: '13px', color: '#64748b', cursor: 'pointer',
                width: '100%', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#3b82f6'; (e.currentTarget as HTMLElement).style.color = '#3b82f6' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#cbd5e1'; (e.currentTarget as HTMLElement).style.color = '#64748b' }}
            >
              {t('btnAddSectionMain')}
            </button>
          )}
        </div>
      )}

      {/* Legend */}
      <div style={{ marginTop: '28px', padding: '12px 16px', background: '#f8fafc', borderRadius: '8px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        {[
          { icon: '●', color: '#ef4444', label: t('legendCritical') },
          { icon: '●', color: '#f59e0b', label: t('legendRequired') },
          { icon: '⊙', color: '#3b82f6', label: t('legendRequiresPhoto') },
          { icon: '○', color: '#e2e8f0', label: t('legendNotApplicable') },
        ].map(l => (
          <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#64748b' }}>
            <span style={{ color: l.color, fontSize: '13px' }}>{l.icon}</span>
            {l.label}
          </span>
        ))}
      </div>

      {/* Import modal */}
      {showImport && (
        <ImportItemsModal
          templateId={template.id}
          hasExistingContent={sections.length > 0}
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            setShowImport(false)
            router.refresh()
          }}
        />
      )}

      {/* Publish version confirm modal */}
      {showPublishConfirm && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setShowPublishConfirm(false) }}
        >
          <div style={{ background: 'white', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: '0 0 10px' }}>
              {t('publishVersionTitle')}
            </h2>
            <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 6px' }}>
              {t('publishVersionDesc', { version: template.version + 1 })}
            </p>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 22px' }}>
              {t('publishVersionNote')}
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowPublishConfirm(false)}
                style={{ padding: '8px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#64748b', cursor: 'pointer' }}
              >
                {t('btnCancel')}
              </button>
              <button
                onClick={handlePublishVersion}
                disabled={isPending}
                style={{ padding: '8px 20px', background: '#1e40af', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: 'white', cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}
              >
                {isPending ? t('btnSaving') : t('btnPublishVersionConfirm', { version: template.version + 1 })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Shared styles ──────────────────────────────────────────────

const fieldLabel: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '5px',
  fontSize: '11px', fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em',
}

const fieldInput: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '7px',
  fontSize: '13px', color: '#0f172a', background: 'white', outline: 'none',
  fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
}

function iconBtn(color: string): React.CSSProperties {
  return {
    width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: '6px', border: 'none', background: `${color}12`, color,
    cursor: 'pointer', fontSize: '12px', fontWeight: 700, flexShrink: 0,
  }
}

const miniBtn: React.CSSProperties = {
  width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: '4px', border: 'none', background: 'transparent', color: '#94a3b8',
  cursor: 'pointer', fontSize: '10px', padding: 0,
}
