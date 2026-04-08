'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPssrTemplate, seedDefaultPssrTemplate, deletePssrTemplate } from '@/app/actions/pssr'

interface Template {
  id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
  pssr_template_items: Array<{ id: string }>
}

export default function PssrTemplatesView({ templates, canEdit }: { templates: Template[]; canEdit: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const [formError, setFormError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [seedingId, setSeedingId] = useState<string | null>(null)

  async function handleCreate() {
    if (!form.name.trim()) { setFormError('El nombre es requerido'); return }
    setFormError(null)
    startTransition(async () => {
      try {
        const tmpl = await createPssrTemplate({ name: form.name, description: form.description || undefined })
        setShowModal(false)
        setForm({ name: '', description: '' })
        router.push(`/admin/templates/pssr/${tmpl.id}`)
      } catch (e: unknown) {
        setFormError(e instanceof Error ? e.message : 'Error al crear')
      }
    })
  }

  async function handleSeedDefault(templateId: string) {
    setSeedingId(templateId)
    try {
      await seedDefaultPssrTemplate(templateId)
      router.refresh()
    } finally {
      setSeedingId(null)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    startTransition(async () => {
      try { await deletePssrTemplate(id); router.refresh() }
      finally { setDeletingId(null) }
    })
  }

  const card: React.CSSProperties = {
    background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0',
    padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  }

  return (
    <>
      {/* Empty state with seed button */}
      {templates.length === 0 && (
        <div style={{
          background: 'white', borderRadius: '16px', border: '1.5px dashed #cbd5e1',
          padding: '48px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🛡️</div>
          <p style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', margin: '0 0 6px' }}>
            No hay templates PSSR
          </p>
          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
            Crea uno desde cero o carga el checklist estándar de 22 ítems
          </p>
          {canEdit && (
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => setShowModal(true)}
                style={{
                  padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  background: '#0f172a', color: 'white', border: 'none', cursor: 'pointer',
                }}
              >
                + Nuevo template
              </button>
            </div>
          )}
        </div>
      )}

      {/* Template list */}
      {templates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {canEdit && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
              <button
                onClick={() => setShowModal(true)}
                style={{
                  padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  background: '#0f172a', color: 'white', border: 'none', cursor: 'pointer',
                }}
              >
                + Nuevo template
              </button>
            </div>
          )}
          {templates.map(t => (
            <div key={t.id} style={card}>
              {/* Icon */}
              <div style={{
                width: '42px', height: '42px', borderRadius: '10px', flexShrink: 0,
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '18px',
              }}>🛡️</div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '15px', color: '#0f172a' }}>{t.name}</div>
                {t.description && (
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{t.description}</div>
                )}
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                  {t.pssr_template_items.length} ítems
                </div>
              </div>

              {/* Status chip */}
              <span style={{
                padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                background: t.is_active ? '#ecfdf5' : '#f1f5f9',
                color: t.is_active ? '#10b981' : '#64748b',
              }}>
                {t.is_active ? 'Activo' : 'Inactivo'}
              </span>

              {/* Actions */}
              {canEdit && (
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  {t.pssr_template_items.length === 0 && (
                    <button
                      onClick={() => handleSeedDefault(t.id)}
                      disabled={seedingId === t.id}
                      style={{
                        padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
                        background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e',
                        cursor: 'pointer',
                      }}
                    >
                      {seedingId === t.id ? 'Cargando...' : '↓ Seed 22 ítems'}
                    </button>
                  )}
                  <button
                    onClick={() => router.push(`/admin/templates/pssr/${t.id}`)}
                    style={{
                      padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
                      background: '#f8fafc', border: '1px solid #e2e8f0', color: '#374151',
                      cursor: 'pointer',
                    }}
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    disabled={deletingId === t.id || isPending}
                    style={{
                      padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
                      background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
                      cursor: 'pointer',
                    }}
                  >
                    {deletingId === t.id ? '...' : 'Eliminar'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        }} onClick={() => setShowModal(false)}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '440px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '0 0 20px' }}>
              Nuevo template PSSR
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>
                  Nombre *
                </label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="PSSR Estándar"
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: '8px',
                    border: '1.5px solid #d1d5db', fontSize: '14px', outline: 'none',
                    boxSizing: 'border-box', fontFamily: 'inherit',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>
                  Descripción
                </label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder="Checklist completo de 22 ítems..."
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: '8px',
                    border: '1.5px solid #d1d5db', fontSize: '14px', outline: 'none',
                    resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit',
                  }}
                />
              </div>
              {formError && (
                <p style={{ color: '#dc2626', fontSize: '13px', margin: 0 }}>{formError}</p>
              )}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                    background: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#374151',
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreate}
                  disabled={isPending}
                  style={{
                    padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                    background: '#0f172a', color: 'white', border: 'none',
                    cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1,
                  }}
                >
                  {isPending ? 'Creando...' : 'Crear template'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}