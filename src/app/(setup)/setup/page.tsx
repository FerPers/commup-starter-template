'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { completeSetup } from '@/app/actions/setup'

// ── Helpers ───────────────────────────────────────────────────

function toSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// ── Default data ──────────────────────────────────────────────

const DEFAULT_PHASES = [
  { code: 'A', name: 'Mechanical Completion', order_index: 1, color: '#3b82f6', certificate_name: 'MC' },
  { code: 'B', name: 'Pre-Commissioning',     order_index: 2, color: '#f59e0b', certificate_name: 'RFPC' },
  { code: 'C', name: 'Commissioning',          order_index: 3, color: '#10b981', certificate_name: 'RFC' },
  { code: 'D', name: 'Start-Up / Operations',  order_index: 4, color: '#8b5cf6', certificate_name: 'RFSU' },
]

// All known disciplines from industry reference (ITR catalog)
const ALL_DISCIPLINES = [
  { code: 'ARCH',   name: 'Architectural',     color: '#a855f7', phases: ['A'] },
  { code: 'DRILL',  name: 'Drilling',           color: '#92400e', phases: ['A'] },
  { code: 'ELEC',   name: 'Electrical',         color: '#f59e0b', phases: ['A','B','C'] },
  { code: 'HVAC',   name: 'HVAC',               color: '#06b6d4', phases: ['A','B','C'] },
  { code: 'INST',   name: 'Instruments',        color: '#10b981', phases: ['A','B','C'] },
  { code: 'MECH',   name: 'Mechanical',         color: '#3b82f6', phases: ['A','B','C'] },
  { code: 'PIPE',   name: 'Piping',             color: '#f97316', phases: ['A'] },
  { code: 'PROC',   name: 'Process',            color: '#14b8a6', phases: ['B','C'] },
  { code: 'SAFE',   name: 'Safety / Fire',      color: '#ef4444', phases: ['A','B','C'] },
  { code: 'STRUCT', name: 'Structural / Civil', color: '#6b7280', phases: ['A'] },
  { code: 'TELE',   name: 'Telecoms',           color: '#8b5cf6', phases: ['A','B','C'] },
]

// Default selected disciplines (most common for O&G projects)
const DEFAULT_SELECTED_CODES = ['ELEC', 'INST', 'MECH', 'PIPE', 'SAFE']

const DEFAULT_DISCIPLINES = ALL_DISCIPLINES
  .filter(d => DEFAULT_SELECTED_CODES.includes(d.code))
  .map(({ phases: _phases, ...d }) => d)

// ── Types ─────────────────────────────────────────────────────

interface Phase {
  code: string; name: string; order_index: number; color: string; certificate_name: string
}
interface Discipline {
  code: string; name: string; color: string
}

// ── Main Component ────────────────────────────────────────────

export default function SetupPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1 — Organization
  const [orgName, setOrgName] = useState('')
  const [orgSlug, setOrgSlug] = useState('')

  // Step 2 — Project
  const [projName, setProjName] = useState('')
  const [projCode, setProjCode] = useState('')
  const [projLocation, setProjLocation] = useState('')
  const [projClient, setProjClient] = useState('')
  const [projStart, setProjStart] = useState('')
  const [projEnd, setProjEnd] = useState('')

  // Step 3 — Phases
  const [phases, setPhases] = useState<Phase[]>(DEFAULT_PHASES)

  // Step 4 — Disciplines (selected codes from the full catalog)
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set(DEFAULT_SELECTED_CODES))
  const [customDiscs, setCustomDiscs] = useState<Discipline[]>([])

  // Derived: disciplines to submit = selected from catalog + custom
  const disciplines: Discipline[] = [
    ...ALL_DISCIPLINES.filter(d => selectedCodes.has(d.code)).map(({ phases: _p, ...d }) => d),
    ...customDiscs,
  ]

  // ── Submit ─────────────────────────────────────────────────

  async function handleSubmit() {
    setLoading(true)
    setError(null)
    const result = await completeSetup({
      org: { name: orgName, slug: orgSlug },
      project: { name: projName, code: projCode, location: projLocation, client: projClient, start_date: projStart, end_date: projEnd },
      phases,
      disciplines,
    })
    if (result.error) {
      setError(result.error)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  // ── Progress bar ───────────────────────────────────────────

  const steps = ['Organización', 'Proyecto', 'Fases', 'Disciplinas']
  const canNext1 = orgName.trim().length > 2 && orgSlug.trim().length > 2
  const canNext2 = projName.trim().length > 2 && projCode.trim().length > 0

  return (
    <div style={{ width: '100%', maxWidth: '560px' }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '52px', height: '52px', borderRadius: '14px',
          background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
          marginBottom: '16px',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" stroke="white" strokeWidth="2"/>
          </svg>
        </div>
        <h1 style={{ color: 'white', fontSize: '24px', fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.5px' }}>
          Configuración inicial
        </h1>
        <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>
          Configura tu organización y primer proyecto
        </p>
      </div>

      {/* Progress steps */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '28px', gap: '0' }}>
        {steps.map((label, i) => {
          const n = i + 1
          const done = step > n
          const active = step === n
          return (
            <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              {i > 0 && (
                <div style={{
                  position: 'absolute', left: '-50%', top: '14px', width: '100%', height: '2px',
                  background: done || active ? '#3b82f6' : '#1e293b',
                  zIndex: 0,
                }} />
              )}
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', zIndex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? '#3b82f6' : active ? '#1d4ed8' : '#1e293b',
                border: `2px solid ${done || active ? '#3b82f6' : '#334155'}`,
                fontSize: '12px', fontWeight: 600,
                color: done || active ? 'white' : '#475569',
              }}>
                {done ? '✓' : n}
              </div>
              <span style={{ fontSize: '11px', color: active ? '#60a5fa' : done ? '#3b82f6' : '#475569', marginTop: '6px', fontWeight: active ? 600 : 400 }}>
                {label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Card */}
      <div style={{
        background: 'white', borderRadius: '16px', padding: '32px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>

        {/* ── Step 1: Organization ── */}
        {step === 1 && (
          <div>
            <h2 style={stepTitleStyle}>Tu organización</h2>
            <p style={stepDescStyle}>La organización agrupa todos tus proyectos y usuarios.</p>

            <label style={labelStyle}>Nombre de la organización *</label>
            <input
              style={inputStyle}
              placeholder="Ej: Tecna Ingeniería"
              value={orgName}
              onChange={e => {
                setOrgName(e.target.value)
                setOrgSlug(toSlug(e.target.value))
              }}
            />

            <label style={labelStyle}>Identificador (slug) *</label>
            <input
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '13px' }}
              placeholder="tecna-ingenieria"
              value={orgSlug}
              onChange={e => setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            />
            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
              Solo letras minúsculas, números y guiones. Se usa en URLs.
            </p>
          </div>
        )}

        {/* ── Step 2: Project ── */}
        {step === 2 && (
          <div>
            <h2 style={stepTitleStyle}>Primer proyecto</h2>
            <p style={stepDescStyle}>Define los datos básicos del proyecto de commissioning.</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Nombre del proyecto *</label>
                <input style={inputStyle} placeholder="Ej: Planta GLP - Fase 2" value={projName} onChange={e => setProjName(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Código *</label>
                <input style={{ ...inputStyle, textTransform: 'uppercase' }} placeholder="GLP-P2" value={projCode} onChange={e => setProjCode(e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Ubicación</label>
                <input style={inputStyle} placeholder="Ej: Maracaibo, Venezuela" value={projLocation} onChange={e => setProjLocation(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Cliente</label>
                <input style={inputStyle} placeholder="Ej: PDVSA Gas" value={projClient} onChange={e => setProjClient(e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Fecha de inicio</label>
                <input style={inputStyle} type="date" value={projStart} onChange={e => setProjStart(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Fecha objetivo</label>
                <input style={inputStyle} type="date" value={projEnd} onChange={e => setProjEnd(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Phases ── */}
        {step === 3 && (
          <div>
            <h2 style={stepTitleStyle}>Fases del proyecto</h2>
            <p style={stepDescStyle}>Las fases definen el ciclo de completamiento. Puedes editarlas o agregar las tuyas.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
              {phases.map((phase, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '40px 1fr 1fr 80px 32px',
                  gap: '8px', alignItems: 'center',
                  padding: '10px 12px', background: '#f8fafc',
                  borderRadius: '8px', border: '1px solid #e2e8f0',
                }}>
                  <input
                    style={{ ...inputSmall, fontWeight: 700, textAlign: 'center', textTransform: 'uppercase' }}
                    value={phase.code}
                    onChange={e => updatePhase(i, 'code', e.target.value)}
                  />
                  <input style={inputSmall} value={phase.name} onChange={e => updatePhase(i, 'name', e.target.value)} placeholder="Nombre de fase" />
                  <input style={inputSmall} value={phase.certificate_name} onChange={e => updatePhase(i, 'certificate_name', e.target.value)} placeholder="Certificado" />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input type="color" value={phase.color} onChange={e => updatePhase(i, 'color', e.target.value)}
                      style={{ width: '28px', height: '28px', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: 0 }} />
                  </div>
                  <button onClick={() => removePhase(i)} style={removeBtn} title="Eliminar">×</button>
                </div>
              ))}
            </div>

            <button onClick={addPhase} style={addRowBtn}>+ Agregar fase</button>
          </div>
        )}

        {/* ── Step 4: Disciplines ── */}
        {step === 4 && (
          <div>
            <h2 style={stepTitleStyle}>Disciplinas</h2>
            <p style={stepDescStyle}>Selecciona las disciplinas que aplican a este proyecto. Se usan para clasificar ITRs, tags y planes de trabajo.</p>

            {/* Catalog grid — toggle selection */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
              {ALL_DISCIPLINES.map(disc => {
                const selected = selectedCodes.has(disc.code)
                return (
                  <button
                    key={disc.code}
                    onClick={() => {
                      setSelectedCodes(prev => {
                        const next = new Set(prev)
                        next.has(disc.code) ? next.delete(disc.code) : next.add(disc.code)
                        return next
                      })
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                      border: `2px solid ${selected ? disc.color : '#e2e8f0'}`,
                      background: selected ? `${disc.color}12` : '#f8fafc',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
                      background: disc.color,
                      boxShadow: selected ? `0 0 6px ${disc.color}` : 'none',
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: selected ? '#0f172a' : '#475569' }}>
                        {disc.code}
                        <span style={{ marginLeft: '6px', fontSize: '10px', color: '#94a3b8', fontWeight: 400 }}>
                          {disc.phases.map(p => `Fase ${p}`).join(' · ')}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '1px' }}>{disc.name}</div>
                    </div>
                    {selected && <span style={{ color: disc.color, fontSize: '16px', flexShrink: 0 }}>✓</span>}
                  </button>
                )
              })}
            </div>

            {/* Custom disciplines */}
            {customDiscs.length > 0 && (
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 4px' }}>Disciplinas personalizadas</p>
                {customDiscs.map((disc, i) => (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '80px 1fr 36px 28px',
                    gap: '6px', alignItems: 'center',
                    padding: '8px 10px', background: '#f8fafc',
                    borderRadius: '8px', border: '1px solid #e2e8f0',
                  }}>
                    <input style={{ ...inputSmall, fontWeight: 700, textTransform: 'uppercase' }}
                      value={disc.code} onChange={e => updateDisc(i, 'code', e.target.value)} placeholder="COD" />
                    <input style={inputSmall} value={disc.name} onChange={e => updateDisc(i, 'name', e.target.value)} placeholder="Nombre" />
                    <input type="color" value={disc.color} onChange={e => updateDisc(i, 'color', e.target.value)}
                      style={{ width: '32px', height: '32px', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: 0 }} />
                    <button onClick={() => removeDisc(i)} style={removeBtn}>×</button>
                  </div>
                ))}
              </div>
            )}

            <button onClick={addDisc} style={addRowBtn}>+ Agregar disciplina personalizada</button>

            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px' }}>
              {disciplines.length} disciplina{disciplines.length !== 1 ? 's' : ''} seleccionada{disciplines.length !== 1 ? 's' : ''}
            </p>

            {error && (
              <div style={{ marginTop: '12px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '13px' }}>
                {error}
              </div>
            )}
          </div>
        )}

        {/* ── Navigation ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '28px', gap: '12px' }}>
          {step > 1 ? (
            <button onClick={() => setStep(s => s - 1)} style={btnSecondary}>← Anterior</button>
          ) : <div />}

          {step < 4 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={(step === 1 && !canNext1) || (step === 2 && !canNext2)}
              style={(step === 1 && !canNext1) || (step === 2 && !canNext2) ? btnDisabled : btnPrimary}
            >
              Siguiente →
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={loading} style={loading ? btnDisabled : btnSuccess}>
              {loading ? 'Creando...' : '✓ Completar configuración'}
            </button>
          )}
        </div>
      </div>
    </div>
  )

  // ── Helpers ──────────────────────────────────────────────

  function updatePhase(i: number, field: keyof Phase, value: string | number) {
    setPhases(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p))
  }
  function removePhase(i: number) {
    setPhases(prev => prev.filter((_, idx) => idx !== i).map((p, idx) => ({ ...p, order_index: idx + 1 })))
  }
  function addPhase() {
    setPhases(prev => [...prev, { code: '', name: '', order_index: prev.length + 1, color: '#64748b', certificate_name: '' }])
  }

  function updateDisc(i: number, field: keyof Discipline, value: string) {
    setCustomDiscs(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: value } : d))
  }
  function removeDisc(i: number) {
    setCustomDiscs(prev => prev.filter((_, idx) => idx !== i))
  }
  function addDisc() {
    setCustomDiscs(prev => [...prev, { code: '', name: '', color: '#64748b' }])
  }
}

// ── Shared styles ─────────────────────────────────────────────

const stepTitleStyle: React.CSSProperties = { fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }
const stepDescStyle: React.CSSProperties = { fontSize: '14px', color: '#64748b', margin: '0 0 20px' }
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px', marginTop: '14px' }
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: '8px',
  border: '1px solid #d1d5db', fontSize: '14px', outline: 'none',
  background: 'white', boxSizing: 'border-box', color: '#0f172a',
}
const inputSmall: React.CSSProperties = {
  width: '100%', padding: '7px 8px', borderRadius: '6px',
  border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none',
  background: 'white', boxSizing: 'border-box', color: '#0f172a',
}
const btnPrimary: React.CSSProperties = {
  padding: '10px 24px', background: '#3b82f6', color: 'white',
  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 500,
  cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  padding: '10px 24px', background: '#f1f5f9', color: '#475569',
  border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px',
  cursor: 'pointer',
}
const btnSuccess: React.CSSProperties = {
  padding: '10px 24px', background: '#10b981', color: 'white',
  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
  cursor: 'pointer',
}
const btnDisabled: React.CSSProperties = {
  padding: '10px 24px', background: '#e2e8f0', color: '#94a3b8',
  border: 'none', borderRadius: '8px', fontSize: '14px',
  cursor: 'not-allowed',
}
const removeBtn: React.CSSProperties = {
  width: '28px', height: '28px', borderRadius: '6px', border: 'none',
  background: '#fee2e2', color: '#dc2626', fontSize: '18px', lineHeight: '1',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 0, fontWeight: 400,
}
const addRowBtn: React.CSSProperties = {
  marginTop: '10px', padding: '8px 14px', background: 'transparent',
  border: '1px dashed #cbd5e1', borderRadius: '8px', fontSize: '13px',
  color: '#64748b', cursor: 'pointer', width: '100%',
}
