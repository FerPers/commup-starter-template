'use client'

import { useTranslations } from 'next-intl'

import type { Json, Enums } from '@/types/supabase.generated'
import { useState, useTransition, useMemo } from 'react'
import {
  createWorkflowRule,
  updateWorkflowRule,
  toggleWorkflowRule,
  deleteWorkflowRule,
  type WorkflowActionType,
} from '@/app/actions/workflows'
import { reflexiveRuleError } from '@/lib/workflows/rules'

// ── Types ─────────────────────────────────────────────────────
type Rule = {
  id: string
  name: string
  description: string | null
  trigger_event: string
  condition_jsonlogic: Json
  action_type: Enums<'workflow_action_type'>
  action_payload: Json
  priority: number
  enabled: boolean
  updated_at: string
}

type Execution = {
  id: string
  rule_id: string
  matched: boolean
  action_result: Json | null
  error_message: string | null
  executed_at: string
}

// ── Static catalogs ──────────────────────────────────────────
// S21 (I-08): catálogo v1 (entidad en singular) + eventos de negocio; las reglas viejas se migraron en 20261117120000.
const TRIGGER_EVENTS: string[] = [
  'punch.created', 'punch.updated', 'punch.deleted', 'punch.assigned', 'punch.closed',
  'itr.created', 'itr.updated', 'itr.deleted', 'itr.completed', 'itr.approved', 'itr.rejected',
  'certificate.created', 'certificate.updated', 'certificate.issued',
  'gate.approved', 'gate.revoked',
  'transfer.completed',
  'system.updated', 'subsystem.updated', 'loop.updated',
  // S13 (F-31): «interlocks.updated» se quitó: la tabla interlocks se reemplazó por las matrices C&E (fase 4-D) y el evento ya no ocurre.
  'signal.updated',
]

const ACTION_TYPES: WorkflowActionType[] = ['block_certificate', 'notify_user', 'create_punch', 'webhook_call']

const OPERATORS: { value: string; jsonlogic: string }[] = [
  { value: 'eq',  jsonlogic: '==' },
  { value: 'neq', jsonlogic: '!=' },
  { value: 'gt',  jsonlogic: '>' },
  { value: 'gte', jsonlogic: '>=' },
  { value: 'lt',  jsonlogic: '<' },
  { value: 'lte', jsonlogic: '<=' },
  { value: 'in',  jsonlogic: 'in' },
]

// ── JsonLogic helpers (simple row builder) ───────────────────
type ConditionRow = { field: string; op: string; value: string }

function rowsToJsonLogic(rows: ConditionRow[]): { [key: string]: Json } {
  const clean = rows.filter(r => r.field.trim())
  if (clean.length === 0) return {}
  const parts = clean.map(r => {
    const opDef = OPERATORS.find(o => o.value === r.op) ?? OPERATORS[0]
    let v: Json = r.value
    if (r.value === 'true') v = true
    else if (r.value === 'false') v = false
    else if (r.value !== '' && !isNaN(Number(r.value))) v = Number(r.value)
    return { [opDef.jsonlogic]: [{ var: r.field }, v] }
  })
  return parts.length === 1 ? parts[0] : { and: parts }
}

function jsonLogicToRows(logicJson: Json): ConditionRow[] {
  const logic = (logicJson && typeof logicJson === 'object' && !Array.isArray(logicJson) ? logicJson : {}) as Record<string, unknown>
  if (!logic || typeof logic !== 'object' || Object.keys(logic).length === 0) return []
  const parse = (node: Record<string, unknown>): ConditionRow | null => {
    const key = Object.keys(node)[0]
    const args = (node as Record<string, unknown[]>)[key]
    if (!Array.isArray(args) || args.length !== 2) return null
    const lhs = args[0] as Record<string, unknown>
    const rhs = args[1]
    if (!lhs || typeof lhs !== 'object' || !('var' in lhs)) return null
    const opDef = OPERATORS.find(o => o.jsonlogic === key) ?? OPERATORS[0]
    return { field: String(lhs.var), op: opDef.value, value: String(rhs ?? '') }
  }
  if ('and' in logic && Array.isArray(logic.and)) {
    return (logic.and as Record<string, unknown>[]).map(parse).filter(Boolean) as ConditionRow[]
  }
  const single = parse(logic)
  return single ? [single] : []
}

// ── Styles ───────────────────────────────────────────────────
const btnPrimary: React.CSSProperties = {
  padding: '8px 14px', background: '#3b82f6', color: '#fff',
  border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const btnOutline: React.CSSProperties = {
  padding: '6px 12px', background: 'var(--card-bg)', color: 'var(--text-muted)',
  border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
}
const btnDanger: React.CSSProperties = {
  padding: '6px 12px', background: '#fef2f2', color: '#b91c1c',
  border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
}
const input: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13,
  fontFamily: 'inherit', width: '100%', background: 'var(--card-bg)',
}
const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, display: 'block',
}

// ── Main ─────────────────────────────────────────────────────
export default function WorkflowsView({
  rules: initialRules,
  recentExecutions,
}: {
  rules: Rule[]
  recentExecutions: Execution[]
}) {
  // N0 (H-13): título = etiqueta del menú.
  const tNav = useTranslations('Sidebar.nav')
  const tx = useTranslations('Workflows')
  const [rules, setRules] = useState<Rule[]>(initialRules)
  const [editingRule, setEditingRule] = useState<Rule | null>(null)
  const [creating, setCreating] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const executionsByRule = useMemo(() => {
    const map: Record<string, Execution[]> = {}
    for (const e of recentExecutions) {
      (map[e.rule_id] ??= []).push(e)
    }
    return map
  }, [recentExecutions])

  const rulesByEvent = useMemo(() => {
    const map: Record<string, Rule[]> = {}
    for (const r of rules) (map[r.trigger_event] ??= []).push(r)
    return map
  }, [rules])

  const handleToggle = (rule: Rule) => {
    setError(null)
    startTransition(async () => {
      const res = await toggleWorkflowRule(rule.id, !rule.enabled)
      if (res.error) return setError(res.error)
      setRules(rs => rs.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r))
    })
  }

  const handleDelete = (rule: Rule) => {
    if (!confirm(tx('deleteConfirm', { name: rule.name }))) return
    setError(null)
    startTransition(async () => {
      const res = await deleteWorkflowRule(rule.id)
      if (res.error) return setError(res.error)
      setRules(rs => rs.filter(r => r.id !== rule.id))
    })
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>
            {tNav('workflows')}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            {tx.rich('subtitle', { code: c => <code>{c}</code> })}
          </p>
        </div>
        <button onClick={() => setCreating(true)} style={btnPrimary}>{tx('newRule')}</button>
      </div>

      {error && (
        <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#b91c1c', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {rules.length === 0 && !creating && (
        <div style={{ padding: 40, background: 'var(--gray-50)', border: '1px dashed #cbd5e1', borderRadius: 8, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          {tx('empty')}
        </div>
      )}

      {Object.keys(rulesByEvent).sort().map(event => (
        <div key={event} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, padding: '0 4px' }}>
            {TRIGGER_EVENTS.includes(event) ? tx(`trigger.${event}`) : event}
            <span style={{ marginLeft: 6, color: 'var(--gray-400)', fontWeight: 500 }}>({event})</span>
          </div>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {rulesByEvent[event].map(rule => (
              <RuleRow
                key={rule.id}
                rule={rule}
                executions={executionsByRule[rule.id] ?? []}
                isPending={isPending}
                onToggle={() => handleToggle(rule)}
                onEdit={() => setEditingRule(rule)}
                onDelete={() => handleDelete(rule)}
              />
            ))}
          </div>
        </div>
      ))}

      {(creating || editingRule) && (
        <RuleEditorModal
          rule={editingRule}
          onClose={() => { setCreating(false); setEditingRule(null); setError(null) }}
          onSaved={(saved) => {
            setRules(rs => {
              const exists = rs.find(r => r.id === saved.id)
              return exists ? rs.map(r => r.id === saved.id ? saved : r) : [...rs, saved]
            })
            setCreating(false)
            setEditingRule(null)
          }}
        />
      )}
    </div>
  )
}

// ── Rule row ─────────────────────────────────────────────────
function RuleRow({
  rule, executions, isPending, onToggle, onEdit, onDelete,
}: {
  rule: Rule
  executions: Execution[]
  isPending: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const tx = useTranslations('Workflows')
  const [expanded, setExpanded] = useState(false)
  const actionLabel = tx(`action.${rule.action_type}.label`)
  const lastExec = executions[0]
  const matches = executions.filter(e => e.matched).length

  return (
    <div style={{ borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
        <button
          onClick={onToggle}
          disabled={isPending}
          title={tx(rule.enabled ? 'deactivate' : 'activate')}
          style={{
            width: 32, height: 18, borderRadius: 9, border: 'none', cursor: 'pointer', flexShrink: 0,
            background: rule.enabled ? '#10b981' : 'var(--gray-300)', position: 'relative', padding: 0,
          }}
        >
          <div style={{
            position: 'absolute', top: 2, left: rule.enabled ? 16 : 2,
            width: 14, height: 14, borderRadius: '50%', background: 'var(--card-bg)',
            transition: 'left 0.15s',
          }} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
            {rule.name}
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
              {tx('priorityLabel', { n: rule.priority })}
            </span>
          </div>
          {rule.description && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{rule.description}</div>
          )}
          <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
            → <strong style={{ color: 'var(--text-muted)' }}>{actionLabel}</strong>
            {executions.length > 0 && (
              <span style={{ marginLeft: 10 }}>
                {tx('recentMatches', { matches, total: executions.length })}
                {lastExec?.error_message && <span style={{ color: '#ef4444', marginLeft: 6 }}>· {tx('lastError')}</span>}
              </span>
            )}
          </div>
        </div>
        <button onClick={() => setExpanded(e => !e)} style={btnOutline}>{expanded ? tx('close') : 'JSON'}</button>
        <button onClick={onEdit} disabled={isPending} style={btnOutline}>{tx('edit')}</button>
        <button onClick={onDelete} disabled={isPending} style={btnDanger}>{tx('delete')}</button>
      </div>
      {expanded && (
        <div style={{ padding: '0 16px 14px', fontSize: 11, fontFamily: 'ui-monospace, monospace', color: 'var(--text-muted)' }}>
          <div style={{ marginBottom: 4, fontWeight: 700, color: 'var(--text-muted)' }}>condition_jsonlogic</div>
          <pre style={{ background: 'var(--gray-50)', padding: 10, borderRadius: 6, overflow: 'auto', margin: 0 }}>
            {JSON.stringify(rule.condition_jsonlogic, null, 2)}
          </pre>
          <div style={{ marginTop: 10, marginBottom: 4, fontWeight: 700, color: 'var(--text-muted)' }}>action_payload</div>
          <pre style={{ background: 'var(--gray-50)', padding: 10, borderRadius: 6, overflow: 'auto', margin: 0 }}>
            {JSON.stringify(rule.action_payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── Editor modal ─────────────────────────────────────────────
function RuleEditorModal({
  rule, onClose, onSaved,
}: {
  rule: Rule | null
  onClose: () => void
  onSaved: (rule: Rule) => void
}) {
  const tx = useTranslations('Workflows')
  const [name, setName] = useState(rule?.name ?? '')
  const [description, setDescription] = useState(rule?.description ?? '')
  const [triggerEvent, setTriggerEvent] = useState(rule?.trigger_event ?? TRIGGER_EVENTS[0])
  const [actionType, setActionType] = useState<Enums<'workflow_action_type'>>(rule?.action_type ?? 'notify_user')
  const [priority, setPriority] = useState(rule?.priority ?? 100)
  const [enabled, setEnabled] = useState(rule?.enabled ?? true)
  const [conditionRows, setConditionRows] = useState<ConditionRow[]>(
    rule ? jsonLogicToRows(rule.condition_jsonlogic) : [],
  )
  const [advancedMode, setAdvancedMode] = useState(false)
  const [advancedJson, setAdvancedJson] = useState(
    rule ? JSON.stringify(rule.condition_jsonlogic, null, 2) : '{}',
  )
  const [payloadJson, setPayloadJson] = useState(
    rule ? JSON.stringify(rule.action_payload, null, 2) : '{}',
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const handleSave = async () => {
    setErr(null)
    const loop = reflexiveRuleError(triggerEvent, actionType)
    if (loop) return setErr(loop)

    let conditionJsonlogic: Json
    if (advancedMode) {
      try { conditionJsonlogic = JSON.parse(advancedJson) }
      catch { return setErr(tx('errConditionJson')) }
    } else {
      conditionJsonlogic = rowsToJsonLogic(conditionRows)
    }

    let actionPayload: { [key: string]: Json }
    try { actionPayload = JSON.parse(payloadJson) }
    catch { return setErr(tx('errPayloadJson')) }

    setSaving(true)
    const input = {
      name, description, triggerEvent,
      conditionJsonlogic, actionType, actionPayload,
      priority, enabled,
    }
    const res = rule
      ? await updateWorkflowRule(rule.id, input)
      : await createWorkflowRule(input)
    setSaving(false)

    if (res.error) return setErr(res.error)

    const saved: Rule = {
      id: rule?.id ?? (res as { id: string }).id,
      name, description: description || null,
      trigger_event: triggerEvent,
      condition_jsonlogic: conditionJsonlogic,
      action_type: actionType,
      action_payload: actionPayload,
      priority, enabled,
      updated_at: new Date().toISOString(),
    }
    onSaved(saved)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: 40, zIndex: 100, overflow: 'auto',
    }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: 10, width: '100%', maxWidth: 720, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
            {tx(rule ? 'editRule' : 'newRuleTitle')}
          </h2>
          <button onClick={onClose} aria-label={tx('close')} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)' }}>×</button>
        </div>

        {err && (
          <div style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#b91c1c', fontSize: 13, marginBottom: 14 }}>
            {err}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={label}>{tx('field.name')}</label>
            <input style={input} value={name} onChange={e => setName(e.target.value)} placeholder={tx('field.namePlaceholder')} />
          </div>
          <div>
            <label style={label}>{tx('field.priority')}</label>
            <input style={input} type="number" value={priority} onChange={e => setPriority(Number(e.target.value))} />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={label}>{tx('field.description')}</label>
          <input style={input} value={description ?? ''} onChange={e => setDescription(e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
          <div>
            <label style={label}>{tx('field.trigger')}</label>
            <select style={input} value={triggerEvent} onChange={e => setTriggerEvent(e.target.value)}>
              {TRIGGER_EVENTS.map(t => <option key={t} value={t}>{tx(`trigger.${t}`)}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>{tx('field.action')}</label>
            <select style={input} value={actionType} onChange={e => setActionType(e.target.value as WorkflowActionType)}>
              {ACTION_TYPES.map(a => <option key={a} value={a}>{tx(`action.${a}.label`)}</option>)}
            </select>
            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
              {tx(`action.${actionType}.description`)}
            </div>
          </div>
        </div>

        {/* ── Condiciones ── */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ ...label, marginBottom: 0 }}>{tx('conditions.title')}</label>
            <button
              type="button"
              onClick={() => {
                if (!advancedMode) setAdvancedJson(JSON.stringify(rowsToJsonLogic(conditionRows), null, 2))
                else {
                  try { setConditionRows(jsonLogicToRows(JSON.parse(advancedJson))) } catch {}
                }
                setAdvancedMode(m => !m)
              }}
              style={{ ...btnOutline, fontSize: 11, padding: '4px 8px' }}
            >
              {tx(advancedMode ? 'conditions.visual' : 'conditions.advanced')}
            </button>
          </div>

          {!advancedMode ? (
            <>
              {conditionRows.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--gray-400)', padding: '8px 0' }}>
                  {tx('conditions.none')}
                </div>
              )}
              {conditionRows.map((row, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 90px 2fr 30px', gap: 8, marginBottom: 6 }}>
                  <input
                    style={input}
                    placeholder={tx('conditions.fieldPlaceholder')}
                    value={row.field}
                    onChange={e => setConditionRows(rs => rs.map((r, j) => i === j ? { ...r, field: e.target.value } : r))}
                  />
                  <select
                    style={input}
                    value={row.op}
                    onChange={e => setConditionRows(rs => rs.map((r, j) => i === j ? { ...r, op: e.target.value } : r))}
                  >
                    {OPERATORS.map(o => <option key={o.value} value={o.value}>{tx(`op.${o.value}`)}</option>)}
                  </select>
                  <input
                    style={input}
                    placeholder={tx('conditions.valuePlaceholder')}
                    value={row.value}
                    onChange={e => setConditionRows(rs => rs.map((r, j) => i === j ? { ...r, value: e.target.value } : r))}
                  />
                  <button
                    onClick={() => setConditionRows(rs => rs.filter((_, j) => j !== i))}
                    aria-label={tx('conditions.remove')}
                    style={{ ...btnDanger, padding: '4px 0' }}
                  >×</button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setConditionRows(rs => [...rs, { field: '', op: 'eq', value: '' }])}
                style={{ ...btnOutline, marginTop: 4 }}
              >{tx('conditions.add')}</button>
            </>
          ) : (
            <textarea
              style={{ ...input, fontFamily: 'ui-monospace, monospace', minHeight: 120, fontSize: 12 }}
              value={advancedJson}
              onChange={e => setAdvancedJson(e.target.value)}
              placeholder='{"==": [{"var": "new.category"}, "A"]}'
            />
          )}
          <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
            {tx.rich('conditions.fields', { code: c => <code>{c}</code> })}
          </div>
        </div>

        {/* ── Payload ── */}
        <div style={{ marginBottom: 18 }}>
          <label style={label}>{tx('payload.label')}</label>
          <textarea
            style={{ ...input, fontFamily: 'ui-monospace, monospace', minHeight: 100, fontSize: 12 }}
            value={payloadJson}
            onChange={e => setPayloadJson(e.target.value)}
            placeholder={`{"reason": "${tx('payload.reasonExample')}"}`}
          />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 13, color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          {tx('active')}
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={btnOutline} disabled={saving}>{tx('cancel')}</button>
          <button onClick={handleSave} style={btnPrimary} disabled={saving}>
            {tx(saving ? 'saving' : 'save')}
          </button>
        </div>
      </div>
    </div>
  )
}
