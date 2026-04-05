'use client'

import { useState, useTransition } from 'react'
import {
  createPhase, updatePhase, deletePhase,
  createDiscipline, updateDiscipline, deleteDiscipline,
} from '@/app/actions/config'

type Phase = { id: string; code: string; name: string; color: string; order_index: number; certificate_name: string | null }
type Discipline = { id: string; code: string; name: string; color: string }

const PRESET_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#64748b',
  '#0891b2', '#059669', '#d97706', '#7c3aed',
]

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
      {PRESET_COLORS.map(c => (
        <button
          key={c}
          onClick={() => onChange(c)}
          style={{
            width: 22, height: 22, borderRadius: '50%', background: c, border: 'none',
            cursor: 'pointer', flexShrink: 0,
            outline: value === c ? `2px solid ${c}` : 'none',
            outlineOffset: '2px',
          }}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        title="Color personalizado"
        style={{ width: 22, height: 22, border: 'none', borderRadius: '50%', padding: 0, cursor: 'pointer', background: 'none' }}
      />
    </div>
  )
}

// ── Phase row ──────────────────────────────────────────────────────────────

function PhaseRow({ phase, onSave, onDelete, isPending }: {
  phase: Phase
  onSave: (data: { code: string; name: string; color: string; certificateName: string }) => void
  onDelete: () => void
  isPending: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [code, setCode] = useState(phase.code)
  const [name, setName] = useState(phase.name)
  const [color, setColor] = useState(phase.color)
  const [certName, setCertName] = useState(phase.certificate_name ?? '')

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: phase.color, flexShrink: 0 }} />
        <span style={{ fontSize: '13px', fontWeight: 700, color: phase.color, minWidth: '32px' }}>{phase.code}</span>
        <span style={{ fontSize: '14px', color: '#0f172a', flex: 1 }}>{phase.name}</span>
        <span style={{ fontSize: '12px', color: '#94a3b8' }}>{phase.certificate_name ?? '—'}</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setEditing(true)} disabled={isPending} style={btnOutline}>Editar</button>
          <button onClick={onDelete} disabled={isPending} style={btnDanger}>Eliminar</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', background: '#fafbfc' }}>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <input value={code} onChange={e => setCode(e.target.value)} placeholder="Código (A, B...)" maxLength={8}
          style={{ ...inputStyle, width: '80px' }} />
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre de la fase"
          style={{ ...inputStyle, flex: '1 1 160px' }} />
        <input value={certName} onChange={e => setCertName(e.target.value)} placeholder="Nombre del certificado"
          style={{ ...inputStyle, flex: '1 1 180px' }} />
      </div>
      <ColorPicker value={color} onChange={setColor} />
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <button
          onClick={() => { onSave({ code, name, color, certificateName: certName }); setEditing(false) }}
          disabled={isPending || !code.trim() || !name.trim()}
          style={btnPrimary}
        >
          Guardar
        </button>
        <button onClick={() => setEditing(false)} style={btnOutline}>Cancelar</button>
      </div>
    </div>
  )
}

// ── Discipline row ─────────────────────────────────────────────────────────

function DisciplineRow({ disc, onSave, onDelete, isPending }: {
  disc: Discipline
  onSave: (data: { code: string; name: string; color: string }) => void
  onDelete: () => void
  isPending: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [code, setCode] = useState(disc.code)
  const [name, setName] = useState(disc.name)
  const [color, setColor] = useState(disc.color)

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
        <span style={{
          padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
          background: `${disc.color}18`, color: disc.color, border: `1px solid ${disc.color}30`,
        }}>
          {disc.code}
        </span>
        <span style={{ fontSize: '14px', color: '#0f172a', flex: 1 }}>{disc.name}</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setEditing(true)} disabled={isPending} style={btnOutline}>Editar</button>
          <button onClick={onDelete} disabled={isPending} style={btnDanger}>Eliminar</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', background: '#fafbfc' }}>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <input value={code} onChange={e => setCode(e.target.value)} placeholder="Código (MECH, ELEC...)" maxLength={10}
          style={{ ...inputStyle, width: '120px' }} />
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre"
          style={{ ...inputStyle, flex: '1 1 180px' }} />
      </div>
      <ColorPicker value={color} onChange={setColor} />
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <button
          onClick={() => { onSave({ code, name, color }); setEditing(false) }}
          disabled={isPending || !code.trim() || !name.trim()}
          style={btnPrimary}
        >
          Guardar
        </button>
        <button onClick={() => setEditing(false)} style={btnOutline}>Cancelar</button>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function OrgConfigView({
  phases: initialPhases,
  disciplines: initialDisciplines,
}: {
  phases: Phase[]
  disciplines: Discipline[]
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // New phase form
  const [newPhase, setNewPhase] = useState({ code: '', name: '', color: '#3b82f6', certName: '' })
  const [showNewPhase, setShowNewPhase] = useState(false)

  // New discipline form
  const [newDisc, setNewDisc] = useState({ code: '', name: '', color: '#10b981' })
  const [showNewDisc, setShowNewDisc] = useState(false)

  function act(fn: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) setError(res.error)
    })
  }

  return (
    <div style={{ padding: '32px' }}>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px', margin: 0 }}>
          Configuración de Organización
        </h1>
        <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0' }}>
          Fases, disciplinas y parámetros globales
        </p>
      </div>

      {error && (
        <div style={{ marginBottom: '20px', padding: '12px 16px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#dc2626', fontSize: '13px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

        {/* ── Phases ──────────────────────────────────────────── */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <h2 style={cardTitle}>Fases del Proyecto</h2>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>
                {initialPhases.length} fases configuradas
              </p>
            </div>
            <button onClick={() => setShowNewPhase(v => !v)} style={btnPrimary}>
              + Nueva fase
            </button>
          </div>

          {/* New phase form */}
          {showNewPhase && (
            <div style={{ padding: '14px 16px', background: '#f0f9ff', borderRadius: '10px', border: '1px solid #bae6fd', marginBottom: '12px' }}>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <input value={newPhase.code} onChange={e => setNewPhase(p => ({ ...p, code: e.target.value }))}
                  placeholder="Código (A, B, C...)" maxLength={8} style={{ ...inputStyle, width: '90px' }} />
                <input value={newPhase.name} onChange={e => setNewPhase(p => ({ ...p, name: e.target.value }))}
                  placeholder="Nombre" style={{ ...inputStyle, flex: '1 1 160px' }} />
                <input value={newPhase.certName} onChange={e => setNewPhase(p => ({ ...p, certName: e.target.value }))}
                  placeholder="Nombre certificado" style={{ ...inputStyle, flex: '1 1 160px' }} />
              </div>
              <ColorPicker value={newPhase.color} onChange={c => setNewPhase(p => ({ ...p, color: c }))} />
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button
                  disabled={isPending || !newPhase.code.trim() || !newPhase.name.trim()}
                  onClick={() => act(async () => {
                    const res = await createPhase({ code: newPhase.code, name: newPhase.name, color: newPhase.color, certificateName: newPhase.certName })
                    if (!res.error) { setNewPhase({ code: '', name: '', color: '#3b82f6', certName: '' }); setShowNewPhase(false) }
                    return res
                  })}
                  style={btnPrimary}
                >
                  {isPending ? 'Guardando…' : 'Crear fase'}
                </button>
                <button onClick={() => setShowNewPhase(false)} style={btnOutline}>Cancelar</button>
              </div>
            </div>
          )}

          <div style={{ border: '1px solid #f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
            {initialPhases.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                No hay fases. Agrega la primera.
              </div>
            ) : (
              initialPhases.map(phase => (
                <PhaseRow
                  key={phase.id}
                  phase={phase}
                  isPending={isPending}
                  onSave={data => act(() => updatePhase({ phaseId: phase.id, ...data }))}
                  onDelete={() => act(() => deletePhase(phase.id))}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Disciplines ──────────────────────────────────────── */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <h2 style={cardTitle}>Disciplinas</h2>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>
                {initialDisciplines.length} disciplinas configuradas
              </p>
            </div>
            <button onClick={() => setShowNewDisc(v => !v)} style={btnPrimary}>
              + Nueva disciplina
            </button>
          </div>

          {/* New discipline form */}
          {showNewDisc && (
            <div style={{ padding: '14px 16px', background: '#f0fdf4', borderRadius: '10px', border: '1px solid #bbf7d0', marginBottom: '12px' }}>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <input value={newDisc.code} onChange={e => setNewDisc(d => ({ ...d, code: e.target.value }))}
                  placeholder="Código (MECH, ELEC...)" maxLength={10} style={{ ...inputStyle, width: '130px' }} />
                <input value={newDisc.name} onChange={e => setNewDisc(d => ({ ...d, name: e.target.value }))}
                  placeholder="Nombre" style={{ ...inputStyle, flex: '1 1 160px' }} />
              </div>
              <ColorPicker value={newDisc.color} onChange={c => setNewDisc(d => ({ ...d, color: c }))} />
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button
                  disabled={isPending || !newDisc.code.trim() || !newDisc.name.trim()}
                  onClick={() => act(async () => {
                    const res = await createDiscipline(newDisc)
                    if (!res.error) { setNewDisc({ code: '', name: '', color: '#10b981' }); setShowNewDisc(false) }
                    return res
                  })}
                  style={btnPrimary}
                >
                  {isPending ? 'Guardando…' : 'Crear disciplina'}
                </button>
                <button onClick={() => setShowNewDisc(false)} style={btnOutline}>Cancelar</button>
              </div>
            </div>
          )}

          <div style={{ border: '1px solid #f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
            {initialDisciplines.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                No hay disciplinas. Agrega la primera.
              </div>
            ) : (
              initialDisciplines.map(disc => (
                <DisciplineRow
                  key={disc.id}
                  disc={disc}
                  isPending={isPending}
                  onSave={data => act(() => updateDiscipline({ disciplineId: disc.id, ...data }))}
                  onDelete={() => act(() => deleteDiscipline(disc.id))}
                />
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Shared styles ──────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: 'white', borderRadius: '14px', padding: '22px',
  border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
}

const cardTitle: React.CSSProperties = {
  fontSize: '15px', fontWeight: 600, color: '#0f172a', margin: 0,
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px',
  fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box',
}

const btnPrimary: React.CSSProperties = {
  padding: '7px 14px', background: '#3b82f6', color: 'white',
  border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
}

const btnOutline: React.CSSProperties = {
  padding: '7px 12px', background: 'white', border: '1px solid #e2e8f0',
  borderRadius: '7px', fontSize: '12px', color: '#475569', cursor: 'pointer',
}

const btnDanger: React.CSSProperties = {
  padding: '7px 12px', background: 'transparent', border: '1px solid #fca5a5',
  borderRadius: '7px', fontSize: '12px', color: '#ef4444', cursor: 'pointer',
}
