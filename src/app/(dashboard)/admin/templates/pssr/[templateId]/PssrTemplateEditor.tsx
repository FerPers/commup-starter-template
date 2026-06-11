'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { upsertPssrTemplateItem, deletePssrTemplateItem } from '@/app/actions/pssr'
import { exportPssrTemplate } from '@/app/actions/templates-backup'
import type { TemplatesBackup } from '@/lib/constants/templates-backup'
import BackupDocumentView from '@/components/templates/BackupDocumentView'

function downloadJsonFile(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function dateStamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function slugifySimple(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'pssr'
}

interface Item {
  id: string
  item_order: number
  category: string
  element: string
  requirement: string
  notes_hint: string | null
  is_required: boolean
}

interface Template { id: string; name: string; description: string | null; is_active: boolean }

const BLANK_FORM = { category: '', element: '', requirement: '', notes_hint: '', is_required: true }

// Group items by category
function groupByCategory(items: Item[]): [string, Item[]][] {
  const map = new Map<string, Item[]>()
  for (const item of items) {
    if (!map.has(item.category)) map.set(item.category, [])
    map.get(item.category)!.push(item)
  }
  return Array.from(map.entries())
}

export default function PssrTemplateEditor({
  template, items, canEdit,
}: {
  template: Template
  items: Item[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState<Item | null>(null)
  const [form, setForm] = useState(BLANK_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [docPreview, setDocPreview] = useState<TemplatesBackup | null>(null)

  const grouped = groupByCategory(items)

  function openNew() {
    setEditingItem(null)
    setForm(BLANK_FORM)
    setFormError(null)
    setShowModal(true)
  }

  function openEdit(item: Item) {
    setEditingItem(item)
    setForm({
      category: item.category,
      element: item.element,
      requirement: item.requirement,
      notes_hint: item.notes_hint ?? '',
      is_required: item.is_required,
    })
    setFormError(null)
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.category.trim() || !form.element.trim() || !form.requirement.trim()) {
      setFormError('Categoría, elemento y requisito son obligatorios')
      return
    }
    setFormError(null)
    startTransition(async () => {
      const res = await upsertPssrTemplateItem({
        id: editingItem?.id,
        templateId: template.id,
        itemOrder: editingItem?.item_order ?? (items.length + 1),
        category: form.category.trim(),
        element: form.element.trim(),
        requirement: form.requirement.trim(),
        notesHint: form.notes_hint.trim() || undefined,
        isRequired: form.is_required,
      })
      if (res.error) { setFormError(res.error); return }
      setShowModal(false)
      router.refresh()
    })
  }

  async function handleDelete(item: Item) {
    if (!confirm(`¿Eliminar "${item.element}"?`)) return
    setDeletingId(item.id)
    startTransition(async () => {
      const res = await deletePssrTemplateItem(item.id, template.id)
      setDeletingId(null)
      if (res.error) { setFormError(res.error); return }
      router.refresh()
    })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: '8px',
    border: '1.5px solid #d1d5db', fontSize: '14px', outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit', color: 'var(--text-strong)',
  }

  const STATUS_COLORS: Record<string, string> = {
    'Ingeniería y Diseño': '#3b82f6',
    'Documentación': '#8b5cf6',
    'Mecánica y Tuberías': '#f59e0b',
    'Electricidad': '#ef4444',
    'Instrumentación y Control': '#06b6d4',
    'Seguridad de Procesos': '#f97316',
    'Seguridad / HSE': '#10b981',
    'Operaciones y Capacitación': '#6366f1',
    'Mantenimiento': 'var(--text-muted)',
    'Medio Ambiente': '#22c55e',
    'Construcción y Comisionamiento': '#d97706',
  }

  function catColor(cat: string) { return STATUS_COLORS[cat] ?? 'var(--text-muted)' }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text-strong)' }}>{items.length}</strong> ítems en{' '}
          <strong style={{ color: 'var(--text-strong)' }}>{grouped.length}</strong> categorías
        </span>
        {canEdit && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => {
                startTransition(async () => {
                  const res = await exportPssrTemplate(template.id)
                  if (res.error || !res.backup) { setFormError(res.error ?? 'Error al previsualizar'); return }
                  setDocPreview(res.backup)
                })
              }}
              disabled={isPending}
              style={{
                padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe',
                cursor: isPending ? 'not-allowed' : 'pointer',
              }}
              title="Renderiza este template como documento imprimible"
            >
              Ver como documento
            </button>
            <button
              onClick={() => {
                startTransition(async () => {
                  const res = await exportPssrTemplate(template.id)
                  if (res.error || !res.backup) { setFormError(res.error ?? 'Error al exportar'); return }
                  downloadJsonFile(`commup-pssr-${slugifySimple(template.name)}-${dateStamp()}.json`, res.backup)
                })
              }}
              disabled={isPending}
              style={{
                padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                background: '#fef3c7', color: '#a16207', border: '1px solid #fde68a',
                cursor: isPending ? 'not-allowed' : 'pointer',
              }}
              title="Descargar este template como JSON"
            >
              Exportar JSON
            </button>
            <button
              onClick={openNew}
              style={{
                padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                background: 'var(--primary-500)', color: '#fff', border: 'none', cursor: 'pointer',
              }}
            >
              + Nuevo ítem
            </button>
          </div>
        )}
      </div>

      {/* Items by category */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {grouped.map(([category, catItems]) => (
          <div key={category} style={{
            background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)',
            overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            {/* Category header */}
            <div style={{
              padding: '12px 20px',
              borderLeft: `4px solid ${catColor(category)}`,
              background: 'var(--gray-50)',
              display: 'flex', alignItems: 'center', gap: '10px',
            }}>
              <span style={{
                display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%',
                background: catColor(category), flexShrink: 0,
              }} />
              <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-strong)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {category}
              </span>
              <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: 'auto' }}>
                {catItems.length} ítem{catItems.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Items */}
            {catItems.map((item, idx) => (
              <div key={item.id} style={{
                padding: '14px 20px',
                borderTop: idx > 0 ? '1px solid #f1f5f9' : undefined,
                display: 'flex', gap: '14px', alignItems: 'flex-start',
              }}>
                <span style={{
                  fontSize: '11px', fontWeight: 700, color: '#94a3b8',
                  paddingTop: '2px', flexShrink: 0, minWidth: '24px',
                }}>
                  {item.item_order}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--gray-700)' }}>{item.element}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '3px', lineHeight: 1.5 }}>
                    {item.requirement}
                  </div>
                  {item.notes_hint && (
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', fontStyle: 'italic' }}>
                      💡 {item.notes_hint}
                    </div>
                  )}
                </div>
                {!item.is_required && (
                  <span style={{
                    fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)',
                    background: 'var(--gray-100)', padding: '2px 7px', borderRadius: '4px',
                    flexShrink: 0,
                  }}>
                    OPCIONAL
                  </span>
                )}
                {canEdit && (
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    <button
                      onClick={() => openEdit(item)}
                      style={{
                        padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                        background: 'var(--gray-50)', border: '1px solid var(--border)', color: 'var(--gray-700)', cursor: 'pointer',
                      }}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(item)}
                      disabled={deletingId === item.id}
                      style={{
                        padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                        background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', cursor: 'pointer',
                      }}
                    >
                      {deletingId === item.id ? '...' : '✕'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

        {items.length === 0 && (
          <div style={{
            background: 'var(--card-bg)', borderRadius: '12px', border: '1.5px dashed #cbd5e1',
            padding: '48px', textAlign: 'center',
          }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
              Sin ítems. Agrega el primero o regresa al listado para cargar los 22 ítems estándar.
            </p>
          </div>
        )}
      </div>

      {/* Edit/Create modal */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
          overflowY: 'auto',
        }} onClick={() => setShowModal(false)}>
          <div style={{
            background: 'var(--card-bg)', borderRadius: '16px', padding: '32px',
            width: '100%', maxWidth: '560px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 20px' }}>
              {editingItem ? 'Editar ítem' : 'Nuevo ítem'}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>
                    Categoría *
                  </label>
                  <input
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    placeholder="Seguridad / HSE"
                    list="pssr-categories"
                    style={inputStyle}
                  />
                  <datalist id="pssr-categories">
                    {['Ingeniería y Diseño','Documentación','Mecánica y Tuberías','Electricidad',
                      'Instrumentación y Control','Seguridad de Procesos','Seguridad / HSE',
                      'Operaciones y Capacitación','Mantenimiento','Medio Ambiente',
                      'Construcción y Comisionamiento'].map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>
                    Elemento *
                  </label>
                  <input
                    value={form.element}
                    onChange={e => setForm(f => ({ ...f, element: e.target.value }))}
                    placeholder="Válvulas de Alivio (PSV)"
                    style={inputStyle}
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>
                  Requisito de verificación *
                </label>
                <textarea
                  value={form.requirement}
                  onChange={e => setForm(f => ({ ...f, requirement: e.target.value }))}
                  rows={3}
                  placeholder="¿Se han inspeccionado y probado...?"
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>
                  Nota / guía de verificación
                </label>
                <input
                  value={form.notes_hint}
                  onChange={e => setForm(f => ({ ...f, notes_hint: e.target.value }))}
                  placeholder="Verificar cálculos de dimensionamiento..."
                  style={inputStyle}
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--gray-700)' }}>
                <input
                  type="checkbox"
                  checked={form.is_required}
                  onChange={e => setForm(f => ({ ...f, is_required: e.target.checked }))}
                />
                <span>Ítem obligatorio (no se puede marcar N/A)</span>
              </label>
              {formError && <p style={{ color: '#dc2626', fontSize: '13px', margin: 0 }}>{formError}</p>}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                    background: 'var(--gray-100)', border: 'none', cursor: 'pointer', color: 'var(--gray-700)',
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={isPending}
                  style={{
                    padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                    background: 'var(--primary-500)', color: '#fff', border: 'none',
                    cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1,
                  }}
                >
                  {isPending ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {docPreview && (
        <BackupDocumentView backup={docPreview} onClose={() => setDocPreview(null)} />
      )}
    </>
  )
}