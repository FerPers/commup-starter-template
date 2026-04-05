'use client'

import { useState, useTransition, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { upsertResponse, signItr } from '@/app/actions/itr-instances'
import { createPunch } from '@/app/actions/punches'

// ── Types ─────────────────────────────────────────────────────────────

type ItrItemType = 'checkbox' | 'text' | 'number' | 'measurement' | 'select' | 'photo' | 'signature' | 'date' | 'yes_no'

type Item = {
  id: string
  item_number: string | null
  description: string
  description_es: string | null
  item_type: ItrItemType
  is_critical: boolean
  is_required: boolean
  requires_photo: boolean
  requires_measurement: boolean
  acceptance_min: number | null
  acceptance_max: number | null
  acceptance_text: string | null
  unit: string | null
  options: string[] | null
  order_index: number
}

type Section = {
  id: string
  title: string
  order_index: number
  itr_template_items: Item[]
}

type Response = {
  id: string
  item_id: string
  value_text: string | null
  value_numeric: number | null
  value_bool: boolean | null
  value_option: string | null
  remarks: string | null
  is_passed: boolean | null
  responded_at: string | null
}

type Signature = {
  id: string
  role: string
  signed_at: string
  user_id: string
}

type ItrData = {
  id: string
  itr_number: string
  status: string
  progress_pct: number
  scheduled_date: string | null
  template_id: string
  project_id: string
  tag_id: string | null
  itr_templates: {
    id: string
    code: string
    title: string
    itr_template_sections: Section[]
  } | null
  tags: { id: string; tag_number: string; description: string; disciplines: { code: string; name: string; color: string } } | null
  project_phases: { code: string; name: string; color: string } | null
  itr_assignments: Array<{ id: string; user_id: string; role: string; profiles: { full_name: string } | null }>
  itr_responses: Response[]
  itr_signatures: Signature[]
}

// ── Status config ─────────────────────────────────────────────────────

const ITR_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  not_started: { label: 'Sin iniciar', color: '#64748b', bg: '#f1f5f9' },
  in_progress:  { label: 'En progreso', color: '#3b82f6', bg: '#eff6ff' },
  completed:    { label: 'Completado',  color: '#10b981', bg: '#ecfdf5' },
  approved:     { label: 'Aprobado',    color: '#7c3aed', bg: '#f5f3ff' },
  rejected:     { label: 'Rechazado',   color: '#ef4444', bg: '#fee2e2' },
}

const ROLE_LABELS: Record<string, string> = {
  executor: 'Ejecutor',
  supervisor: 'Supervisor',
  client: 'Cliente',
}

// ── Helpers ───────────────────────────────────────────────────────────

function computeIsPassed(value: number, min: number | null, max: number | null): boolean | null {
  if (min === null && max === null) return null
  if (min !== null && value < min) return false
  if (max !== null && value > max) return false
  return true
}

// ── Main component ────────────────────────────────────────────────────

export default function ItrExecution({
  itr,
  projectId,
  tagId,
  currentUserId: _currentUserId,
  currentUserRole: _currentUserRole,
  canEdit,
}: {
  itr: ItrData
  projectId: string
  tagId: string
  currentUserId: string
  currentUserRole: string
  canEdit: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showSignModal, setShowSignModal] = useState(false)
  const [signRole, setSignRole] = useState<'executor' | 'supervisor' | 'client'>('executor')
  const [signError, setSignError] = useState<string | null>(null)
  const [showPunchModal, setShowPunchModal] = useState(false)
  const [punchItemDesc, setPunchItemDesc] = useState('')
  const [punchItrItemId, setPunchItrItemId] = useState<string | null>(null)
  const savingRef = useRef(false)

  const template = itr.itr_templates
  const tag = itr.tags
  const phase = itr.project_phases
  const st = ITR_STATUS[itr.status] ?? ITR_STATUS.not_started

  // Build response lookup by item_id
  const [responses, setResponses] = useState<Record<string, Response>>(() => {
    const map: Record<string, Response> = {}
    for (const r of itr.itr_responses) map[r.item_id] = r
    return map
  })

  // Sorted sections + items
  const sections = template?.itr_template_sections
    .slice()
    .sort((a, b) => a.order_index - b.order_index)
    .map(s => ({
      ...s,
      itr_template_items: s.itr_template_items
        .slice()
        .sort((a, b) => a.order_index - b.order_index),
    })) ?? []

  const allItems = sections.flatMap(s => s.itr_template_items)
  const criticalBlocked = allItems.filter(
    item => item.is_critical && responses[item.id]?.is_passed === false,
  )
  const executor = itr.itr_assignments.find(a => a.role === 'executor')

  // ── Auto-save ───────────────────────────────────────────────────────

  const saveResponse = useCallback((
    itemId: string,
    data: {
      valueText?: string | null
      valueNumeric?: number | null
      valueBool?: boolean | null
      valueOption?: string | null
      remarks?: string | null
      isPassed?: boolean | null
    },
  ) => {
    setSaveError(null)
    setResponses(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? { id: '', item_id: itemId, responded_at: null }), ...data },
    }))
    if (savingRef.current) return
    savingRef.current = true
    startTransition(async () => {
      const res = await upsertResponse({
        itrId: itr.id,
        itemId,
        templateId: itr.template_id,
        ...data,
      })
      savingRef.current = false
      if (res.error) { setSaveError(res.error); return }
      setLastSaved(new Date())
      router.refresh()
    })
  }, [itr.id, itr.template_id, router])

  // ── Sign ────────────────────────────────────────────────────────────

  function handleSign() {
    setSignError(null)
    startTransition(async () => {
      const res = await signItr(itr.id, signRole, projectId, tagId)
      if (res.error) { setSignError(res.error); return }
      setShowSignModal(false)
      router.refresh()
    })
  }

  // ── Punch ────────────────────────────────────────────────────────────

  function openPunchModal(itemDesc: string, itemId: string | null = null) {
    setPunchItemDesc(itemDesc)
    setPunchItrItemId(itemId)
    setShowPunchModal(true)
  }

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '100px' }}>

      {/* Back nav */}
      <div style={{ padding: '20px 20px 0' }}>
        <a href={`/projects/${projectId}/tags/${tagId}`} style={{ fontSize: '13px', color: '#64748b', textDecoration: 'none' }}>
          ← {tag?.tag_number} / ITRs
        </a>
      </div>

      {/* Header card */}
      <div style={{ margin: '16px 20px 0', background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              {phase && (
                <span style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, background: `${phase.color}18`, color: phase.color }}>
                  {phase.code}
                </span>
              )}
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', fontFamily: 'ui-monospace, monospace' }}>
                {itr.itr_number}
              </span>
            </div>
            {template && (
              <div style={{ fontSize: '13px', color: '#475569' }}>{template.title}</div>
            )}
          </div>
          <span style={{ padding: '4px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, background: st.bg, color: st.color, whiteSpace: 'nowrap' }}>
            {st.label}
          </span>
        </div>

        {/* Tag info row */}
        {tag && (
          <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#64748b', flexWrap: 'wrap' }}>
            <span>
              <strong style={{ color: '#374151' }}>Tag:</strong>{' '}
              <span style={{ fontFamily: 'ui-monospace, monospace', color: tag.disciplines?.color ?? '#374151' }}>{tag.tag_number}</span>
              {' — '}{tag.description}
            </span>
            {executor?.profiles?.full_name && (
              <span><strong style={{ color: '#374151' }}>Inspector:</strong> {executor.profiles.full_name}</span>
            )}
            {itr.scheduled_date && (
              <span><strong style={{ color: '#374151' }}>Fecha:</strong> {itr.scheduled_date}</span>
            )}
          </div>
        )}

        {/* Progress bar */}
        <div style={{ marginTop: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginBottom: '5px' }}>
            <span>Progreso</span>
            <span>{itr.progress_pct}%</span>
          </div>
          <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${itr.progress_pct}%`, background: itr.progress_pct >= 100 ? '#10b981' : '#3b82f6', borderRadius: '4px', transition: 'width 0.4s' }} />
          </div>
        </div>

        {/* Signatures status */}
        <div style={{ marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {(['executor', 'supervisor', 'client'] as const).map(role => {
            const sig = itr.itr_signatures.find(s => s.role === role)
            return (
              <div key={role} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '7px', background: sig ? '#ecfdf5' : '#f8fafc', border: `1px solid ${sig ? '#a7f3d0' : '#e2e8f0'}` }}>
                <span style={{ fontSize: '12px' }}>{sig ? '✓' : '○'}</span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: sig ? '#10b981' : '#94a3b8' }}>{ROLE_LABELS[role]}</span>
                {sig && <span style={{ fontSize: '10px', color: '#64748b' }}>{sig.signed_at.split('T')[0]}</span>}
              </div>
            )
          })}
        </div>

        {/* Critical blockers warning */}
        {criticalBlocked.length > 0 && (
          <div style={{ marginTop: '12px', padding: '10px 14px', background: '#fee2e2', borderRadius: '8px', border: '1px solid #fecaca' }}>
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#ef4444', margin: '0 0 4px' }}>
              ⚠ {criticalBlocked.length} ítem{criticalBlocked.length > 1 ? 's' : ''} crítico{criticalBlocked.length > 1 ? 's' : ''} fuera de criterio — firma bloqueada
            </p>
            {criticalBlocked.map(item => (
              <p key={item.id} style={{ fontSize: '11px', color: '#7f1d1d', margin: '2px 0' }}>
                • {item.item_number ? `${item.item_number} ` : ''}{item.description}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* ── Sections + Items ─────────────────────────────────────────── */}
      <div style={{ padding: '0 20px' }}>
        {sections.map(section => (
          <div key={section.id} style={{ marginTop: '20px' }}>
            <div style={{ padding: '10px 16px', background: '#f8fafc', borderRadius: '8px', marginBottom: '8px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {section.title}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {section.itr_template_items.map(item => (
                <ItemRow
                  key={item.id}
                  item={item}
                  response={responses[item.id] ?? null}
                  canEdit={canEdit}
                  onSave={saveResponse}
                  onAddPunch={openPunchModal}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Sticky footer ──────────────────────────────────────────── */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1px solid #e2e8f0', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', zIndex: 100 }}>
        <div style={{ fontSize: '11px', color: isPending ? '#3b82f6' : lastSaved ? '#10b981' : '#94a3b8' }}>
          {isPending ? 'Guardando...' : saveError ? `⚠ ${saveError}` : lastSaved ? `Guardado ${lastSaved.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}` : 'Auto-guardado activo'}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => openPunchModal('')}
            style={{ padding: '9px 16px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', fontSize: '13px', color: '#c2410c', cursor: 'pointer', fontWeight: 600 }}
          >
            ⚑ Punch
          </button>
          <button
            disabled
            style={{ padding: '9px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#94a3b8', cursor: 'not-allowed' }}
            title="Próximamente"
          >
            📷 Foto
          </button>
          <button
            onClick={() => {
              const nextRole = (['executor', 'supervisor', 'client'] as const).find(
                r => !itr.itr_signatures.some(s => s.role === r),
              ) ?? 'executor'
              setSignRole(nextRole)
              setShowSignModal(true)
            }}
            disabled={!canEdit || itr.status === 'approved'}
            style={{ padding: '9px 20px', background: !canEdit || itr.status === 'approved' ? '#f8fafc' : '#7c3aed', color: !canEdit || itr.status === 'approved' ? '#94a3b8' : 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: !canEdit || itr.status === 'approved' ? 'not-allowed' : 'pointer' }}
          >
            ✍ Firmar
          </button>
        </div>
      </div>

      {/* ── Punch Modal ─────────────────────────────────────────────── */}
      {showPunchModal && (
        <CreatePunchModal
          itrId={itr.id}
          itrItemId={punchItrItemId}
          projectId={projectId}
          tagId={tagId}
          initialDescription={punchItemDesc}
          onClose={() => setShowPunchModal(false)}
          onCreated={() => { setShowPunchModal(false); router.refresh() }}
        />
      )}

      {/* ── Sign Modal ──────────────────────────────────────────────── */}
      {showSignModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setShowSignModal(false) }}
        >
          <div style={{ background: 'white', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>Firmar ITR</h2>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px' }}>{itr.itr_number}</p>

            {/* Role selector */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '8px' }}>Firmar como</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['executor', 'supervisor', 'client'] as const).map(role => {
                  const alreadySigned = itr.itr_signatures.some(s => s.role === role)
                  return (
                    <button
                      key={role}
                      onClick={() => !alreadySigned && setSignRole(role)}
                      disabled={alreadySigned}
                      style={{ flex: 1, padding: '10px 8px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, border: '2px solid', borderColor: signRole === role ? '#7c3aed' : '#e2e8f0', background: alreadySigned ? '#f8fafc' : signRole === role ? '#f5f3ff' : 'white', color: alreadySigned ? '#94a3b8' : signRole === role ? '#7c3aed' : '#374151', cursor: alreadySigned ? 'not-allowed' : 'pointer', textAlign: 'center' }}
                    >
                      {alreadySigned ? '✓ ' : ''}{ROLE_LABELS[role]}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Critical blocker warning */}
            {signRole === 'executor' && criticalBlocked.length > 0 && (
              <div style={{ padding: '10px 14px', background: '#fee2e2', borderRadius: '8px', marginBottom: '16px' }}>
                <p style={{ fontSize: '12px', color: '#ef4444', margin: 0, fontWeight: 600 }}>
                  No se puede firmar: {criticalBlocked.length} ítem{criticalBlocked.length > 1 ? 's' : ''} crítico{criticalBlocked.length > 1 ? 's' : ''} reprobado{criticalBlocked.length > 1 ? 's' : ''}.
                </p>
              </div>
            )}

            {signError && (
              <p style={{ fontSize: '12px', color: '#ef4444', padding: '8px 12px', background: '#fee2e2', borderRadius: '6px', margin: '0 0 16px' }}>
                {signError}
              </p>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowSignModal(false)}
                style={{ padding: '9px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#64748b', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSign}
                disabled={isPending || (signRole === 'executor' && criticalBlocked.length > 0)}
                style={{ padding: '9px 20px', background: isPending || (signRole === 'executor' && criticalBlocked.length > 0) ? '#ddd6fe' : '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                {isPending ? 'Firmando...' : 'Confirmar firma'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Create Punch Modal ────────────────────────────────────────────────

const CATEGORY_CONFIG = {
  A: { label: 'Cat A — Bloqueante', color: '#ef4444', bg: '#fee2e2', border: '#fecaca' },
  B: { label: 'Cat B — Transferible', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
  C: { label: 'Cat C — Menor',        color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
} as const

function CreatePunchModal({
  itrId,
  itrItemId: _itrItemId,
  projectId,
  tagId,
  initialDescription,
  onClose,
  onCreated,
}: {
  itrId: string
  itrItemId: string | null
  projectId: string
  tagId: string
  initialDescription: string
  onClose: () => void
  onCreated: () => void
}) {
  const [description, setDescription] = useState(initialDescription)
  const [category, setCategory] = useState<'A' | 'B' | 'C'>('B')
  const [targetDate, setTargetDate] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit() {
    if (!description.trim()) { setError('La descripción es requerida'); return }
    setError(null)
    startTransition(async () => {
      const res = await createPunch({
        projectId,
        tagId,
        itrId,
        category,
        description: description.trim(),
        targetDate: targetDate || null,
      })
      if (res.error) { setError(res.error); return }
      onCreated()
    })
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'white', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Registrar Punch</h2>
        <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 20px' }}>Se vinculará a este ITR y tag</p>

        {/* Category */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '8px' }}>Categoría</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['A', 'B', 'C'] as const).map(cat => {
              const cfg = CATEGORY_CONFIG[cat]
              const active = category === cat
              return (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  style={{ flex: 1, padding: '10px 8px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, border: `2px solid ${active ? cfg.color : '#e2e8f0'}`, background: active ? cfg.bg : 'white', color: active ? cfg.color : '#64748b', cursor: 'pointer', textAlign: 'center' }}
                >
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Description */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>Descripción</label>
          <textarea
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Describe la deficiencia o no-conformidad..."
            style={{ width: '100%', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>

        {/* Target date */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>Fecha límite (opcional)</label>
          <input
            type="date"
            value={targetDate}
            onChange={e => setTargetDate(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '13px' }}
          />
        </div>

        {error && (
          <p style={{ fontSize: '12px', color: '#ef4444', padding: '8px 12px', background: '#fee2e2', borderRadius: '6px', margin: '0 0 16px' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '9px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#64748b', cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            style={{ padding: '9px 20px', background: isPending ? '#fed7aa' : '#ea580c', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: isPending ? 'default' : 'pointer' }}
          >
            {isPending ? 'Registrando...' : '⚑ Registrar Punch'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Item Row ──────────────────────────────────────────────────────────

function ItemRow({
  item,
  response,
  canEdit,
  onSave,
  onAddPunch,
}: {
  item: Item
  response: Response | null
  canEdit: boolean
  onSave: (itemId: string, data: {
    valueText?: string | null
    valueNumeric?: number | null
    valueBool?: boolean | null
    valueOption?: string | null
    remarks?: string | null
    isPassed?: boolean | null
  }) => void
  onAddPunch: (itemDesc: string, itemId: string) => void
}) {
  const isPassed = response?.is_passed

  return (
    <div style={{ background: 'white', border: `1px solid ${isPassed === false ? '#fecaca' : '#e2e8f0'}`, borderRadius: '10px', padding: '14px 16px' }}>

      {/* Item header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: item.item_type === 'checkbox' || item.item_type === 'yes_no' ? '0' : '12px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {item.item_number && (
              <span style={{ fontSize: '11px', fontFamily: 'ui-monospace, monospace', color: '#94a3b8', minWidth: '28px' }}>{item.item_number}</span>
            )}
            <div style={{ display: 'flex', gap: '4px' }}>
              {item.is_critical && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', display: 'inline-block', flexShrink: 0, marginTop: '3px' }} title="Crítico" />}
              {item.is_required && !item.is_critical && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block', flexShrink: 0, marginTop: '3px' }} title="Requerido" />}
              {item.requires_photo && <span style={{ fontSize: '10px', color: '#3b82f6' }} title="Requiere foto">⊙</span>}
            </div>
          </div>
          <p style={{ fontSize: '13px', color: '#0f172a', margin: '2px 0 0', lineHeight: '1.4' }}>{item.description}</p>
          {item.description_es && (
            <p style={{ fontSize: '11px', color: '#94a3b8', margin: '1px 0 0' }}>{item.description_es}</p>
          )}
        </div>

        {/* Add punch button */}
        <button
          onClick={() => onAddPunch(item.description, item.id)}
          title="Registrar punch en este ítem"
          style={{ flexShrink: 0, padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, color: '#c2410c', background: '#fff7ed', border: '1px solid #fed7aa', cursor: 'pointer', marginTop: '2px' }}
        >
          ⚑
        </button>

        {/* Inline input for checkbox / yes_no */}
        {item.item_type === 'checkbox' && (
          <input
            type="checkbox"
            checked={response?.value_bool ?? false}
            disabled={!canEdit}
            onChange={e => onSave(item.id, {
              valueBool: e.target.checked,
              isPassed: item.is_critical ? e.target.checked : null,
            })}
            style={{ width: '20px', height: '20px', cursor: canEdit ? 'pointer' : 'default', marginTop: '2px', flexShrink: 0 }}
          />
        )}

        {item.item_type === 'yes_no' && (
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            {[true, false].map(val => (
              <button
                key={String(val)}
                disabled={!canEdit}
                onClick={() => onSave(item.id, {
                  valueBool: val,
                  isPassed: item.is_critical ? val : null,
                })}
                style={{ padding: '6px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, border: '1.5px solid', borderColor: response?.value_bool === val ? (val ? '#10b981' : '#ef4444') : '#e2e8f0', background: response?.value_bool === val ? (val ? '#ecfdf5' : '#fee2e2') : 'white', color: response?.value_bool === val ? (val ? '#10b981' : '#ef4444') : '#64748b', cursor: canEdit ? 'pointer' : 'default' }}
              >
                {val ? 'SÍ' : 'NO'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Text input */}
      {item.item_type === 'text' && (
        <textarea
          rows={2}
          defaultValue={response?.value_text ?? ''}
          disabled={!canEdit}
          placeholder="Observaciones..."
          onBlur={e => onSave(item.id, { valueText: e.target.value || null })}
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
        />
      )}

      {/* Number input */}
      {item.item_type === 'number' && (
        <input
          type="number"
          defaultValue={response?.value_numeric ?? ''}
          disabled={!canEdit}
          onBlur={e => onSave(item.id, { valueNumeric: e.target.value !== '' ? Number(e.target.value) : null })}
          style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '13px', width: '160px' }}
        />
      )}

      {/* Measurement input */}
      {item.item_type === 'measurement' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              type="number"
              step="0.001"
              defaultValue={response?.value_numeric ?? ''}
              disabled={!canEdit}
              onBlur={e => {
                const val = e.target.value !== '' ? Number(e.target.value) : null
                const passed = val !== null ? computeIsPassed(val, item.acceptance_min, item.acceptance_max) : null
                onSave(item.id, { valueNumeric: val, isPassed: passed })
              }}
              style={{ padding: '8px 10px', border: `1px solid ${isPassed === false ? '#fca5a5' : '#e2e8f0'}`, borderRadius: '7px', fontSize: '13px', width: '140px' }}
            />
            {item.unit && <span style={{ fontSize: '12px', color: '#64748b' }}>{item.unit}</span>}
          </div>
          {(item.acceptance_min !== null || item.acceptance_max !== null) && (
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              Criterio: {item.acceptance_min !== null ? `≥ ${item.acceptance_min}` : ''}{item.acceptance_min !== null && item.acceptance_max !== null ? ' y ' : ''}{item.acceptance_max !== null ? `≤ ${item.acceptance_max}` : ''} {item.unit ?? ''}
            </span>
          )}
          {isPassed === true && <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 600 }}>✓ OK</span>}
          {isPassed === false && <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: 600 }}>✗ Fuera de rango</span>}
        </div>
      )}

      {/* Select */}
      {item.item_type === 'select' && (
        <select
          value={response?.value_option ?? ''}
          disabled={!canEdit}
          onChange={e => onSave(item.id, { valueOption: e.target.value || null })}
          style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '13px', background: 'white', fontFamily: 'inherit', minWidth: '200px' }}
        >
          <option value="">Seleccionar...</option>
          {(item.options ?? (item.acceptance_text ? item.acceptance_text.split(',').map(s => s.trim()) : [])).map((opt: string) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )}

      {/* Date */}
      {item.item_type === 'date' && (
        <input
          type="date"
          defaultValue={response?.value_text ?? ''}
          disabled={!canEdit}
          onBlur={e => onSave(item.id, { valueText: e.target.value || null })}
          style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '13px' }}
        />
      )}

      {/* Photo placeholder */}
      {item.item_type === 'photo' && (
        <button
          disabled
          style={{ padding: '8px 16px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '7px', fontSize: '12px', color: '#94a3b8', cursor: 'not-allowed' }}
        >
          📷 Agregar foto (próximamente)
        </button>
      )}

      {/* Remarks (for measurement + critical items) */}
      {(item.is_critical || item.item_type === 'measurement') && (
        <div style={{ marginTop: '8px' }}>
          <textarea
            rows={1}
            defaultValue={response?.remarks ?? ''}
            disabled={!canEdit}
            placeholder="Observaciones / comentarios..."
            onBlur={e => {
              onSave(item.id, {
                valueBool: response?.value_bool ?? null,
                valueNumeric: response?.value_numeric ?? null,
                valueText: response?.value_text ?? null,
                valueOption: response?.value_option ?? null,
                isPassed: response?.is_passed ?? null,
                remarks: e.target.value || null,
              })
            }}
            style={{ width: '100%', padding: '6px 10px', border: '1px solid #f1f5f9', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box', color: '#64748b' }}
          />
        </div>
      )}
    </div>
  )
}
