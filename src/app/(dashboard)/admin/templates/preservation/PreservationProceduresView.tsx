'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createProcedure, deleteProcedure } from '@/app/actions/preservation'

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
  disciplines: Discipline | null
  preservation_procedure_items: Array<{ id: string }>
}

interface Props {
  procedures: Procedure[]
  disciplines: Discipline[]
  canEdit: boolean
}

const FREQ_LABELS: Record<string, string> = {
  daily: 'Diario',
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
  quarterly: 'Trimestral',
}

const FREQ_COLORS: Record<string, string> = {
  daily:     '#ef4444',
  weekly:    '#f59e0b',
  biweekly:  '#3b82f6',
  monthly:   '#10b981',
  quarterly: '#8b5cf6',
}

const DEFAULT_FORM = {
  code: '', title: '', description: '',
  disciplineId: '', frequency: 'monthly', intervalDays: '30',
  requiresPhoto: false, requiresSignature: true,
}

export default function PreservationProceduresView({ procedures, disciplines, canEdit }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [activeDisc, setActiveDisc] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const filtered = activeDisc === 'all'
    ? procedures
    : procedures.filter(p => p.disciplines?.code === activeDisc)

  async function handleCreate() {
    if (!form.code.trim() || !form.title.trim() || !form.frequency) {
      setFormError('Código, título y frecuencia son requeridos')
      return
    }
    const days = parseInt(form.intervalDays)
    if (isNaN(days) || days < 1) {
      setFormError('Intervalo debe ser un número positivo')
      return
    }
    setFormError(null)
    startTransition(async () => {
      const result = await createProcedure({
        code: form.code,
        title: form.title,
        description: form.description || undefined,
        disciplineId: form.disciplineId || undefined,
        frequency: form.frequency,
        intervalDays: days,
        requiresPhoto: form.requiresPhoto,
        requiresSignature: form.requiresSignature,
      })
      if (result.error) { setFormError(result.error); return }
      setShowModal(false)
      setForm(DEFAULT_FORM)
      if (result.data) router.push(`/admin/templates/preservation/${result.data.id}`)
      else router.refresh()
    })
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este procedimiento? Solo es posible si no tiene planes asignados.')) return
    setDeletingId(id)
    startTransition(async () => {
      const result = await deleteProcedure(id)
      setDeletingId(null)
      if (result.error) alert(result.error)
      else router.refresh()
    })
  }

  // Frequency selector auto-sets intervalDays
  function handleFreqChange(freq: string) {
    const defaults: Record<string, string> = {
      daily: '1', weekly: '7', biweekly: '14', monthly: '30', quarterly: '90',
    }
    setForm(f => ({ ...f, frequency: freq, intervalDays: defaults[freq] ?? f.intervalDays }))
  }

  const discCodesInProcs = [...new Set(procedures.map(p => p.disciplines?.code).filter(Boolean))]
  const discTabs = disciplines.filter(d => discCodesInProcs.includes(d.code))

  return (
    <>
      {/* Filter tabs + actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveDisc('all')}
            style={{
              padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', border: 'none',
              background: activeDisc === 'all' ? '#0f172a' : '#f1f5f9',
              color: activeDisc === 'all' ? 'white' : '#64748b',
            }}
          >
            Todos ({procedures.length})
          </button>
          {discTabs.map(d => (
            <button
              key={d.code}
              onClick={() => setActiveDisc(d.code)}
              style={{
                padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', border: 'none',
                background: activeDisc === d.code ? d.color : '#f1f5f9',
                color: activeDisc === d.code ? 'white' : '#64748b',
              }}
            >
              {d.code}
            </button>
          ))}
        </div>

        {canEdit && (
          <button
            onClick={() => setShowModal(true)}
            style={{
              padding: '8px 18px', borderRadius: '8px', background: '#3b82f6', color: 'white',
              fontWeight: 600, fontSize: '14px', cursor: 'pointer', border: 'none',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            + Nuevo procedimiento
          </button>
        )}
      </div>

      {/* Procedures grid */}
      {filtered.length === 0 ? (
        <div style={{
          background: '#f8fafc', border: '2px dashed #e2e8f0', borderRadius: '12px',
          padding: '48px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>◉</div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
            Sin procedimientos
          </div>
          <div style={{ fontSize: '14px', color: '#9ca3af' }}>
            Crea el primer procedimiento de preservación para esta disciplina
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {filtered.map(proc => {
            const itemCount = proc.preservation_procedure_items.length
            const freqColor = FREQ_COLORS[proc.frequency] ?? '#64748b'
            return (
              <div
                key={proc.id}
                onClick={() => router.push(`/admin/templates/preservation/${proc.id}`)}
                style={{
                  background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px',
                  padding: '20px', cursor: 'pointer', transition: 'box-shadow 0.15s',
                  display: 'flex', flexDirection: 'column', gap: '12px',
                }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '2px' }}>
                      {proc.code}
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>
                      {proc.title}
                    </div>
                  </div>
                  {canEdit && (
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(proc.id) }}
                      disabled={deletingId === proc.id}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '16px', padding: '4px', flexShrink: 0 }}
                      title="Eliminar"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {proc.description && (
                  <div style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.4 }}>
                    {proc.description}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{
                    padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                    background: freqColor + '20', color: freqColor,
                  }}>
                    {FREQ_LABELS[proc.frequency] ?? proc.frequency} · {proc.interval_days}d
                  </span>
                  {proc.disciplines && (
                    <span style={{
                      padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                      background: proc.disciplines.color + '20', color: proc.disciplines.color,
                    }}>
                      {proc.disciplines.code}
                    </span>
                  )}
                  <span style={{
                    padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                    background: itemCount > 0 ? '#f0fdf4' : '#fef9c3',
                    color: itemCount > 0 ? '#16a34a' : '#854d0e',
                  }}>
                    {itemCount} {itemCount === 1 ? 'ítem' : 'ítems'}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                  {proc.requires_photo && (
                    <span style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      📷 Foto requerida
                    </span>
                  )}
                  {proc.requires_signature && (
                    <span style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      ✍ Firma requerida
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '24px',
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '28px',
            width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                Nuevo procedimiento de preservación
              </h2>
              <button onClick={() => { setShowModal(false); setFormError(null); setForm(DEFAULT_FORM) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#94a3b8' }}>✕</button>
            </div>

            {formError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
                {formError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Código *</label>
                  <input
                    value={form.code}
                    onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                    placeholder="P-MECH-01"
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Título *</label>
                  <input
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Ej: Rotación de eje mensual"
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Descripción</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder="Descripción opcional del procedimiento..."
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Disciplina</label>
                  <select
                    value={form.disciplineId}
                    onChange={e => setForm(f => ({ ...f, disciplineId: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }}
                  >
                    <option value="">— Sin disciplina —</option>
                    {disciplines.map(d => (
                      <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Frecuencia *</label>
                  <select
                    value={form.frequency}
                    onChange={e => handleFreqChange(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }}
                  >
                    <option value="daily">Diario</option>
                    <option value="weekly">Semanal</option>
                    <option value="biweekly">Quincenal</option>
                    <option value="monthly">Mensual</option>
                    <option value="quarterly">Trimestral</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                  Intervalo exacto (días) *
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.intervalDays}
                  onChange={e => setForm(f => ({ ...f, intervalDays: e.target.value }))}
                  style={{ width: '140px', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px' }}
                />
                <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: '10px' }}>
                  Define exactamente cada cuántos días aplica
                </span>
              </div>

              <div style={{ display: 'flex', gap: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#374151' }}>
                  <input
                    type="checkbox"
                    checked={form.requiresPhoto}
                    onChange={e => setForm(f => ({ ...f, requiresPhoto: e.target.checked }))}
                  />
                  Requiere foto
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#374151' }}>
                  <input
                    type="checkbox"
                    checked={form.requiresSignature}
                    onChange={e => setForm(f => ({ ...f, requiresSignature: e.target.checked }))}
                  />
                  Requiere firma
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                onClick={() => { setShowModal(false); setFormError(null); setForm(DEFAULT_FORM) }}
                style={{ padding: '9px 18px', borderRadius: '8px', background: '#f1f5f9', color: '#64748b', fontWeight: 600, fontSize: '14px', cursor: 'pointer', border: 'none' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={isPending}
                style={{ padding: '9px 20px', borderRadius: '8px', background: '#3b82f6', color: 'white', fontWeight: 600, fontSize: '14px', cursor: isPending ? 'wait' : 'pointer', border: 'none', opacity: isPending ? 0.7 : 1 }}
              >
                {isPending ? 'Creando...' : 'Crear y editar ítems'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
