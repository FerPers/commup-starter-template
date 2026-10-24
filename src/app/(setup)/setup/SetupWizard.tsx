'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { completeSetup, createProject } from '@/app/actions/setup'
import { alpha } from '@/lib/theme'

// ── Helpers ───────────────────────────────────────────────────

function toSlug(name: string) {
  return name.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ── Default data ──────────────────────────────────────────────

const DEFAULT_PHASES = [
  { code: 'A', name: 'Mechanical Completion', order_index: 1, color: 'var(--primary-500)', certificate_name: 'MC' },
  { code: 'B', name: 'Pre-Commissioning',     order_index: 2, color: 'var(--warning-500)', certificate_name: 'RFPC' },
  { code: 'C', name: 'Commissioning',          order_index: 3, color: 'var(--success-500)', certificate_name: 'RFC' },
  // Start-Up no es una 4ª letra de ITR: son pruebas de desempeño ligadas al RFSU.
  // La letra D queda reservada para Decomisionamiento (se crea desde Admin → Config cuando toque).
  { code: 'SU', name: 'Start-Up / Puesta en marcha', order_index: 4, color: 'var(--violet-500)', certificate_name: 'RFSU' },
]

// All known disciplines from industry reference (ITR catalog)
const ALL_DISCIPLINES = [
  { code: 'ARCH',   name: 'Architectural',     color: 'var(--accent-500)', phases: ['A'] },
  { code: 'DRILL',  name: 'Drilling',           color: 'var(--warning-800)', phases: ['A'] },
  { code: 'ELEC',   name: 'Electrical',         color: 'var(--warning-500)', phases: ['A','B','C'] },
  { code: 'HVAC',   name: 'HVAC',               color: 'var(--cyan-500)', phases: ['A','B','C'] },
  { code: 'INST',   name: 'Instruments',        color: 'var(--success-500)', phases: ['A','B','C'] },
  { code: 'MECH',   name: 'Mechanical',         color: 'var(--primary-500)', phases: ['A','B','C'] },
  { code: 'PIPE',   name: 'Piping',             color: 'var(--orange-500)', phases: ['A'] },
  { code: 'PROC',   name: 'Process',            color: 'var(--teal-500)', phases: ['B','C'] },
  { code: 'SAFE',   name: 'Safety / Fire',      color: 'var(--danger-500)', phases: ['A','B','C'] },
  { code: 'STRUCT', name: 'Structural / Civil', color: '#6b7280', phases: ['A'] },
  { code: 'TELE',   name: 'Telecoms',           color: 'var(--violet-500)', phases: ['A','B','C'] },
]

// Default selected disciplines (most common for O&G projects)
const DEFAULT_SELECTED_CODES = ['ELEC', 'INST', 'MECH', 'PIPE', 'SAFE']

// ── Types ─────────────────────────────────────────────────────

interface Phase {
  code: string; name: string; order_index: number; color: string; certificate_name: string
}
interface Discipline {
  code: string; name: string; color: string
}

// ── Main Component ────────────────────────────────────────────

export default function SetupWizard({ isNewProject, orgDisciplines = [] }: {
  isNewProject: boolean
  /** R1: disciplinas de la org para el alcance del proyecto nuevo (modo «otro proyecto»). */
  orgDisciplines?: { id: string; code: string; name: string; color: string | null }[]
}) {
  const router = useRouter()
  const t = useTranslations('Setup')

  const uid = useId()
  const [step, setStep] = useState(isNewProject ? 2 : 1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1 — Organization + user profile (initial setup only)
  const [userFullName, setUserFullName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [orgSlug, setOrgSlug] = useState('')

  // Step 2 — Project
  const [projName, setProjName] = useState('')
  const [projCode, setProjCode] = useState('')
  const [projLocation, setProjLocation] = useState('')
  const [projClient, setProjClient] = useState('')
  const [projCountry, setProjCountry] = useState('')
  const [projRegion, setProjRegion] = useState('')
  const [projStart, setProjStart] = useState('')
  const [projEnd, setProjEnd] = useState('')
  // R1: alcance de disciplinas del proyecto nuevo (todas por defecto)
  const [scopeIds, setScopeIds] = useState<Set<string>>(() => new Set(orgDisciplines.map(d => d.id)))

  // Step 3 — Phases (initial setup only)
  const [phases, setPhases] = useState<Phase[]>(DEFAULT_PHASES)

  // Step 4 — Disciplines (initial setup only)
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

    try {
      if (isNewProject) {
        const result = await createProject({
          name: projName, code: projCode,
          location: projLocation, client: projClient,
          country: projCountry, region: projRegion,
          start_date: projStart, end_date: projEnd,
          ...(orgDisciplines.length > 0 ? { disciplineIds: [...scopeIds] } : {}),
        })
        if (result.error) {
          setError(result.error)
          setLoading(false)
        } else {
          router.push(`/projects/${result.project_id}`)
        }
      } else {
        const result = await completeSetup({
          userFullName,
          org: { name: orgName, slug: orgSlug },
          project: { name: projName, code: projCode, location: projLocation, client: projClient, country: projCountry, region: projRegion, start_date: projStart, end_date: projEnd },
          phases,
          disciplines,
        })
        if (result.error) {
          setError(result.error)
          setLoading(false)
        } else {
          router.push(`/projects/${result.project_id}`)
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('unknownError')
      setError(t('errorDetail', { msg }))
      setLoading(false)
    }
  }

  // ── Progress bar ───────────────────────────────────────────

  const steps = isNewProject
    ? [t('steps.project')]
    : [t('steps.org'), t('steps.project'), t('steps.phases'), t('steps.disciplines')]

  const canNext1 = userFullName.trim().length > 2 && orgName.trim().length > 2 && orgSlug.trim().length > 2
  const canNext2 = projName.trim().length > 2 && projCode.trim().length > 0

  // In new project mode, step 2 is the only step — submit directly
  const isLastStep = isNewProject ? true : step === 4

  return (
    <div style={{ width: '100%', maxWidth: '560px' }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '52px', height: '52px', borderRadius: '14px',
          background: 'linear-gradient(135deg, var(--primary-500), var(--solid-primary-700))',
          marginBottom: '16px',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" stroke="white" strokeWidth="2"/>
          </svg>
        </div>
        <h1 style={{ color: 'white', fontSize: '24px', fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.5px' }}>
          {isNewProject ? t('newProjectTitle') : t('title')}
        </h1>
        <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>
          {isNewProject ? t('newProjectSubtitle') : t('subtitle')}
        </p>
      </div>

      {/* Progress steps */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '28px', gap: '0' }}>
        {steps.map((label, i) => {
          const n = isNewProject ? i + 2 : i + 1   // new project starts at step 2
          const done = step > n
          const active = step === n
          return (
            <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              {i > 0 && (
                <div style={{
                  position: 'absolute', left: '-50%', top: '14px', width: '100%', height: '2px',
                  background: done || active ? 'var(--primary-500)' : 'var(--gray-800)',
                  zIndex: 0,
                }} />
              )}
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', zIndex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? 'var(--primary-500)' : active ? 'var(--solid-primary-700)' : 'var(--gray-800)',
                border: `2px solid ${done || active ? 'var(--primary-500)' : 'var(--gray-700)'}`,
                fontSize: '12px', fontWeight: 600,
                color: done || active ? 'white' : '#475569',
              }}>
                {done ? '✓' : n}
              </div>
              <span style={{ fontSize: '12px', color: active ? 'var(--primary-400)' : done ? 'var(--primary-500)' : '#475569', marginTop: '6px', fontWeight: active ? 600 : 400 }}>
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
            <h2 style={stepTitleStyle}>{t('org.title')}</h2>
            <p style={stepDescStyle}>{t('org.desc')}</p>

            <label htmlFor={`${uid}-org-fullName`} style={labelStyle}>{t('org.fullName')}</label>
            <input id={`${uid}-org-fullName`}
              style={inputStyle}
              placeholder={t('org.fullNamePh')}
              value={userFullName}
              onChange={e => setUserFullName(e.target.value)}
              autoComplete="name"
            />

            <label htmlFor={`${uid}-org-name`} style={labelStyle}>{t('org.name')}</label>
            <input id={`${uid}-org-name`}
              style={inputStyle}
              placeholder={t('org.namePh')}
              value={orgName}
              onChange={e => {
                setOrgName(e.target.value)
                setOrgSlug(toSlug(e.target.value))
              }}
            />

            <label htmlFor={`${uid}-org-slug`} style={labelStyle}>{t('org.slug')}</label>
            <input id={`${uid}-org-slug`}
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '13px' }}
              placeholder="tecna-ingenieria"
              value={orgSlug}
              onChange={e => setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            />
            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
              {t('org.slugHint')}
            </p>
          </div>
        )}

        {/* ── Step 2: Project ── */}
        {step === 2 && (
          <div>
            <h2 style={stepTitleStyle}>{isNewProject ? t('project.titleNew') : t('project.title')}</h2>
            <p style={stepDescStyle}>{t('project.desc')}</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '12px' }}>
              <div>
                <label htmlFor={`${uid}-project-name`} style={labelStyle}>{t('project.name')}</label>
                <input id={`${uid}-project-name`} style={inputStyle} placeholder={t('project.namePh')} value={projName} onChange={e => setProjName(e.target.value)} />
              </div>
              <div>
                <label htmlFor={`${uid}-project-code`} style={labelStyle}>{t('project.code')}</label>
                <input id={`${uid}-project-code`} style={{ ...inputStyle, textTransform: 'uppercase' }} placeholder="GLP-P2" value={projCode} onChange={e => setProjCode(e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label htmlFor={`${uid}-project-location`} style={labelStyle}>{t('project.location')}</label>
                <input id={`${uid}-project-location`} style={inputStyle} placeholder={t('project.locationPh')} value={projLocation} onChange={e => setProjLocation(e.target.value)} />
              </div>
              <div>
                <label htmlFor={`${uid}-project-client`} style={labelStyle}>{t('project.client')}</label>
                <input id={`${uid}-project-client`} style={inputStyle} placeholder={t('project.clientPh')} value={projClient} onChange={e => setProjClient(e.target.value)} />
              </div>
            </div>

            {/* País / Región: jerarquía corporativa (País → Región → Campo). El proyecto es el Campo. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label htmlFor={`${uid}-project-country`} style={labelStyle}>{t('project.country')}</label>
                <input id={`${uid}-project-country`} style={inputStyle} placeholder={t('project.countryPh')} value={projCountry} onChange={e => setProjCountry(e.target.value)} />
              </div>
              <div>
                <label htmlFor={`${uid}-project-region`} style={labelStyle}>{t('project.region')}</label>
                <input id={`${uid}-project-region`} style={inputStyle} placeholder={t('project.regionPh')} value={projRegion} onChange={e => setProjRegion(e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label htmlFor={`${uid}-project-start`} style={labelStyle}>{t('project.start')}</label>
                <input id={`${uid}-project-start`} style={inputStyle} type="date" value={projStart} onChange={e => setProjStart(e.target.value)} />
              </div>
              <div>
                <label htmlFor={`${uid}-project-end`} style={labelStyle}>{t('project.end')}</label>
                <input id={`${uid}-project-end`} style={inputStyle} type="date" value={projEnd} onChange={e => setProjEnd(e.target.value)} />
              </div>
            </div>

            {isNewProject && orgDisciplines.length > 0 && (
              <fieldset style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', margin: '4px 0 0' }}>
                <legend style={{ ...labelStyle, padding: '0 6px' }}>{t('project.scope', { count: scopeIds.size, total: orgDisciplines.length })}</legend>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.45 }}>{t('project.scopeHint')}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 4 }}>
                  {orgDisciplines.map(d => (
                    <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 36, fontSize: 13, color: 'var(--text-strong)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={scopeIds.has(d.id)} style={{ width: 18, height: 18 }}
                        onChange={() => setScopeIds(prev => { const n = new Set(prev); if (n.has(d.id)) n.delete(d.id); else n.add(d.id); return n })} />
                      <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: d.color ?? 'var(--gray-400)' }} />
                      {d.name} <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.code}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
        )}

        {/* ── Step 3: Phases ── */}
        {step === 3 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={stepTitleStyle}>{t('phases.title')}</h2>
                <p style={stepDescStyle}>{t('phases.desc')}</p>
              </div>
              <button
                onClick={() => setPhases(DEFAULT_PHASES)}
                style={{ fontSize: '12px', color: 'var(--primary-500)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', flexShrink: 0, marginTop: '2px' }}
              >
                ↺ {t('phases.reset')}
              </button>
            </div>

            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '32px 40px 1fr 90px 36px 56px', gap: '6px', padding: '0 4px', marginBottom: '4px' }}>
              {['', t('phases.col.code'), t('phases.col.name'), t('phases.col.certificate'), t('phases.col.color'), ''].map((h, i) => (
                <span key={i} style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>{h}</span>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {phases.map((phase, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '32px 40px 1fr 90px 36px 56px',
                  gap: '6px', alignItems: 'center',
                  padding: '8px 4px',
                  borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc',
                }}>
                  {/* Reorder arrows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', alignItems: 'center' }}>
                    <button onClick={() => movePhase(i, -1)} disabled={i === 0}
                      style={{ ...arrowBtn, opacity: i === 0 ? 0.2 : 1 }}>▲</button>
                    <button onClick={() => movePhase(i, 1)} disabled={i === phases.length - 1}
                      style={{ ...arrowBtn, opacity: i === phases.length - 1 ? 0.2 : 1 }}>▼</button>
                  </div>
                  <input
                    style={{ ...inputSmall, fontWeight: 700, textAlign: 'center', textTransform: 'uppercase' }}
                    value={phase.code}
                    onChange={e => updatePhase(i, 'code', e.target.value)}
                  />
                  <input style={inputSmall} value={phase.name} onChange={e => updatePhase(i, 'name', e.target.value)} placeholder={t('phases.namePh')} />
                  <input style={inputSmall} value={phase.certificate_name} onChange={e => updatePhase(i, 'certificate_name', e.target.value)} placeholder={t('phases.col.certificate')} />
                  <input type="color" value={phase.color} onChange={e => updatePhase(i, 'color', e.target.value)}
                    style={{ width: '32px', height: '30px', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: 0 }} />
                  <button onClick={() => removePhase(i)} aria-label={t('phases.remove')} style={removeBtn} title={t('phases.remove')}>×</button>
                </div>
              ))}
            </div>

            <button onClick={addPhase} style={addRowBtn}>{t('phases.add')}</button>
          </div>
        )}

        {/* ── Step 4: Disciplines ── */}
        {step === 4 && (
          <div>
            <h2 style={stepTitleStyle}>{t('disciplines.title')}</h2>
            <p style={stepDescStyle}>{t('disciplines.desc')}</p>

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
                        if (next.has(disc.code)) next.delete(disc.code); else next.add(disc.code)
                        return next
                      })
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                      border: `2px solid ${selected ? disc.color : '#e2e8f0'}`,
                      background: selected ? alpha(disc.color, 7) : '#f8fafc',
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
                        <span style={{ marginLeft: '6px', fontSize: '12px', color: '#94a3b8', fontWeight: 400 }}>
                          {disc.phases.map(p => t('disciplines.phase', { p })).join(' · ')}
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
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 4px' }}>{t('disciplines.custom')}</p>
                {customDiscs.map((disc, i) => (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '80px 1fr 36px 28px',
                    gap: '6px', alignItems: 'center',
                    padding: '8px 10px', background: '#f8fafc',
                    borderRadius: '8px', border: '1px solid #e2e8f0',
                  }}>
                    <input style={{ ...inputSmall, fontWeight: 700, textTransform: 'uppercase' }}
                      value={disc.code} onChange={e => updateDisc(i, 'code', e.target.value)} placeholder={t('disciplines.codePh')} />
                    <input style={inputSmall} value={disc.name} onChange={e => updateDisc(i, 'name', e.target.value)} placeholder={t('phases.col.name')} />
                    <input type="color" value={disc.color} onChange={e => updateDisc(i, 'color', e.target.value)}
                      style={{ width: '32px', height: '32px', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: 0 }} />
                    <button onClick={() => removeDisc(i)} aria-label={t('disciplines.remove')} style={removeBtn}>×</button>
                  </div>
                ))}
              </div>
            )}

            <button onClick={addDisc} style={addRowBtn}>{t('disciplines.add')}</button>

            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px' }}>
              {t('disciplines.selected', { count: disciplines.length })}
            </p>
          </div>
        )}

        {/* ── Navigation ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '28px', gap: '12px' }}>
          {step > (isNewProject ? 2 : 1) ? (
            <button onClick={() => setStep(s => s - 1)} style={btnSecondary}>← {t('back')}</button>
          ) : <div />}

          {!isLastStep ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={(step === 1 && !canNext1) || (step === 2 && !canNext2)}
              style={(step === 1 && !canNext1) || (step === 2 && !canNext2) ? btnDisabled : btnPrimary}
            >
              {t('next')} →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading || !canNext2}
              style={loading || !canNext2 ? btnDisabled : btnSuccess}
            >
              {loading ? t('creating') : isNewProject ? `✓ ${t('createProject')}` : `✓ ${t('finish')}`}
            </button>
          )}
        </div>

        {error && (
          <div style={{ marginTop: '12px', padding: '12px', background: 'var(--danger-50)', border: '1px solid var(--danger-200)', borderRadius: '8px', color: 'var(--danger-700)', fontSize: '13px' }}>
            {error}
          </div>
        )}
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
    const colors = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4']
    setPhases(prev => [...prev, { code: '', name: '', order_index: prev.length + 1, color: colors[prev.length % colors.length], certificate_name: '' }])
  }
  function movePhase(i: number, dir: -1 | 1) {
    setPhases(prev => {
      const arr = [...prev]
      const tmp = arr[i]; arr[i] = arr[i + dir]; arr[i + dir] = tmp
      return arr.map((p, idx) => ({ ...p, order_index: idx + 1 }))
    })
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
  border: '1px solid var(--gray-300)', fontSize: '14px', outline: 'none',
  background: 'white', boxSizing: 'border-box', color: '#0f172a',
}
const inputSmall: React.CSSProperties = {
  width: '100%', padding: '7px 8px', borderRadius: '6px',
  border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none',
  background: 'white', boxSizing: 'border-box', color: '#0f172a',
}
const btnPrimary: React.CSSProperties = {
  padding: '10px 24px', background: 'var(--primary-500)', color: 'white',
  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 500,
  cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  padding: '10px 24px', background: '#f1f5f9', color: '#475569',
  border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px',
  cursor: 'pointer',
}
const btnSuccess: React.CSSProperties = {
  padding: '10px 24px', background: 'var(--success-500)', color: 'white',
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
  background: 'var(--danger-100)', color: 'var(--danger-700)', fontSize: '18px', lineHeight: '1',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 0, fontWeight: 400,
}
const addRowBtn: React.CSSProperties = {
  marginTop: '10px', padding: '8px 14px', background: 'transparent',
  border: '1px dashed var(--gray-300)', borderRadius: '8px', fontSize: '13px',
  color: '#64748b', cursor: 'pointer', width: '100%',
}
const arrowBtn: React.CSSProperties = {
  width: '20px', height: '13px', border: 'none', background: 'transparent',
  cursor: 'pointer', fontSize: '12px', color: '#94a3b8', padding: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  lineHeight: '1',
}
