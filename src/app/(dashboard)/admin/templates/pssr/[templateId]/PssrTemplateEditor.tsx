'use client'

import { useId, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { PSSR_CAPACITIES, type PssrCapacity } from '@/lib/constants/pssr'
import { useRouter } from 'next/navigation'
import { upsertPssrTemplateItem, deletePssrTemplateItem, setPssrTemplateSignatures } from '@/app/actions/pssr'
import { exportPssrTemplate } from '@/app/actions/templates-backup'
import type { TemplatesBackup } from '@/lib/constants/templates-backup'
import BackupDocumentView from '@/components/templates/BackupDocumentView'
import { useAskDialog } from '@/components/ui/AskDialog'
import { useToast } from '@/components/ui'
import { DialogSurface } from '@/components/ui/dialog-a11y'

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

interface Template { id: string; name: string; description: string | null; is_active: boolean; required_signatures: string[] }

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
  // Errores fuera del modal: formError solo se ve con el modal abierto.
  const toast = useToast()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [docPreview, setDocPreview] = useState<TemplatesBackup | null>(null)

  const grouped = groupByCategory(items)
  const tp = useTranslations('PSSR')
  const tx = useTranslations('PssrTemplates')
  const tA = useTranslations('AskDialog')
  const { dialog, confirm } = useAskDialog() // G-08: diálogo propio
  const itemTitleId = useId()

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
      setFormError(tx('itemRequired'))
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
    if (!(await confirm({ message: tx('deleteItemConfirm', { name: item.element }), confirmLabel: tA('delete'), danger: true }))) return
    setDeletingId(item.id)
    startTransition(async () => {
      const res = await deletePssrTemplateItem(item.id, template.id)
      setDeletingId(null)
      if (res.error) { toast.error(res.error); return }
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
      {dialog}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
          {tx.rich('summary', { items: items.length, categories: grouped.length, strong: c => <strong style={{ color: 'var(--text-strong)' }}>{c}</strong> })}
        </span>
        {canEdit && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => {
                startTransition(async () => {
                  const res = await exportPssrTemplate(template.id)
                  if (res.error || !res.backup) { toast.error(res.error ?? tx('previewError')); return }
                  setDocPreview(res.backup)
                })
              }}
              disabled={isPending}
              style={{
                padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe',
                cursor: isPending ? 'not-allowed' : 'pointer',
              }}
              title={tx('viewDocHint')}
            >
              {tx('viewDoc')}
            </button>
            <button
              onClick={() => {
                startTransition(async () => {
                  const res = await exportPssrTemplate(template.id)
                  if (res.error || !res.backup) { toast.error(res.error ?? tx('exportError')); return }
                  downloadJsonFile(`commup-pssr-${slugifySimple(template.name)}-${dateStamp()}.json`, res.backup)
                })
              }}
              disabled={isPending}
              style={{
                padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                background: '#fef3c7', color: '#a16207', border: '1px solid #fde68a',
                cursor: isPending ? 'not-allowed' : 'pointer',
              }}
              title={tx('exportJsonHint')}
            >
              {tx('exportJson')}
            </button>
            <button
              onClick={openNew}
              style={{
                padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                background: 'var(--primary-500)', color: '#fff', border: 'none', cursor: 'pointer',
              }}
            >
              {tx('newItem')}
            </button>
          </div>
        )}
      </div>

      {/* S16 (C-32): firmas que exige cada PSSR creado con esta plantilla (aprueba Comisionamiento). */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 18px', marginBottom: '16px', display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '13px', color: 'var(--text-strong)' }}>{tp('templateSignatures')}</strong>
        {PSSR_CAPACITIES.map(c => (
          <label key={c} style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', fontSize: '13px', color: 'var(--text-strong)' }}>
            <input type="checkbox" disabled={!canEdit || isPending} checked={template.required_signatures.includes(c)}
              onChange={e => {
                const next = e.target.checked ? [...template.required_signatures, c] : template.required_signatures.filter(x => x !== c)
                startTransition(async () => {
                  const res = await setPssrTemplateSignatures({ templateId: template.id, signatures: next as PssrCapacity[] })
                  if (res.error) { toast.error(res.error); return }
                  router.refresh()
                })
              }} />
            {tp(`capacity.${c}`)}
          </label>
        ))}
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{tp('templateSignaturesHint')}</span>
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
                {tx('items', { n: catItems.length })}
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
                    {tx('optional')}
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
                      {tx('edit')}
                    </button>
                    <button
                      onClick={() => handleDelete(item)}
                      disabled={deletingId === item.id}
                      aria-label={tA('delete')}
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
              {tx('noItems')}
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
          <DialogSurface onClose={isPending ? undefined : () => setShowModal(false)} labelledBy={itemTitleId} style={{
            background: 'var(--card-bg)', borderRadius: '16px', padding: '32px',
            width: '100%', maxWidth: '560px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h2 id={itemTitleId} style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 20px' }}>
              {editingItem ? tx('editItem') : tx('newItemTitle')}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>
                    {tx('category')}
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
                    {tx('element')}
                  </label>
                  <input
                    value={form.element}
                    onChange={e => setForm(f => ({ ...f, element: e.target.value }))}
                    placeholder={tx('elementPlaceholder')}
                    style={inputStyle}
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>
                  {tx('requirement')}
                </label>
                <textarea
                  value={form.requirement}
                  onChange={e => setForm(f => ({ ...f, requirement: e.target.value }))}
                  rows={3}
                  placeholder={tx('requirementPlaceholder')}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>
                  {tx('note')}
                </label>
                <input
                  value={form.notes_hint}
                  onChange={e => setForm(f => ({ ...f, notes_hint: e.target.value }))}
                  placeholder={tx('notePlaceholder')}
                  style={inputStyle}
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--gray-700)' }}>
                <input
                  type="checkbox"
                  checked={form.is_required}
                  onChange={e => setForm(f => ({ ...f, is_required: e.target.checked }))}
                />
                <span>{tx('mandatory')}</span>
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
                  {tx('cancel')}
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
                  {isPending ? tx('saving') : tx('save')}
                </button>
              </div>
            </div>
          </DialogSurface>
        </div>
      )}

      {docPreview && (
        <BackupDocumentView backup={docPreview} onClose={() => setDocPreview(null)} />
      )}
    </>
  )
}