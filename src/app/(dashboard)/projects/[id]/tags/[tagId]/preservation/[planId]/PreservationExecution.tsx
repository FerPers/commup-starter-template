'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
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
  const t = useTranslations('PreservationExecution')
  const locale = useLocale()
  const [isPending, startTransition] = useTransition()

  // Frequency label map — keys resolved via i18n
  const FREQ_LABELS: Record<string, string> = {
    daily:     t('freqDaily'),
    weekly:    t('freqWeekly'),
    biweekly:  t('freqBiweekly'),
    monthly:   t('freqMonthly'),
    quarterly: t('freqQuarterly'),
  }

  // Result config — labels resolved via i18n
  const RESULT_CFG = {
    ok:  { label: t('resultOkLabel'),  color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
    nok: { label: t('resultNokLabel'), color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
    na:  { label: t('resultNaLabel'),  color: 'var(--text-muted)', bg: 'var(--gray-50)', border: 'var(--border)' },
  }

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
  // Once user picks a result manually, stop auto-deriving so we don't fight them
  const [resultOverridden, setResultOverridden] = useState(false)
  const [remarks, setRemarks] = useState(openRecord?.remarks ?? '')
  const [raisePunch, setRaisePunch] = useState(false)
  const [punchCategory, setPunchCategory] = useState<'A' | 'B' | 'C'>('B')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [savedPunchNumber, setSavedPunchNumber] = useState<string | null>(null)

  const items = procedure.preservation_procedure_items

  // Auto-derive result from critical items (bidirectional: nok ↔ ok)
  useEffect(() => {
    if (resultOverridden) return
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
    setResult(hasCriticalFail ? 'nok' : 'ok')
    if (!hasCriticalFail) setRaisePunch(false)
  }, [responses, items, resultOverridden])

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
    if (!rId) { setSubmitError(t('errCreateRecord')); return }

    // Check required items
    const missing = items.filter(i => i.is_required && !responses[i.id])
    if (missing.length > 0) {
      setSubmitError(t('errMissingItems', {
        count: missing.length,
        labels: missing.map(i => i.label).slice(0, 2).join(', '),
      }))
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
        punchCategory: raisePunch ? punchCategory : undefined,
        projectId,
        tagId,
      })
      if (res.error) { setSubmitError(res.error); return }
      setSavedPunchNumber(res.punchNumber ?? null)
      setSaved(true)
      setTimeout(() => router.push(`/projects/${projectId}/tags/${tagId}`), 2200)
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
          {t('savedTitle')}
        </div>
        {savedPunchNumber && (
          <div style={{ display: 'inline-block', margin: '8px 0 12px', padding: '6px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px', fontWeight: 700, color: '#dc2626' }}>
            {t('savedPunchCreated', { number: savedPunchNumber })}
          </div>
        )}
        <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{t('savedRedirect')}</div>
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
        <span style={{ color: 'var(--gray-400)' }}>›</span>
        <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{t('breadcrumbPreservation')}</span>
        <span style={{ color: 'var(--gray-400)' }}>›</span>
        <span style={{ fontSize: '14px', color: 'var(--gray-700)', fontWeight: 600 }}>{procedure.code}</span>
      </div>

      {/* Header */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '3px' }}>
              {procedure.code} — {FREQ_LABELS[procedure.frequency] ?? procedure.frequency} · {procedure.interval_days}d
            </div>
            <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 6px' }}>
              {procedure.title}
            </h1>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Tag: <strong>{tag?.tag_number}</strong>{tag?.description ? ` — ${tag.description}` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>{t('labelNextDue')}</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-strong)' }}>{plan.next_due_date}</div>
          </div>
        </div>

        {/* Progress bar */}
        {items.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('progressLabel')}</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--gray-700)' }}>
                {t('progressItems', { completed: completedCount, total: items.length })}
              </span>
            </div>
            <div style={{ height: '6px', background: 'var(--gray-100)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: progressPct === 100 ? '#16a34a' : '#3b82f6', width: `${progressPct}%`, transition: 'width 0.3s', borderRadius: '3px' }} />
            </div>
          </div>
        )}
      </div>

      {/* Check sheet items */}
      {items.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-strong)', marginBottom: '12px' }}>
            {t('sectionChecksheet')}
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
                    background: 'var(--card-bg)', border: '1px solid',
                    borderColor: item.is_critical && hasResponse && passed === false ? '#fca5a5'
                      : hasResponse ? '#bbf7d0' : 'var(--border)',
                    borderRadius: '10px', padding: '14px 16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0, marginTop: '1px' }}>
                      {idx + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>{item.label}</span>
                        {item.is_critical && (
                          <span style={{ padding: '1px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 700, background: '#fef2f2', color: '#dc2626' }}>
                            {t('tagCritical')}
                          </span>
                        )}
                        {!item.is_required && (
                          <span style={{ padding: '1px 6px', borderRadius: '10px', fontSize: '10px', color: 'var(--gray-400)', background: 'var(--gray-100)' }}>
                            {t('tagOptional')}
                          </span>
                        )}
                      </div>

                      {/* checkbox */}
                      {item.item_type === 'checkbox' && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => handleResponse(item, { bool: true })}
                            style={{ padding: '6px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: '2px solid', borderColor: r?.bool === true ? '#16a34a' : 'var(--border)', background: r?.bool === true ? '#f0fdf4' : 'var(--card-bg)', color: r?.bool === true ? '#16a34a' : 'var(--text-muted)' }}
                          >{t('btnConform')}</button>
                          <button
                            onClick={() => handleResponse(item, { bool: false })}
                            style={{ padding: '6px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: '2px solid', borderColor: r?.bool === false ? '#dc2626' : 'var(--border)', background: r?.bool === false ? '#fef2f2' : 'var(--card-bg)', color: r?.bool === false ? '#dc2626' : 'var(--text-muted)' }}
                          >{t('btnNonConform')}</button>
                        </div>
                      )}

                      {/* yes_no */}
                      {item.item_type === 'yes_no' && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => handleResponse(item, { bool: true })}
                            style={{ padding: '6px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', border: '2px solid', borderColor: r?.bool === true ? '#16a34a' : 'var(--border)', background: r?.bool === true ? '#f0fdf4' : 'var(--card-bg)', color: r?.bool === true ? '#16a34a' : 'var(--text-muted)' }}
                          >{t('btnYes')}</button>
                          <button
                            onClick={() => handleResponse(item, { bool: false })}
                            style={{ padding: '6px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', border: '2px solid', borderColor: r?.bool === false ? '#dc2626' : 'var(--border)', background: r?.bool === false ? '#fef2f2' : 'var(--card-bg)', color: r?.bool === false ? '#dc2626' : 'var(--text-muted)' }}
                          >{t('btnNo')}</button>
                        </div>
                      )}

                      {/* measurement / number */}
                      {['measurement', 'number'].includes(item.item_type) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <input
                            type="number"
                            value={r?.numeric ?? ''}
                            onChange={e => handleResponse(item, { numeric: e.target.value })}
                            placeholder={t('placeholderValue')}
                            style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', width: '140px' }}
                          />
                          {item.unit && <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>{item.unit}</span>}
                          {item.min_value != null && <span style={{ fontSize: '12px', color: 'var(--gray-400)' }}>{t('labelMin')} {item.min_value}</span>}
                          {item.max_value != null && <span style={{ fontSize: '12px', color: 'var(--gray-400)' }}>{t('labelMax')} {item.max_value}</span>}
                          {passed !== null && r?.numeric !== undefined && r.numeric !== '' && (
                            <span style={{ padding: '3px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, background: passed ? '#f0fdf4' : '#fef2f2', color: passed ? '#16a34a' : '#dc2626' }}>
                              {passed ? t('passInRange') : t('failOutRange')}
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
                          placeholder={t('placeholderObservation')}
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
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-strong)', marginBottom: '14px' }}>
          {t('sectionResult')}
        </h2>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {(['ok', 'nok', 'na'] as const).map(r => {
            const cfg = RESULT_CFG[r]
            return (
              <button
                key={r}
                onClick={() => { setResultOverridden(true); setResult(r) }}
                style={{
                  padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '14px',
                  cursor: 'pointer', border: '2px solid',
                  borderColor: result === r ? cfg.border : 'var(--border)',
                  background: result === r ? cfg.bg : 'var(--card-bg)',
                  color: result === r ? cfg.color : 'var(--text-muted)',
                }}
              >
                {cfg.label}
              </button>
            )
          })}
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '5px' }}>
            {t('labelRemarks')}
          </label>
          <textarea
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            rows={3}
            placeholder={t('placeholderRemarks')}
            style={{ width: '100%', padding: '9px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>

        {result === 'nok' && (
          <div style={{ marginBottom: '14px', padding: '10px 14px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={raisePunch}
                onChange={e => setRaisePunch(e.target.checked)}
                style={{ width: '16px', height: '16px' }}
              />
              <div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#dc2626' }}>{t('raisePunchLabel')}</span>
                <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '1px' }}>
                  {t('raisePunchDesc')}
                </div>
              </div>
            </label>
            {raisePunch && (
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#7f1d1d' }}>{t('punchCategoryLabel')}</span>
                {(['A', 'B', 'C'] as const).map(cat => {
                  const catCfg = {
                    A: { label: t('punchCatA'), color: '#dc2626', bg: '#fef2f2', border: '#dc2626' },
                    B: { label: t('punchCatB'), color: '#d97706', bg: '#fffbeb', border: '#d97706' },
                    C: { label: t('punchCatC'), color: '#16a34a', bg: '#f0fdf4', border: '#16a34a' },
                  }[cat]
                  const active = punchCategory === cat
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setPunchCategory(cat)}
                      style={{
                        padding: '5px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                        cursor: 'pointer', border: '2px solid',
                        borderColor: active ? catCfg.border : 'var(--border)',
                        background: active ? catCfg.bg : 'var(--card-bg)',
                        color: active ? catCfg.color : 'var(--text-muted)',
                      }}
                    >
                      {cat} — {catCfg.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {submitError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' }}>
            {submitError}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={() => router.push(`/projects/${projectId}/tags/${tagId}`)}
            style={{ padding: '10px 20px', borderRadius: '9px', background: 'var(--gray-100)', color: 'var(--text-muted)', fontWeight: 600, fontSize: '14px', cursor: 'pointer', border: 'none' }}
          >
            {t('btnCancel')}
          </button>
          <button
            onClick={handleFinalize}
            disabled={isPending}
            style={{ padding: '10px 24px', borderRadius: '9px', background: result === 'nok' ? '#dc2626' : '#16a34a', color: '#fff', fontWeight: 700, fontSize: '14px', cursor: isPending ? 'wait' : 'pointer', border: 'none', opacity: isPending ? 0.7 : 1 }}
          >
            {isPending ? t('btnSaving') : t('btnConfirm')}
          </button>
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-strong)', marginBottom: '12px' }}>
            {t('sectionHistory')}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {history.map(rec => {
              const cfg = RESULT_CFG[rec.result as keyof typeof RESULT_CFG] ?? RESULT_CFG.na
              return (
                <div key={rec.id} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '9px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ fontSize: '13px', color: 'var(--gray-700)', fontWeight: 600 }}>
                      {new Date(rec.performed_at).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                    {rec.profiles && (
                      <span style={{ fontSize: '12px', color: 'var(--gray-400)', marginLeft: '10px' }}>
                        {rec.profiles.full_name}
                      </span>
                    )}
                    {rec.remarks && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>{rec.remarks}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {rec.punch_raised && (
                      <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, background: '#fef2f2', color: '#dc2626' }}>
                        {t('punchRaised')}
                      </span>
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
