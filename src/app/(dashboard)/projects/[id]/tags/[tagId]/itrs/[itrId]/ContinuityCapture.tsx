'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useToast } from '@/components/ui'
import { setContinuityScope } from '@/app/actions/itr-instances'
import { coversScope, evaluateContinuity, type ContinuityCapture as Capture, type ContinuityRow, type ContinuityScope } from '@/lib/itr/continuity'
import { reshapeContinuity } from '@/lib/itr/continuity-editor'

export type ContinuityContext = { scope: ContinuityScope | null; setByName: string | null; canSetScope: boolean }

/**
 * A38: el alcance (agrupación, cantidad, pantallas) lo fija un líder antes de ejecutar y queda en el ITR; el
 * ejecutor solo llena las filas que salen de él. La lectura obligatoria la decide la plantilla.
 */
export default function ContinuityCapture({ value, disabled, onChange, context, measurementRequired, ids }: {
  value: string | null
  disabled: boolean
  onChange: (value: string) => void
  context: ContinuityContext
  measurementRequired: boolean
  ids: { itrId: string; itemId: string; projectId: string; tagId: string }
}) {
  const t = useTranslations('Continuity')
  const router = useRouter()
  const toast = useToast()
  const { scope } = context
  const evaluated = evaluateContinuity(value, scope, measurementRequired)
  const data = scope ? reshapeContinuity(evaluated.data, scope, measurementRequired) : null
  const current = useRef(data)
  useEffect(() => { current.current = scope ? reshapeContinuity(evaluateContinuity(value, scope, measurementRequired).data, scope, measurementRequired) : null }, [value, scope, measurementRequired])
  const field = { width: '100%', minWidth: '95px', padding: '8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--card-bg)', color: 'var(--text-strong)' } as const
  function changeRow(id: string, patch: Partial<ContinuityRow>) {
    if (!current.current || disabled) return
    const next: Capture = { ...current.current, rows: current.current.rows.map(row => row.id === id ? { ...row, ...patch } : row) }
    current.current = next; onChange(JSON.stringify(next))
  }
  const outOfScope = !!scope && !!evaluated.data && !coversScope(evaluated.data, scope)
  const statusText = !scope ? t('status.noScope') : evaluated.hasFail ? t('status.fail') : evaluated.isComplete ? t('status.complete') : t('status.pending')
  return <div>
    <p style={{ fontWeight: 600, marginBottom: '10px' }}>{t('legend')}</p>
    <ScopeSummary context={context} />
    {context.canSetScope && <ScopeForm context={context} ids={ids} onSaved={() => router.refresh()} onError={message => toast.error(message)} />}
    {data && <fieldset disabled={disabled} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      <legend className="sr-only">{t('rowsLegend')}</legend>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{measurementRequired ? t('helpReading') : t('help')}</p>
      {outOfScope && <p role="note" style={{ fontSize: '12px', color: 'var(--warning-700)' }}>{t('scopeChanged')}</p>}
      <div style={{ overflowX: 'auto' }}><table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px' }}>
        <thead><tr>{[t('col.id'), t('col.from'), t('col.to'), t('col.result'), t('col.reading'), t('col.unit'), t('col.remarks')].map(title => <th key={title} style={{ padding: '8px', textAlign: 'left' }}>{title}</th>)}</tr></thead>
        <tbody>{data.rows.map(row => <tr key={row.id}>
          <th scope="row" style={{ padding: '8px', textAlign: 'left' }}>{row.id}</th>
          {(['from', 'to'] as const).map(key => <td key={key}><input aria-label={`${row.id} ${key === 'from' ? t('col.from') : t('col.to')}`} style={field} value={row[key]} onChange={e => changeRow(row.id, { [key]: e.target.value })} /></td>)}
          <td><select aria-label={`${row.id} ${t('col.result')}`} style={field} value={row.result} onChange={e => changeRow(row.id, { result: e.target.value as ContinuityRow['result'] })}><option value="">{t('result.pending')}</option><option value="pass">{t('result.pass')}</option><option value="fail">{t('result.fail')}</option><option value="not_applicable">{t('result.na')}</option></select></td>
          <td><input aria-label={`${row.id} ${t('col.reading')}`} style={field} type="number" step="any" value={row.reading ?? ''} onChange={e => changeRow(row.id, { reading: e.target.value === '' || !Number.isFinite(e.target.valueAsNumber) ? null : e.target.valueAsNumber })} /></td>
          <td><input aria-label={`${row.id} ${t('col.unit')}`} style={field} value={row.unit} onChange={e => changeRow(row.id, { unit: e.target.value })} /></td>
          <td><textarea aria-label={`${row.id} ${t('col.remarks')}`} style={field} value={row.remarks} onChange={e => changeRow(row.id, { remarks: e.target.value })} /></td>
        </tr>)}</tbody>
      </table></div>
    </fieldset>}
    <p role="status" style={{ fontSize: '12px', color: evaluated.hasFail || !scope ? 'var(--danger-700)' : 'var(--text-muted)' }}>{statusText}</p>
  </div>
}

function ScopeSummary({ context }: { context: ContinuityContext }) {
  const t = useTranslations('Continuity')
  const { scope } = context
  const box = { padding: '10px 12px', borderRadius: '8px', marginBottom: '10px', fontSize: '12px' } as const
  if (!scope) return <p role="alert" style={{ ...box, background: 'var(--warning-50)', border: '1px solid var(--warning-200)', color: 'var(--warning-700)' }}>{t('scope.missing')}</p>
  return <div style={{ ...box, background: 'var(--gray-50)', border: '1px solid var(--border)', color: 'var(--text-body)' }}>
    <strong>{t('scope.title')}</strong>{' '}
    {t(scope.grouping === 'pairs' ? 'scope.pairs' : 'scope.conductors', { count: scope.count })}
    {' · '}{scope.shields.length ? t('scope.shields', { list: scope.shields.join(', ') }) : t('scope.noShields')}
    {context.setByName && <span style={{ color: 'var(--text-muted)' }}>{' · '}{t('scope.setBy', { name: context.setByName })}</span>}
    {scope.reason && <span style={{ color: 'var(--text-muted)' }}>{' · '}{t('scope.reason', { reason: scope.reason })}</span>}
  </div>
}

function ScopeForm({ context, ids, onSaved, onError }: { context: ContinuityContext; ids: { itrId: string; itemId: string; projectId: string; tagId: string }; onSaved: () => void; onError: (message: string) => void }) {
  const t = useTranslations('Continuity')
  const { scope } = context
  const [open, setOpen] = useState(!scope)
  const [grouping, setGrouping] = useState<Capture['grouping']>(scope?.grouping ?? 'pairs')
  const [count, setCount] = useState(String(scope?.count ?? 1))
  const [shields, setShields] = useState(scope?.shields.join('\n') ?? '')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const field = { width: '100%', minWidth: '95px', padding: '8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--card-bg)', color: 'var(--text-strong)' } as const
  if (!open) return <button type="button" onClick={() => setOpen(true)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', marginBottom: '10px', fontSize: '12px' }}>{t('scope.change')}</button>
  function save() {
    const n = Number(count)
    const list = shields.split('\n').map(s => s.trim()).filter(Boolean)
    if (!Number.isInteger(n) || n < 1 || n > 500 || new Set(list).size !== list.length) { setError(t('countError')); return }
    if (scope && reason.trim().length < 10) { setError(t('scope.reasonMin')); return }
    setError('')
    start(async () => {
      const res = await setContinuityScope({ ...ids, grouping, count: n, shields: list, reason: scope ? reason.trim() : undefined })
      if (res.error) { onError(res.error); return }
      setReason(''); setOpen(false)
      onSaved()
    })
  }
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'end', marginBottom: '12px', padding: '10px 12px', border: '1px dashed var(--border)', borderRadius: '8px' }}>
    <p style={{ width: '100%', margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>{t('scope.formHelp')}</p>
    <label>{t('grouping')}<select aria-label={t('groupingAria')} style={field} value={grouping} onChange={e => setGrouping(e.target.value as Capture['grouping'])}><option value="pairs">{t('pairs')}</option><option value="conductors">{t('conductors')}</option></select></label>
    <label>{grouping === 'pairs' ? t('pairCount') : t('conductorCount')}<input aria-label={t('countAria')} style={field} type="number" min={1} max={500} step={1} value={count} onChange={e => setCount(e.target.value)} /></label>
    <label>{t('shields')}<textarea aria-label={t('shieldsAria')} style={field} value={shields} onChange={e => setShields(e.target.value)} /></label>
    {scope && <label style={{ flex: '1 1 240px' }}>{t('scope.reasonLabel')}<input aria-label={t('scope.reasonLabel')} style={field} value={reason} onChange={e => setReason(e.target.value)} /></label>}
    <button type="button" disabled={pending} onClick={save} style={{ padding: '9px', borderRadius: '6px', border: '1px solid var(--border)' }}>{scope ? t('scope.saveChange') : t('scope.save')}</button>
    {scope && <button type="button" disabled={pending} onClick={() => { setOpen(false); setError('') }} style={{ padding: '9px', borderRadius: '6px', border: '1px solid var(--border)' }}>{t('scope.cancel')}</button>}
    {error && <p role="alert" style={{ width: '100%', margin: 0, color: 'var(--danger-700)' }}>{error}</p>}
  </div>
}
