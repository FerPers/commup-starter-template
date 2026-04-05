'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  createPreservationRecord,
  upsertRecordResponse,
  finalizeRecord,
} from '@/app/actions/preservation'

// ── Types ──────────────────────────────────────────────────────

interface ProcItem {
  id: string
  label: string
  item_type: string
  unit: string | null
  min_value: number | null
  max_value: number | null
  is_critical: boolean
  is_required: boolean
}

interface Procedure {
  id: string
  code: string
  title: string
  frequency: string
  interval_days: number
  requires_photo: boolean
  requires_signature: boolean
  disciplines: { code: string; color: string } | null
  preservation_procedure_items: ProcItem[]
}

interface RecordResponse {
  id: string
  item_id: string
  value_bool: boolean | null
  value_numeric: number | null
  value_text: string | null
  is_passed: boolean | null
}

interface OpenRecord {
  id: string
  result: string
  remarks: string | null
  punch_raised: boolean
  preservation_record_responses: RecordResponse[]
}

interface HistoryRecord {
  id: string
  performed_at: string
  result: string
  remarks: string | null
  punch_raised: boolean
  profiles: { full_name: string } | null
}

interface Plan {
  id: string
  status: string
  start_date: string
  next_due_date: string
  last_performed_date: string | null
  tags: { id: string; tag_number: string; description: string } | null
}

interface Props {
  plan: Plan
  procedure: Procedure
  openRecord: OpenRecord | null
  history: HistoryRecord[]
  projectId: string
  tagId: string
}

// ── Config ─────────────────────────────────────────────────────

const FREQ_LABELS: Record<string, string> = {
  daily: 'Diario', weekly: 'Semanal', biweekly: 'Quincenal',
  monthly: 'Mensual', quarterly: 'Trimestral',
}

const RESULT_CFG = {
  ok:  { label: 'OK — Conforme',     color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
  nok: { label: 'NOK — No conforme', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
  na:  { label: 'N/A — No aplica',   color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
}

// ── Helpers ─────────────────────────────────────────────────────

function isPassed(item: ProcItem, numVal: number | null): boolean | null {
  if (!['measurement', 'number'].includes(item.item_type)) return null
  if (numVal === null) return null
  const minOk = item.min_value === null || numVal >= item.min_value
  const maxOk = item.max_value === null || numVal <= item.max_value
  return minOk && maxOk
}

export default function PreservationExecution({
  plan, procedure, openRecord, history, projectId, tagId,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Active record ID (created on first response)
  const [recordId, setRecordId] = useState<string | null>(openRecord?.id ?? null)

  // Responses map: item_id → { bool, numeric, text, passed }
  const [responses, setResponses] = useState<Record<string, {
    bool?: boolean; numeric?: string; text?: string; passed?: boolean | null
  }>>(() => {
    const map: Record<string, { bool?: boolean; numeric?: string; text?: string; passed?: boolean | null }> = {}
    if (openRecord) {
      for (const r of openRecord.preservation_record_responses) {
        map[r.item_id] = {
          bool:    r.value_bool ?? undefined,
          numeric: r.value_numeric != null ? String(r.value_numeric) : undefined,
          text:    r.value_text ?? undefined,
          passed:  r.is_passed,
        }
      }
    }
    return map
  })

  const [result, setResult] = useState<'ok' | 'nok' | 'na'>(
    (openRecord?.result as 'ok' | 'nok' | 'na') ?? 'ok'
  )
  const [remarks, setRemarks] = useState(openRecord?.remarks ?? '')
  const [raisePunch, setRaisePunch] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const items = procedure.preservation_procedure_items

  // Auto-derive result from critical items
  useEffect(() => {
    const hasCriticalFail = items
      .filter(i => i.is_critical)
      .some(i => {
        const r = responses[i.id]
        if (!r) return false
        if (i.item_type === 'yes_no' && r.bool === false) return true
        if (i.item_type === 'checkbox' && r.bool === false) return true
        if (['measurement', 'number'].includes(i.item_type)) {
          const num = r.numeric !== undefined ? parseFloat(r.numeric) : null
          return isPassed(i, num) === false
        }
        return false
      })
    if (hasCriticalFail) setResult('nok')
  }, [responses, items])

  async function ensureRecord(): Promise<string | null> {
    if (recordId) return recordId
    const res = await createPreservationRecord({
      planId: plan.id,
      tagId,
      projectId,
      result: 'ok',
    })
    if (res.error || !res.data) return null
    setRecordId(res.data.id)
    return res.data.id
  }

  async function handleResponse(item: ProcItem, update: { bool?: boolean; numeric?: string; text?: string }) {
    const rId = await ensureRecord()
    if (!rId) return

    const prev = responses[item.id] ?? {}
    const merged = { ...prev, ...update }
    setResponses(r => ({ ...r, [item.id]: merged }))

    const numVal = merged.numeric !== undefined ? parseFloat(merged.numeric) : null
    const passed = isPassed(item, isNaN(numVal!) ? null : numVal)

    startTransition(async () => {
      await upsertRecordResponse({
        recordId: rId,
        itemId: item.id,
        valueBool: item.item_type === 'checkbox' || item.item_type === 'yes_no'
          ? merged.bool : undefined,
        valueNumeric: ['measurement', 'number'].includes(item.item_type)
          ? (isNaN(numVal!) ? undefined : numVal!)
          : undefined,
        valueText: item.item_type === 'text' ? merged.text : undefined,
        isPassed: passed ?? undefined,
        projectId,
        tagId,
      })
    })
  }

  async function handleFinalize() {
    const rId = await ensureRecord()
    if (!rId) { setSubmitError('Error al crear el registro'); return }

    // Check required items
    const missing = items.filter(i => i.is_required && !responses[i.id])
    if (missing.length > 0) {
      setSubmitError(`Faltan ${missing.length} ítem(s) requerido(s): ${missing.map(i => i.label).slice(0, 2).join(', ')}…`)
      return
    }

    setSubmitError(null)
    startTransition(async () => {
      const res = await finalizeRecord({
        recordId: rId,
        planId: plan.id,
        result,
        remarks: remarks || undefined,
        raisePunch,
        projectId,
        tagId,
      })
      if (res.error) { setSubmitError(res.error); return }
      setSaved(true)
      setTimeout(() => router.push(`/projects/${projectId}/tags/${tagId}`), 1500)
    })
  }

  const completedCount = items.filter(i => responses[i.id]).length
  const progressPct = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 100
  const tag = plan.tags

  if (saved) {
    return (
      <div style={{ padding: '48px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>✓</div>
        <div style={{ fontSize: '20px', fontWeight: 700, color: '#16a34a', marginBottom: '8px' }}>
          Registro guardado correctamente
        </div>
        <div style={{ fontSize: '14px', color: '#64748b' }}>Redirigiendo al tag…</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px', maxWidth: '800px' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <button
          onClick={() => router.push(`/projects/${projectId}/tags/${tagId}`)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: '14px', fontWeight: 500, padding: 0 }}
        >
          {tag?.tag_number}
        </button>
        <span style={{ color: '#94a3b8' }}>›</span>
        <span style={{ fontSize: '14px', color: '#64748b' }}>Preservación</span>
        <span style={{ color: '#94a3b8' }}>›</span>
        <span style={{ fontSize: '14px', color: '#374151', fontWeight: 600 }}>{procedure.code}</span>
      </div>

      {/* Header */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '3px' }}>
              {procedure.code} — {FREQ_LABELS[procedure.frequency] ?? procedure.frequency} · {procedure.interval_days}d
            </div>
            <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>
              {procedure.title}
            </h1>
            <div style={{ fontSize: '13px', color: '#64748b' }}>
              Tag: <strong>{tag?.tag_number}</strong>{tag?.description ? ` — ${tag.description}` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>Próximo vencimiento</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{plan.next_due_date}</div>
          </div>
        </div>

        {/* Progress bar */}
        {items.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', color: '#64748b' }}>Progreso del check sheet</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#374151' }}>{completedCount}/{items.length} ítems</span>
            </div>
            <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: progressPct === 100 ? '#16a34a' : '#3b82f6', width: `${progressPct}%`, transition: 'width 0.3s', borderRadius: '3px' }} />
            </div>
          </div>
        )}
      </div>

      {/* Check sheet items */}
      {items.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '12px' }}>
            Check Sheet
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {items.map((item, idx) => {
              const r = responses[item.id]
              const numVal = r?.numeric !== undefined ? parseFloat(r.numeric) : null
              const passed = isPassed(item, isNaN(numVal!) ? null : numVal)
              const hasResponse = !!r

              return (
                <div
                  key={item.id}
                  style={{
                    background: 'white', border: '1px solid',
                    borderColor: item.is_critical && hasResponse && passed === false ? '#fca5a5'
                      : hasResponse ? '#bbf7d0' : '#e2e8f0',
                    borderRadius: '10px', padding: '14px 16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#64748b', flexShrink: 0, marginTop: '1px' }}>
                      {idx + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>{item.label}</span>
                        {item.is_critical && (
                          <span style={{ padding: '1px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 700, background: '#fef2f2', color: '#dc2626' }}>CRÍTICO</span>
                        )}
                        {!item.is_required && (
                          <span style={{ padding: '1px 6px', borderRadius: '10px', fontSize: '10px', color: '#94a3b8', background: '#f1f5f9' }}>Opcional</span>
                        )}
                      </div>

                      {/* checkbox */}
                      {item.item_type === 'checkbox' && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => handleResponse(item, { bool: true })}
                            style={{ padding: '6px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: '2px solid', borderColor: r?.bool === true ? '#16a34a' : '#e2e8f0', background: r?.bool === true ? '#f0fdf4' : 'white', color: r?.bool === true ? '#16a34a' : '#64748b' }}
                          >✓ Conforme</button>
                          <button
                            onClick={() => handleResponse(item, { bool: false })}
                            style={{ padding: '6px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: '2px solid', borderColor: r?.bool === false ? '#dc2626' : '#e2e8f0', background: r?.bool === false ? '#fef2f2' : 'white', color: r?.bool === false ? '#dc2626' : '#64748b' }}
                          >✕ No conforme</button>
                        </div>
                      )}

                      {/* yes_no */}
                      {item.item_type === 'yes_no' && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => handleResponse(item, { bool: true })}
                            style={{ padding: '6px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', border: '2px solid', borderColor: r?.bool === true ? '#16a34a' : '#e2e8f0', background: r?.bool === true ? '#f0fdf4' : 'white', color: r?.bool === true ? '#16a34a' : '#64748b' }}
                          >Sí</button>
                          <button
                            onClick={() => handleResponse(item, { bool: false })}
                            style={{ padding: '6px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', border: '2px solid', borderColor: r?.bool === false ? '#dc2626' : '#e2e8f0', background: r?.bool === false ? '#fef2f2' : 'white', color: r?.bool === false ? '#dc2626' : '#64748b' }}
                          >No</button>
                        </div>
                      )}

                      {/* measurement / number */}
                      {['measurement', 'number'].includes(item.item_type) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <input
                            type="number"
                            value={r?.numeric ?? ''}
                            onChange={e => handleResponse(item, { numeric: e.target.value })}
                            placeholder="Ingresar valor"
                            style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', width: '140px' }}
                          />
                          {item.unit && <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>{item.unit}</span>}
                          {item.min_value != null && <span style={{ fontSize: '12px', color: '#94a3b8' }}>Min: {item.min_value}</span>}
                          {item.max_value != null && <span style={{ fontSize: '12px', color: '#94a3b8' }}>Máx: {item.max_value}</span>}
                          {passed !== null && r?.numeric !== undefined && r.numeric !== '' && (
                            <span style={{ padding: '3px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, background: passed ? '#f0fdf4' : '#fef2f2', color: passed ? '#16a34a' : '#dc2626' }}>
                              {passed ? '✓ En rango' : '✕ Fuera de rango'}
                            </span>
                          )}
                        </div>
                      )}

                      {/* text */}
                      {item.item_type === 'text' && (
                        <textarea
                          value={r?.text ?? ''}
                          onChange={e => handleResponse(item, { text: e.target.value })}
                          onBlur={e => handleResponse(item, { text: e.target.value })}
                          rows={2}
                          placeholder="Ingresar observación..."
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Result + finalize */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '14px' }}>
          Resultado de la ejecución
        </h2>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {(['ok', 'nok', 'na'] as const).map(r => {
            const cfg = RESULT_CFG[r]
            return (
              <button
                key={r}
                onClick={() => setResult(r)}
                style={{
                  padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '14px',
                  cursor: 'pointer', border: '2px solid',
                  borderColor: result === r ? cfg.border : '#e2e8f0',
                  background: result === r ? cfg.bg : 'white',
                  color: result === r ? cfg.color : '#64748b',
                }}
              >
                {cfg.label}
              </button>
            )
          })}
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '5px' }}>
            Observaciones / Notas
          </label>
          <textarea
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            rows={3}
            placeholder="Notas del técnico, condiciones encontradas, acciones tomadas..."
            style={{ width: '100%', padding: '9px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>

        {result === 'nok' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '14px', padding: '10px 14px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
            <input
              type="checkbox"
              checked={raisePunch}
              onChange={e => setRaisePunch(e.target.checked)}
              style={{ width: '16px', height: '16px' }}
            />
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#dc2626' }}>Levantar Punch por anomalía</span>
              <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '1px' }}>
                Crea un punch Cat A/B en el Punch List de este tag
              </div>
            </div>
          </label>
        )}

        {submitError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' }}>
            {submitError}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={() => router.push(`/projects/${projectId}/tags/${tagId}`)}
            style={{ padding: '10px 20px', borderRadius: '9px', background: '#f1f5f9', color: '#64748b', fontWeight: 600, fontSize: '14px', cursor: 'pointer', border: 'none' }}
          >
            Cancelar
          </button>
          <button
            onClick={handleFinalize}
            disabled={isPending}
            style={{ padding: '10px 24px', borderRadius: '9px', background: result === 'nok' ? '#dc2626' : '#16a34a', color: 'white', fontWeight: 700, fontSize: '14px', cursor: isPending ? 'wait' : 'pointer', border: 'none', opacity: isPending ? 0.7 : 1 }}
          >
            {isPending ? 'Guardando...' : 'Confirmar ejecución'}
          </button>
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '12px' }}>
            Historial reciente
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {history.map(rec => {
              const cfg = RESULT_CFG[rec.result as keyof typeof RESULT_CFG] ?? RESULT_CFG.na
              return (
                <div key={rec.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '9px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ fontSize: '13px', color: '#374151', fontWeight: 600 }}>
                      {new Date(rec.performed_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                    {rec.profiles && (
                      <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: '10px' }}>
                        {rec.profiles.full_name}
                      </span>
                    )}
                    {rec.remarks && (
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>{rec.remarks}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {rec.punch_raised && (
                      <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, background: '#fef2f2', color: '#dc2626' }}>Punch levantado</span>
                    )}
                    <span style={{ padding: '3px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, background: cfg.bg, color: cfg.color }}>
                      {cfg.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
