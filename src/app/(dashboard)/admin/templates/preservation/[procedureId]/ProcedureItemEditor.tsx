'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  upsertProcedureItem,
  deleteProcedureItem,
  reorderProcedureItems,
  updateProcedure,
} from '@/app/actions/preservation'

// ── Types ──────────────────────────────────────────────────────

interface ProcItem {
  id: string
  order_index: number
  label: string
  item_type: string
  unit: string | null
  min_value: number | null
  max_value: number | null
  is_critical: boolean
  is_required: boolean
}

interface Discipline { id: string; code: string; name: string; color: string }

interface Procedure {
  id: string
  code: string
  title: string
  description: string | null
  frequency: string
  interval_days: number
  requires_photo: boolean
  requires_signature: boolean
  discipline_id: string | null
  disciplines: Discipline | null
  preservation_procedure_items: ProcItem[]
}

interface Props {
  procedure: Procedure
  disciplines: Discipline[]
  canEdit: boolean
}

// ── Config ─────────────────────────────────────────────────────

const ITEM_TYPES = [
  { value: 'checkbox',    label: 'Verificación', color: '#3b82f6' },
  { value: 'yes_no',      label: 'Sí / No',       color: '#10b981' },
  { value: 'number',      label: 'Número',        color: '#f59e0b' },
  { value: 'measurement', label: 'Medición',       color: '#8b5cf6' },
  { value: 'text',        label: 'Texto libre',    color: '#64748b' },
]

const FREQ_LABELS: Record<string, string> = {
  daily: 'Diario', weekly: 'Semanal', biweekly: 'Quincenal',
  monthly: 'Mensual', quarterly: 'Trimestral',
}

function TypeBadge({ type }: { type: string }) {
  const cfg = ITEM_TYPES.find(t => t.value === type) ?? { label: type, color: '#94a3b8' }
  return (
    <span style={{
      padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
      background: cfg.color + '20', color: cfg.color,
    }}>
      {cfg.label}
    </span>
  )
}

const DEFAULT_ITEM = {
  label: '', item_type: 'checkbox', unit: '', minValue: '', maxValue: '',
  isCritical: false, isRequired: true,
}

export default function ProcedureItemEditor({ procedure, disciplines, canEdit }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [items, setItems] = useState<ProcItem[]>(procedure.preservation_procedure_items)
  const [showAddItem, setShowAddItem] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [itemForm, setItemForm] = useState(DEFAULT_ITEM)
  const [itemError, setItemError] = useState<string | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  // Header edit
  const [editHeader, setEditHeader] = useState(false)
  const [hdrForm, setHdrForm] = useState({
    code: procedure.code,
    title: procedure.title,
    description: procedure.description ?? '',
    disciplineId: procedure.discipline_id ?? '',
    frequency: procedure.frequency,
    intervalDays: String(procedure.interval_days),
    requiresPhoto: procedure.requires_photo,
    requiresSignature: procedure.requires_signature,
  })
  const [hdrError, setHdrError] = useState<string | null>(null)

  function openEdit(item: ProcItem) {
    setEditingItemId(item.id)
    setItemForm({
      label: item.label,
      item_type: item.item_type,
      unit: item.unit ?? '',
      minValue: item.min_value != null ? String(item.min_value) : '',
      maxValue: item.max_value != null ? String(item.max_value) : '',
      isCritical: item.is_critical,
      isRequired: item.is_required,
    })
    setShowAddItem(true)
    setItemError(null)
  }

  function openAdd() {
    setEditingItemId(null)
    setItemForm(DEFAULT_ITEM)
    setShowAddItem(true)
    setItemError(null)
  }

  async function handleSaveItem() {
    if (!itemForm.label.trim()) { setItemError('El label es requerido'); return }
    const needsRange = ['measurement', 'number'].includes(itemForm.item_type)
    const minV = itemForm.minValue !== '' ? parseFloat(itemForm.minValue) : undefined
    const maxV = itemForm.maxValue !== '' ? parseFloat(itemForm.maxValue) : undefined

    setItemError(null)
    startTransition(async () => {
      const result = await upsertProcedureItem({
        id: editingItemId ?? undefined,
        procedureId: procedure.id,
        orderIndex: editingItemId
          ? (items.find(i => i.id === editingItemId)?.order_index ?? items.length)
          : items.length,
        label: itemForm.label,
        itemType: itemForm.item_type,
        unit: needsRange ? (itemForm.unit || undefined) : undefined,
        minValue: needsRange ? minV : undefined,
        maxValue: needsRange ? maxV : undefined,
        isCritical: itemForm.isCritical,
        isRequired: itemForm.isRequired,
      })
      if (result.error) { setItemError(result.error); return }

      setShowAddItem(false)
      setEditingItemId(null)
      router.refresh()
    })
  }

  async function handleDeleteItem(itemId: string) {
    if (!confirm('¿Eliminar este ítem?')) return
    startTransition(async () => {
      const result = await deleteProcedureItem(itemId, procedure.id)
      if (result.error) alert(result.error)
      else router.refresh()
    })
  }

  // Drag & drop reorder
  function handleDragStart(idx: number) { setDragIdx(idx) }
  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) return
    const newItems = [...items]
    const [moved] = newItems.splice(dragIdx, 1)
    newItems.splice(idx, 0, moved)
    setItems(newItems)
    setDragIdx(idx)
  }
  function handleDragEnd() {
    setDragIdx(null)
    startTransition(async () => {
      await reorderProcedureItems(procedure.id, items.map(i => i.id))
    })
  }

  async function handleSaveHeader() {
    if (!hdrForm.code.trim() || !hdrForm.title.trim()) { setHdrError('Código y título son requeridos'); return }
    const days = parseInt(hdrForm.intervalDays)
    if (isNaN(days) || days < 1) { setHdrError('Intervalo inválido'); return }
    setHdrError(null)
    startTransition(async () => {
      const result = await updateProcedure({
        procedureId: procedure.id,
        code: hdrForm.code,
        title: hdrForm.title,
        description: hdrForm.description || undefined,
        disciplineId: hdrForm.disciplineId || undefined,
        frequency: hdrForm.frequency,
        intervalDays: days,
        requiresPhoto: hdrForm.requiresPhoto,
        requiresSignature: hdrForm.requiresSignature,
      })
      if (result.error) { setHdrError(result.error); return }
      setEditHeader(false)
      router.refresh()
    })
  }

  const needsRange = ['measurement', 'number'].includes(itemForm.item_type)

  return (
    <div style={{ padding: '32px', maxWidth: '900px' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
        <button
          onClick={() => router.push('/admin/templates/preservation')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: '14px', fontWeight: 500, padding: 0 }}
        >
          Procedimientos de Preservación
        </button>
        <span style={{ color: '#94a3b8' }}>›</span>
        <span style={{ fontSize: '14px', color: '#64748b' }}>{procedure.code}</span>
      </div>

      {/* Header card */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '28px' }}>
        {!editHeader ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }}>
                {procedure.code}
              </div>
              <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
                {procedure.title}
              </h1>
              {procedure.description && (
                <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 12px', lineHeight: 1.5 }}>
                  {procedure.description}
                </p>
              )}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, background: '#f0f9ff', color: '#0ea5e9' }}>
                  {FREQ_LABELS[procedure.frequency] ?? procedure.frequency} · {procedure.interval_days} días
                </span>
                {procedure.disciplines && (
                  <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, background: procedure.disciplines.color + '20', color: procedure.disciplines.color }}>
                    {procedure.disciplines.code}
                  </span>
                )}
                {procedure.requires_photo && (
                  <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '12px', background: '#f8fafc', color: '#64748b' }}>📷 Foto</span>
                )}
                {procedure.requires_signature && (
                  <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '12px', background: '#f8fafc', color: '#64748b' }}>✍ Firma</span>
                )}
              </div>
            </div>
            {canEdit && (
              <button
                onClick={() => setEditHeader(true)}
                style={{ padding: '7px 14px', borderRadius: '8px', background: '#f1f5f9', color: '#374151', fontWeight: 600, fontSize: '13px', cursor: 'pointer', border: 'none', whiteSpace: 'nowrap' }}
              >
                Editar encabezado
              </button>
            )}
          </div>
        ) : (
          <div>
            {hdrError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' }}>
                {hdrError}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '4px' }}>Código</label>
                  <input value={hdrForm.code} onChange={e => setHdrForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '4px' }}>Título</label>
                  <input value={hdrForm.title} onChange={e => setHdrForm(f => ({ ...f, title: e.target.value }))}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '4px' }}>Descripción</label>
                <textarea value={hdrForm.description} onChange={e => setHdrForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '4px' }}>Disciplina</label>
                  <select value={hdrForm.disciplineId} onChange={e => setHdrForm(f => ({ ...f, disciplineId: e.target.value }))}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }}>
                    <option value="">— Ninguna —</option>
                    {disciplines.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '4px' }}>Frecuencia</label>
                  <select value={hdrForm.frequency} onChange={e => setHdrForm(f => ({ ...f, frequency: e.target.value }))}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }}>
                    <option value="daily">Diario</option>
                    <option value="weekly">Semanal</option>
                    <option value="biweekly">Quincenal</option>
                    <option value="monthly">Mensual</option>
                    <option value="quarterly">Trimestral</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '4px' }}>Días</label>
                  <input type="number" min="1" value={hdrForm.intervalDays} onChange={e => setHdrForm(f => ({ ...f, intervalDays: e.target.value }))}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                  <input type="checkbox" checked={hdrForm.requiresPhoto} onChange={e => setHdrForm(f => ({ ...f, requiresPhoto: e.target.checked }))} />
                  Requiere foto
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                  <input type="checkbox" checked={hdrForm.requiresSignature} onChange={e => setHdrForm(f => ({ ...f, requiresSignature: e.target.checked }))} />
                  Requiere firma
                </label>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => { setEditHeader(false); setHdrError(null) }}
                  style={{ padding: '7px 16px', borderRadius: '7px', background: '#f1f5f9', color: '#64748b', fontWeight: 600, fontSize: '13px', cursor: 'pointer', border: 'none' }}>
                  Cancelar
                </button>
                <button onClick={handleSaveHeader} disabled={isPending}
                  style={{ padding: '7px 16px', borderRadius: '7px', background: '#3b82f6', color: 'white', fontWeight: 600, fontSize: '13px', cursor: 'pointer', border: 'none', opacity: isPending ? 0.7 : 1 }}>
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Items section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
          Ítems del check sheet
          <span style={{ fontSize: '13px', fontWeight: 400, color: '#94a3b8', marginLeft: '8px' }}>
            ({items.length} {items.length === 1 ? 'ítem' : 'ítems'})
          </span>
        </h2>
        {canEdit && (
          <button
            onClick={openAdd}
            style={{ padding: '7px 16px', borderRadius: '8px', background: '#3b82f6', color: 'white', fontWeight: 600, fontSize: '13px', cursor: 'pointer', border: 'none' }}
          >
            + Agregar ítem
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div style={{ background: '#f8fafc', border: '2px dashed #e2e8f0', borderRadius: '10px', padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: '#94a3b8' }}>Sin ítems — agrega verificaciones, mediciones o notas de texto</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {items.map((item, idx) => (
            <div
              key={item.id}
              draggable={canEdit}
              onDragStart={() => handleDragStart(idx)}
              onDragOver={e => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              style={{
                background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px',
                padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px',
                opacity: dragIdx === idx ? 0.5 : 1, transition: 'opacity 0.1s',
                cursor: canEdit ? 'grab' : 'default',
              }}
            >
              {canEdit && (
                <div style={{ color: '#cbd5e1', fontSize: '16px', cursor: 'grab', flexShrink: 0 }}>⠿</div>
              )}
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#64748b', flexShrink: 0 }}>
                {idx + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>{item.label}</span>
                  {item.is_critical && (
                    <span style={{ padding: '1px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: 700, background: '#fef2f2', color: '#dc2626' }}>CRÍTICO</span>
                  )}
                  {!item.is_required && (
                    <span style={{ padding: '1px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: 600, background: '#f1f5f9', color: '#94a3b8' }}>Opcional</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <TypeBadge type={item.item_type} />
                  {item.unit && (
                    <span style={{ fontSize: '11px', color: '#64748b', background: '#f8fafc', padding: '2px 7px', borderRadius: '10px' }}>
                      Unidad: {item.unit}
                    </span>
                  )}
                  {item.min_value != null && (
                    <span style={{ fontSize: '11px', color: '#64748b', background: '#f8fafc', padding: '2px 7px', borderRadius: '10px' }}>
                      Min: {item.min_value}
                    </span>
                  )}
                  {item.max_value != null && (
                    <span style={{ fontSize: '11px', color: '#64748b', background: '#f8fafc', padding: '2px 7px', borderRadius: '10px' }}>
                      Max: {item.max_value}
                    </span>
                  )}
                </div>
              </div>
              {canEdit && (
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button onClick={() => openEdit(item)}
                    style={{ padding: '5px 10px', borderRadius: '6px', background: '#f1f5f9', color: '#374151', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: 'none' }}>
                    Editar
                  </button>
                  <button onClick={() => handleDeleteItem(item.id)}
                    style={{ padding: '5px 10px', borderRadius: '6px', background: '#fff5f5', color: '#dc2626', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: 'none' }}>
                    ✕
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit item modal */}
      {showAddItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '24px' }}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '26px', width: '100%', maxWidth: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                {editingItemId ? 'Editar ítem' : 'Agregar ítem'}
              </h3>
              <button onClick={() => setShowAddItem(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#94a3b8' }}>✕</button>
            </div>

            {itemError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '9px 12px', borderRadius: '7px', fontSize: '13px', marginBottom: '14px' }}>
                {itemError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '5px' }}>Descripción / Label *</label>
                <input
                  value={itemForm.label}
                  onChange={e => setItemForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="Ej: Verificar nivel de aceite"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '5px' }}>Tipo de ítem *</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {ITEM_TYPES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setItemForm(f => ({ ...f, item_type: t.value }))}
                      style={{
                        padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                        border: '2px solid',
                        borderColor: itemForm.item_type === t.value ? t.color : '#e2e8f0',
                        background: itemForm.item_type === t.value ? t.color + '20' : 'white',
                        color: itemForm.item_type === t.value ? t.color : '#64748b',
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {needsRange && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '5px' }}>Unidad</label>
                    <input value={itemForm.unit} onChange={e => setItemForm(f => ({ ...f, unit: e.target.value }))}
                      placeholder="bar, °C, mA…"
                      style={{ width: '100%', padding: '7px 9px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '5px' }}>Mín</label>
                    <input type="number" value={itemForm.minValue} onChange={e => setItemForm(f => ({ ...f, minValue: e.target.value }))}
                      style={{ width: '100%', padding: '7px 9px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '5px' }}>Máx</label>
                    <input type="number" value={itemForm.maxValue} onChange={e => setItemForm(f => ({ ...f, maxValue: e.target.value }))}
                      style={{ width: '100%', padding: '7px 9px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '20px', paddingTop: '4px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#374151' }}>
                  <input type="checkbox" checked={itemForm.isCritical} onChange={e => setItemForm(f => ({ ...f, isCritical: e.target.checked }))} />
                  <span>Crítico <span style={{ fontSize: '11px', color: '#94a3b8' }}>(bloquea aprobación)</span></span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#374151' }}>
                  <input type="checkbox" checked={itemForm.isRequired} onChange={e => setItemForm(f => ({ ...f, isRequired: e.target.checked }))} />
                  Requerido
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setShowAddItem(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', background: '#f1f5f9', color: '#64748b', fontWeight: 600, fontSize: '13px', cursor: 'pointer', border: 'none' }}>
                Cancelar
              </button>
              <button onClick={handleSaveItem} disabled={isPending}
                style={{ padding: '8px 18px', borderRadius: '8px', background: '#3b82f6', color: 'white', fontWeight: 600, fontSize: '13px', cursor: isPending ? 'wait' : 'pointer', border: 'none', opacity: isPending ? 0.7 : 1 }}>
                {isPending ? 'Guardando...' : (editingItemId ? 'Actualizar' : 'Agregar')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
