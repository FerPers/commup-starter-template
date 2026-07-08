'use client'

// Card de sección del builder: título editable, listado de ítems y formulario
// de alta/edición (Q3, extraído de TemplateBuilder.tsx). El estado de edición
// es local a cada card; las mutaciones suben al builder vía callbacks async
// que devuelven el error del server (o null).

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import TemplateItemForm from './TemplateItemForm'
import {
  DEFAULT_ITEM,
  ITEM_TYPE_DEFS,
  fieldInput,
  iconBtn,
  miniBtn,
  type BuilderItem,
  type BuilderSection,
  type ItemFormValues,
} from './template-builder-shared'

function TypeBadge({ type }: { type: string }) {
  const t = useTranslations('ItrTemplates.builder')
  const def = ITEM_TYPE_DEFS.find(it => it.value === type)
  const label = def ? t(def.labelKey as Parameters<typeof t>[0]) : type
  const color = def?.color ?? 'var(--gray-400)'
  return (
    <span style={{
      padding: '2px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 600,
      background: `${color}18`, color, border: `1px solid ${color}30`,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

export default function TemplateSectionCard({
  section,
  index,
  total,
  canEdit,
  busy,
  allItems,
  onRenameSection,
  onDeleteSection,
  onMoveSection,
  onCreateItem,
  onUpdateItem,
  onDeleteItem,
  onMoveItem,
}: {
  section: BuilderSection
  index: number
  total: number
  canEdit: boolean
  /** Pendiente global del builder (reorders) — deshabilita los botones de movimiento. */
  busy: boolean
  /** Todos los ítems del template (condición cruzada entre secciones). */
  allItems: BuilderItem[]
  onRenameSection: (sectionId: string, title: string) => Promise<string | null>
  onDeleteSection: (sectionId: string, title: string) => void
  onMoveSection: (sectionId: string, direction: 'up' | 'down') => void
  onCreateItem: (sectionId: string, form: ItemFormValues) => Promise<string | null>
  onUpdateItem: (itemId: string, form: ItemFormValues) => Promise<string | null>
  onDeleteItem: (itemId: string, sectionId: string) => void
  onMoveItem: (itemId: string, sectionId: string, direction: 'up' | 'down') => void
}) {
  const t = useTranslations('ItrTemplates.builder')

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(section.title)
  const [addingItem, setAddingItem] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function saveTitle() {
    if (!titleDraft.trim()) return
    setSaving(true)
    const err = await onRenameSection(section.id, titleDraft.trim())
    setSaving(false)
    if (!err) setEditingTitle(false)
  }

  async function saveNewItem(form: ItemFormValues): Promise<string | null> {
    setSaving(true)
    const err = await onCreateItem(section.id, form)
    setSaving(false)
    if (!err) setAddingItem(false)
    return err
  }

  async function saveEditItem(form: ItemFormValues): Promise<string | null> {
    if (!editingItemId) return null
    setSaving(true)
    const err = await onUpdateItem(editingItemId, form)
    setSaving(false)
    if (!err) setEditingItemId(null)
    return err
  }

  function itemToForm(item: BuilderItem): ItemFormValues {
    return {
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
      options: Array.isArray(item.options)
        ? item.options.filter((o): o is string => typeof o === 'string')
        : null,
      condition_item_id: item.condition_item_id,
      condition_value: item.condition_value,
    }
  }

  return (
    <div style={{
      background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)',
      marginBottom: '12px', overflow: 'hidden',
    }}>
      {/* Section header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '12px 16px', background: 'var(--gray-50)', borderBottom: '1px solid var(--border)',
      }}>
        {editingTitle ? (
          <>
            <input
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
              autoFocus
              style={{ ...fieldInput, flex: 1, fontSize: '13px', fontWeight: 600 }}
            />
            <button onClick={saveTitle} style={iconBtn('#3b82f6')}>✓</button>
            <button onClick={() => setEditingTitle(false)} style={iconBtn('var(--gray-400)')}>✕</button>
          </>
        ) : (
          <>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)', flex: 1 }}>
              {section.title}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--gray-400)', marginRight: '8px' }}>
              {t('sectionItemCount', { count: section.items.length, plural: section.items.length !== 1 ? 's' : '' })}
            </span>
            {canEdit && (
              <>
                <button
                  onClick={() => onMoveSection(section.id, 'up')}
                  disabled={index === 0 || busy}
                  style={{ ...iconBtn('var(--text-muted)'), opacity: index === 0 ? 0.3 : 1 }}
                  title={t('tooltipMoveUp')}
                >▲</button>
                <button
                  onClick={() => onMoveSection(section.id, 'down')}
                  disabled={index === total - 1 || busy}
                  style={{ ...iconBtn('var(--text-muted)'), opacity: index === total - 1 ? 0.3 : 1 }}
                  title={t('tooltipMoveDown')}
                >▼</button>
                <button
                  onClick={() => { setEditingTitle(true); setTitleDraft(section.title) }}
                  style={iconBtn('#3b82f6')}
                  title={t('tooltipRename')}
                >✎</button>
                <button
                  onClick={() => onDeleteSection(section.id, section.title)}
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
        {section.items.length === 0 && !addingItem && (
          <p style={{ fontSize: '12px', color: 'var(--gray-400)', padding: '12px 18px', margin: 0 }}>
            {t('emptySectionHint')}
          </p>
        )}

        {section.items.map((item, iIdx) => (
          editingItemId === item.id ? (
            <div key={item.id} style={{ padding: '8px 12px' }}>
              <TemplateItemForm
                initial={itemToForm(item)}
                allItems={allItems.filter(it => it.id !== item.id)}
                saving={saving}
                saveLabel={t('btnSaveChanges')}
                onSave={saveEditItem}
                onCancel={() => setEditingItemId(null)}
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
              <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontWeight: 600, fontSize: '11px' }}>
                {item.item_number ?? '—'}
              </span>
              <div>
                <div style={{ color: 'var(--text-strong)', fontWeight: 500 }}>{item.description}</div>
                {item.description_es && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '1px' }}>{item.description_es}</div>
                )}
                {item.condition_item_id && (() => {
                  const condItem = allItems.find(it => it.id === item.condition_item_id)
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
                {item.is_critical ? <span style={{ color: '#ef4444' }}>●</span> : <span style={{ color: 'var(--border)' }}>○</span>}
              </span>
              <span title={t('tooltipRequired')} style={{ textAlign: 'center', fontSize: '14px' }}>
                {item.is_required ? <span style={{ color: '#f59e0b' }}>●</span> : <span style={{ color: 'var(--border)' }}>○</span>}
              </span>
              <span title={t('tooltipPhoto')} style={{ textAlign: 'center', fontSize: '14px' }}>
                {item.requires_photo ? <span style={{ color: '#3b82f6' }}>⊙</span> : <span style={{ color: 'var(--border)' }}>○</span>}
              </span>
              {canEdit ? (
                <div style={{ display: 'flex', gap: '2px', justifyContent: 'flex-end' }}>
                  <button onClick={() => onMoveItem(item.id, section.id, 'up')} disabled={iIdx === 0} style={{ ...miniBtn, opacity: iIdx === 0 ? 0.3 : 1 }}>▲</button>
                  <button onClick={() => onMoveItem(item.id, section.id, 'down')} disabled={iIdx === section.items.length - 1} style={{ ...miniBtn, opacity: iIdx === section.items.length - 1 ? 0.3 : 1 }}>▼</button>
                  <button onClick={() => setEditingItemId(item.id)} style={{ ...miniBtn, color: '#3b82f6' }}>✎</button>
                  <button onClick={() => onDeleteItem(item.id, section.id)} style={{ ...miniBtn, color: '#ef4444' }}>✕</button>
                </div>
              ) : <span />}
            </div>
          )
        ))}

        {/* Add item form */}
        {addingItem && (
          <div style={{ padding: '8px 12px' }}>
            <TemplateItemForm
              initial={DEFAULT_ITEM}
              allItems={allItems}
              saving={saving}
              saveLabel={t('btnAddItemSave')}
              onSave={saveNewItem}
              onCancel={() => setAddingItem(false)}
            />
          </div>
        )}

        {/* Add item button */}
        {canEdit && !addingItem && (
          <div style={{ padding: '6px 14px' }}>
            <button
              onClick={() => { setEditingItemId(null); setAddingItem(true) }}
              style={{
                padding: '6px 14px', background: 'transparent', border: '1px dashed #cbd5e1',
                borderRadius: '7px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#3b82f6'; (e.currentTarget as HTMLElement).style.color = '#3b82f6' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--gray-300)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
            >
              {t('btnAddItem')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
