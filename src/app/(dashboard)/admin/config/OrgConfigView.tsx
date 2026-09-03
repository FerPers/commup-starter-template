'use client'

import { useState, useTransition, useRef } from 'react'
import { useTranslations } from 'next-intl'
import {
  createPhase, updatePhase, deletePhase,
  createDiscipline, updateDiscipline, deleteDiscipline,
  seedEquipmentTypes, createEquipmentType, updateEquipmentType, deleteEquipmentType,
  updateOrgProfile, uploadOrgLogo, setOrgTemplateCatalog, saveOrgGlossary,
} from '@/app/actions/config'
import { DEFAULT_ITR_GLOSSARY } from '@/lib/constants/itr-glossary'
import { EQUIPMENT_CATEGORIES } from '@/lib/equipment-types'

type Org = { id: string; name: string; logo_url: string | null }
type Phase = { id: string; code: string; name: string; color: string; order_index: number; certificate_name: string | null }
type Discipline = { id: string; code: string; name: string; color: string }
type EquipmentType = { id: string; code: string; name: string; category: string | null }
type Project = { id: string; name: string }

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
  const t = useTranslations('Config')
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
        <span style={{ fontSize: '14px', color: 'var(--text-strong)', flex: 1 }}>{phase.name}</span>
        <span style={{ fontSize: '12px', color: '#94a3b8' }}>{phase.certificate_name ?? '—'}</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setEditing(true)} disabled={isPending} style={btnOutline}>{t('phases.edit')}</button>
          <button onClick={onDelete} disabled={isPending} style={btnDanger}>{t('phases.delete')}</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', background: '#fafbfc' }}>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <input value={code} onChange={e => setCode(e.target.value)} placeholder={t('phases.codePh')} maxLength={8}
          style={{ ...inputStyle, width: '80px' }} />
        <input value={name} onChange={e => setName(e.target.value)} placeholder={t('phases.namePh')}
          style={{ ...inputStyle, flex: '1 1 160px' }} />
        <input value={certName} onChange={e => setCertName(e.target.value)} placeholder={t('phases.certPh')}
          style={{ ...inputStyle, flex: '1 1 180px' }} />
      </div>
      <ColorPicker value={color} onChange={setColor} />
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <button
          onClick={() => { onSave({ code, name, color, certificateName: certName }); setEditing(false) }}
          disabled={isPending || !code.trim() || !name.trim()}
          style={btnPrimary}
        >
          {isPending ? t('phases.saving') : t('phases.save')}
        </button>
        <button onClick={() => setEditing(false)} style={btnOutline}>{t('phases.cancel')}</button>
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
  const t = useTranslations('Config')
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
        <span style={{ fontSize: '14px', color: 'var(--text-strong)', flex: 1 }}>{disc.name}</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setEditing(true)} disabled={isPending} style={btnOutline}>{t('disciplines.edit')}</button>
          <button onClick={onDelete} disabled={isPending} style={btnDanger}>{t('disciplines.delete')}</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', background: '#fafbfc' }}>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <input value={code} onChange={e => setCode(e.target.value)} placeholder={t('disciplines.codePh')} maxLength={10}
          style={{ ...inputStyle, width: '120px' }} />
        <input value={name} onChange={e => setName(e.target.value)} placeholder={t('disciplines.namePh')}
          style={{ ...inputStyle, flex: '1 1 180px' }} />
      </div>
      <ColorPicker value={color} onChange={setColor} />
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <button
          onClick={() => { onSave({ code, name, color }); setEditing(false) }}
          disabled={isPending || !code.trim() || !name.trim()}
          style={btnPrimary}
        >
          {isPending ? t('disciplines.saving') : t('disciplines.save')}
        </button>
        <button onClick={() => setEditing(false)} style={btnOutline}>{t('disciplines.cancel')}</button>
      </div>
    </div>
  )
}

// ── Equipment type row ─────────────────────────────────────────────────────

function EquipmentTypeRow({ eqt, onSave, onDelete, isPending }: {
  eqt: EquipmentType
  onSave: (data: { code: string; name: string; category: string }) => void
  onDelete: () => void
  isPending: boolean
}) {
  const t = useTranslations('Config')
  const [editing, setEditing] = useState(false)
  const [code, setCode] = useState(eqt.code)
  const [name, setName] = useState(eqt.name)
  const [category, setCategory] = useState(eqt.category ?? '')

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 16px', borderBottom: '1px solid #f1f5f9' }}>
        <span style={{
          minWidth: '56px', textAlign: 'center', padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700,
          fontFamily: 'ui-monospace, monospace', background: 'var(--gray-100)', color: 'var(--text-strong)',
        }}>
          {eqt.code}
        </span>
        <span style={{ fontSize: '13px', color: 'var(--text-strong)', flex: 1 }}>{eqt.name}</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setEditing(true)} disabled={isPending} style={btnOutline}>{t('equipmentTypes.edit')}</button>
          <button onClick={onDelete} disabled={isPending} style={btnDanger}>{t('equipmentTypes.delete')}</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', background: '#fafbfc' }}>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <input value={code} onChange={e => setCode(e.target.value)} placeholder={t('equipmentTypes.codePh')} maxLength={12}
          style={{ ...inputStyle, width: '110px' }} />
        <input value={name} onChange={e => setName(e.target.value)} placeholder={t('equipmentTypes.namePh')}
          style={{ ...inputStyle, flex: '1 1 180px' }} />
        <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...inputStyle, width: '180px' }}>
          <option value="">{t('equipmentTypes.noCategory')}</option>
          {EQUIPMENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => { onSave({ code, name, category }); setEditing(false) }}
          disabled={isPending || !code.trim() || !name.trim()}
          style={btnPrimary}
        >
          {isPending ? t('equipmentTypes.saving') : t('equipmentTypes.save')}
        </button>
        <button onClick={() => setEditing(false)} style={btnOutline}>{t('equipmentTypes.cancel')}</button>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function OrgConfigView({
  org: initialOrg,
  phases: initialPhases,
  disciplines: initialDisciplines,
  equipmentTypes: initialEquipmentTypes,
  projects,
  isTemplateCatalog: initialIsCatalog,
  glossary: initialGlossary,
  isOwner,
}: {
  org: Org
  phases: Phase[]
  disciplines: Discipline[]
  equipmentTypes: EquipmentType[]
  projects: Project[]
  isTemplateCatalog: boolean
  glossary: string
  isOwner: boolean
}) {
  const t = useTranslations('Config')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Org profile state
  const [orgName, setOrgName] = useState(initialOrg.name)
  const [orgLogoUrl, setOrgLogoUrl] = useState(initialOrg.logo_url)
  const [orgSaveMsg, setOrgSaveMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [isCatalog, setIsCatalog] = useState(initialIsCatalog)
  const [catalogMsg, setCatalogMsg] = useState<string | null>(null)
  const [glossary, setGlossary] = useState(initialGlossary)
  const [glossaryMsg, setGlossaryMsg] = useState<string | null>(null)

  const [newPhase, setNewPhase] = useState({ code: '', name: '', color: '#3b82f6', certName: '' })
  const [showNewPhase, setShowNewPhase] = useState(false)

  const [newDisc, setNewDisc] = useState({ code: '', name: '', color: '#10b981' })

  const [showNewEqt, setShowNewEqt] = useState(false)

  const [newEqt, setNewEqt] = useState({ code: '', name: '', category: '' })

  const [seedMsg, setSeedMsg] = useState<string | null>(null)
  const [showNewDisc, setShowNewDisc] = useState(false)

  function act(fn: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) setError(res.error)
    })
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    startTransition(async () => {
      const res = await uploadOrgLogo(initialOrg.id, fd)
      if (res.error) setError(res.error)
      else if (res.url) setOrgLogoUrl(res.url)
    })
  }

  function handleToggleCatalog(value: boolean) {
    setCatalogMsg(null)
    setIsCatalog(value)
    startTransition(async () => {
      const res = await setOrgTemplateCatalog(value)
      if (res.error) {
        setError(res.error)
        setIsCatalog(!value)
      } else {
        setCatalogMsg(value
          ? 'Esta org ahora es catálogo público — sus templates son visibles a cualquier user de CommUp.'
          : 'Catálogo desactivado — los templates vuelven a ser solo de miembros.'
        )
      }
    })
  }

  async function handleSaveOrgProfile(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setOrgSaveMsg(null)
    startTransition(async () => {
      const res = await updateOrgProfile({ orgId: initialOrg.id, name: orgName, logoUrl: orgLogoUrl })
      if (res.error) setError(res.error)
      else setOrgSaveMsg(t('org.saved'))
    })
  }

  return (
    <div style={{ padding: '32px' }}>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-strong)', letterSpacing: '-0.5px', margin: 0 }}>
          {t('title')}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '4px 0 0' }}>
          {t('subtitle')}
        </p>
      </div>

      {error && (
        <div style={{ marginBottom: '20px', padding: '12px 16px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#dc2626', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* ── Org Profile ─────────────────────────────────────────── */}
      <div style={{ ...cardStyle, marginBottom: '24px' }}>
        <h2 style={{ ...cardTitle, marginBottom: '16px' }}>{t('org.title')}</h2>
        <form onSubmit={handleSaveOrgProfile}>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

            {/* Logo */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
              <div style={{
                width: 72, height: 72, borderRadius: '12px',
                border: '2px dashed #e2e8f0', background: 'var(--gray-50)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', flexShrink: 0,
              }}>
                {orgLogoUrl
                  // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage signed URL, no optimization benefit on Workers
                  ? <img src={orgLogoUrl} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  : <span style={{ fontSize: '24px', color: '#cbd5e1' }}>◈</span>
                }
              </div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={isPending}
                style={btnOutline}
              >
                {t('org.uploadLogo')}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleLogoUpload}
              />
            </div>

            {/* Name */}
            <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
                {t('org.namePh')}
              </label>
              <input
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                placeholder={t('org.namePh')}
                style={{ ...inputStyle, width: '100%' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                <button type="submit" disabled={isPending || !orgName.trim()} style={btnPrimary}>
                  {isPending ? t('org.saving') : t('org.save')}
                </button>
                {orgSaveMsg && (
                  <span style={{ fontSize: '12px', color: '#10b981' }}>{orgSaveMsg}</span>
                )}
              </div>
            </div>
          </div>
        </form>

        {/* ── Catálogo público de templates ─────────────────────── */}
        <div style={{
          marginTop: '24px',
          paddingTop: '20px',
          borderTop: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '4px' }}>
                Catálogo público de templates
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Si activas esta opción, los templates ITR, procedimientos de preservación y templates PSSR de
                esta org serán visibles a cualquier usuario autenticado de CommUp como banco de plantillas.
                Los demás usuarios podrán <strong>importar (clonar)</strong> tus templates a su org pero no
                modificar los originales. Solo el owner de la org puede activar este modo.
              </div>
            </div>
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: isOwner ? 'pointer' : 'not-allowed',
              fontSize: '13px', fontWeight: 600, color: isCatalog ? '#10b981' : 'var(--text-muted)',
              padding: '6px 12px', borderRadius: '999px',
              border: `1px solid ${isCatalog ? '#a7f3d0' : 'var(--border)'}`,
              background: isCatalog ? '#ecfdf5' : 'var(--card-bg)',
              opacity: isOwner ? 1 : 0.6, whiteSpace: 'nowrap',
            }}>
              <input
                type="checkbox"
                checked={isCatalog}
                disabled={!isOwner || isPending}
                onChange={e => handleToggleCatalog(e.target.checked)}
                style={{ cursor: isOwner ? 'pointer' : 'not-allowed' }}
              />
              {isCatalog ? 'Catálogo activo' : 'Activar catálogo'}
            </label>
          </div>
          {!isOwner && (
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '8px 0 0', fontStyle: 'italic' }}>
              Solo el owner de la org puede modificar este flag.
            </p>
          )}
          {catalogMsg && (
            <p style={{ fontSize: '12px', color: '#10b981', margin: '8px 0 0' }}>{catalogMsg}</p>
          )}

          {/* ── Glosario de traducción ITR ── */}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: '18px', paddingTop: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '4px' }}>
              Glosario de traducción de ITRs (inglés → español)
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '10px' }}>
              La IA respeta estos términos al traducir plantillas. Una línea por término, formato <code>inglés = español</code>. Vacío = glosario estándar de CommUp.
            </div>
            <textarea
              value={glossary}
              onChange={e => setGlossary(e.target.value)}
              placeholder={DEFAULT_ITR_GLOSSARY.split('\n').slice(0, 6).join('\n') + '\n…'}
              rows={8}
              spellCheck={false}
              style={{ ...inputStyle, width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: '12px', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
              <button
                disabled={isPending}
                onClick={() => act(async () => { const r = await saveOrgGlossary(glossary); if (!r.error) setGlossaryMsg('Glosario guardado'); return r })}
                style={btnPrimary}
              >
                Guardar glosario
              </button>
              <button onClick={() => setGlossary(DEFAULT_ITR_GLOSSARY)} style={btnOutline}>Cargar glosario estándar</button>
              {glossaryMsg && <span style={{ fontSize: '12px', color: '#10b981' }}>{glossaryMsg}</span>}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

        {/* ── Phases ──────────────────────────────────────────── */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <h2 style={cardTitle}>{t('phases.title')}</h2>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>
                {t('phases.subtitle', { count: initialPhases.length })}
              </p>
            </div>
            <button onClick={() => setShowNewPhase(v => !v)} style={btnPrimary}>
              {t('phases.newBtn')}
            </button>
          </div>

          {showNewPhase && (
            <div style={{ padding: '14px 16px', background: '#f0f9ff', borderRadius: '10px', border: '1px solid #bae6fd', marginBottom: '12px' }}>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <input value={newPhase.code} onChange={e => setNewPhase(p => ({ ...p, code: e.target.value }))}
                  placeholder={t('phases.codePh')} maxLength={8} style={{ ...inputStyle, width: '90px' }} />
                <input value={newPhase.name} onChange={e => setNewPhase(p => ({ ...p, name: e.target.value }))}
                  placeholder={t('phases.namePh')} style={{ ...inputStyle, flex: '1 1 160px' }} />
                <input value={newPhase.certName} onChange={e => setNewPhase(p => ({ ...p, certName: e.target.value }))}
                  placeholder={t('phases.certPh')} style={{ ...inputStyle, flex: '1 1 160px' }} />
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
                  {isPending ? t('phases.saving') : t('phases.create')}
                </button>
                <button onClick={() => setShowNewPhase(false)} style={btnOutline}>{t('phases.cancel')}</button>
              </div>
            </div>
          )}

          <div style={{ border: '1px solid #f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
            {initialPhases.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                {t('phases.empty')}
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
              <h2 style={cardTitle}>{t('disciplines.title')}</h2>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>
                {t('disciplines.subtitle', { count: initialDisciplines.length })}
              </p>
            </div>
            <button onClick={() => setShowNewDisc(v => !v)} style={btnPrimary}>
              {t('disciplines.newBtn')}
            </button>
          </div>

          {showNewDisc && (
            <div style={{ padding: '14px 16px', background: '#f0fdf4', borderRadius: '10px', border: '1px solid #bbf7d0', marginBottom: '12px' }}>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <input value={newDisc.code} onChange={e => setNewDisc(d => ({ ...d, code: e.target.value }))}
                  placeholder={t('disciplines.codePh')} maxLength={10} style={{ ...inputStyle, width: '130px' }} />
                <input value={newDisc.name} onChange={e => setNewDisc(d => ({ ...d, name: e.target.value }))}
                  placeholder={t('disciplines.namePh')} style={{ ...inputStyle, flex: '1 1 160px' }} />
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
                  {isPending ? t('disciplines.saving') : t('disciplines.create')}
                </button>
                <button onClick={() => setShowNewDisc(false)} style={btnOutline}>{t('disciplines.cancel')}</button>
              </div>
            </div>
          )}

          <div style={{ border: '1px solid #f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
            {initialDisciplines.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                {t('disciplines.empty')}
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

        {/* ── Equipment types ──────────────────────────────────── */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', gap: '8px', flexWrap: 'wrap' }}>
            <div>
              <h2 style={cardTitle}>{t('equipmentTypes.title')}</h2>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>
                {t('equipmentTypes.subtitle', { count: initialEquipmentTypes.length })}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                disabled={isPending}
                onClick={() => act(async () => {
                  const res = await seedEquipmentTypes()
                  if (!res.error) setSeedMsg(t('equipmentTypes.seeded', { count: res.created ?? 0 }))
                  return res
                })}
                style={btnOutline}
                title={t('equipmentTypes.seedHint')}
              >
                {t('equipmentTypes.seedBtn')}
              </button>
              <button onClick={() => setShowNewEqt(v => !v)} style={btnPrimary}>
                {t('equipmentTypes.newBtn')}
              </button>
            </div>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px' }}>{t('equipmentTypes.help')}</p>
          {seedMsg && <p style={{ fontSize: '12px', color: '#10b981', margin: '0 0 10px' }}>{seedMsg}</p>}

          {showNewEqt && (
            <div style={{ padding: '14px 16px', background: '#f0fdf4', borderRadius: '10px', border: '1px solid #bbf7d0', marginBottom: '12px' }}>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <input value={newEqt.code} onChange={e => setNewEqt(d => ({ ...d, code: e.target.value }))}
                  placeholder={t('equipmentTypes.codePh')} maxLength={12} style={{ ...inputStyle, width: '110px' }} />
                <input value={newEqt.name} onChange={e => setNewEqt(d => ({ ...d, name: e.target.value }))}
                  placeholder={t('equipmentTypes.namePh')} style={{ ...inputStyle, flex: '1 1 160px' }} />
                <select value={newEqt.category} onChange={e => setNewEqt(d => ({ ...d, category: e.target.value }))} style={{ ...inputStyle, width: '180px' }}>
                  <option value="">{t('equipmentTypes.noCategory')}</option>
                  {EQUIPMENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  disabled={isPending || !newEqt.code.trim() || !newEqt.name.trim()}
                  onClick={() => act(async () => {
                    const res = await createEquipmentType(newEqt)
                    if (!res.error) { setNewEqt({ code: '', name: '', category: '' }); setShowNewEqt(false) }
                    return res
                  })}
                  style={btnPrimary}
                >
                  {isPending ? t('equipmentTypes.saving') : t('equipmentTypes.create')}
                </button>
                <button onClick={() => setShowNewEqt(false)} style={btnOutline}>{t('equipmentTypes.cancel')}</button>
              </div>
            </div>
          )}

          <div style={{ border: '1px solid #f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
            {initialEquipmentTypes.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                {t('equipmentTypes.empty')}
              </div>
            ) : (
              [...new Set(initialEquipmentTypes.map(e => e.category ?? ''))].map(cat => (
                <div key={cat || '__none'}>
                  <div style={{ padding: '6px 16px', background: 'var(--gray-50)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9' }}>
                    {cat || t('equipmentTypes.noCategory')}
                  </div>
                  {initialEquipmentTypes.filter(e => (e.category ?? '') === cat).map(eqt => (
                    <EquipmentTypeRow
                      key={eqt.id}
                      eqt={eqt}
                      isPending={isPending}
                      onSave={data => act(() => updateEquipmentType({ equipmentTypeId: eqt.id, ...data }))}
                      onDelete={() => act(() => deleteEquipmentType(eqt.id))}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* ── Data Export ─────────────────────────────────────────── */}
      <ExportSection projects={projects} t={t} />

    </div>
  )
}

// ── Export Section ─────────────────────────────────────────────────────────

function ExportSection({ projects, t }: { projects: Project[]; t: (key: string) => string }) {
  const [selectedProject, setSelectedProject] = useState(projects[0]?.id ?? '')
  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    if (!selectedProject) return
    setExporting(true)
    try {
      const res = await fetch(`/api/admin/export?projectId=${selectedProject}`)
      if (!res.ok) {
        const err = await res.json() as { error?: string }
        alert(err.error ?? 'Export failed')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] ?? 'export.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div style={{ ...cardStyle, marginTop: '24px' }}>
      <h2 style={{ ...cardTitle, marginBottom: '4px' }}>{t('export.title')}</h2>
      <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 16px' }}>
        {t('export.subtitle')}
      </p>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={selectedProject}
          onChange={e => setSelectedProject(e.target.value)}
          style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-strong)', background: 'var(--card-bg)', minWidth: '200px' }}
        >
          {projects.length === 0 && <option value="">{t('export.noProjects')}</option>}
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button
          onClick={handleExport}
          disabled={exporting || !selectedProject}
          style={{ ...btnPrimary, background: '#10b981', opacity: exporting || !selectedProject ? 0.6 : 1 }}
        >
          {exporting ? t('export.exporting') : t('export.btn')}
        </button>
      </div>
    </div>
  )
}

// ── Shared styles ──────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: 'var(--card-bg)', borderRadius: '14px', padding: '22px',
  border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
}

const cardTitle: React.CSSProperties = {
  fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)', margin: 0,
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px',
  fontSize: '13px', color: 'var(--text-strong)', background: 'var(--card-bg)', boxSizing: 'border-box',
}

const btnPrimary: React.CSSProperties = {
  padding: '7px 14px', background: '#3b82f6', color: 'white',
  border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
}

const btnOutline: React.CSSProperties = {
  padding: '7px 12px', background: 'var(--card-bg)', border: '1px solid var(--border)',
  borderRadius: '7px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer',
}

const btnDanger: React.CSSProperties = {
  padding: '7px 12px', background: 'transparent', border: '1px solid #fca5a5',
  borderRadius: '7px', fontSize: '12px', color: '#ef4444', cursor: 'pointer',
}