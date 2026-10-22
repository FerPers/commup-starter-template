'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { saveGatePlanBatch } from '@/app/actions/planning'
import { todayIso } from '@/lib/daily/catalog'
import {
  LOOKAHEAD_WINDOWS, addDays, gateAtRisk, gateGap, groupBySystem, inWindow,
  type LookaheadItem, type LookaheadKind, type LookaheadWindow,
} from '@/lib/readiness/planning'
import { Alert, Chip, btn, card, input, small } from '../../daily/daily-ui'

export type GateCell = {
  systemId: string; systemCode: string; systemName: string
  gateId: string; gateCode: string; gateName: string; gateOrder: number; status: string
  forecast: string | null; commitment: string | null
  /** S23 (D-26): qué lo frena (texto ya traducido), si no está listo. */
  blocker: string | null
}
export type PlanSource = {
  kind: Exclude<LookaheadKind, 'gate'>; id: string; ref: string; title: string; status: string; date: string
  systemId: string | null; systemCode: string | null; level?: number
}
export type SystemProgress = { systemId: string; systemCode: string; weightedPct: number; itrTotal: number; gatesApproved: number; gatesTotal: number }

type Props = {
  project: { id: string; code: string; name: string }
  initialWindow: LookaheadWindow
  initialEdit: boolean
  cells: GateCell[]
  sources: PlanSource[]
  progress: SystemProgress[]
  canEdit: boolean
  canCommit: boolean
}

const SETTLED = new Set(['approved', 'approved_with_conditions', 'approved_needs_review'])
const KIND_TONE = { gate: 'violet', action: 'blue', constraint: 'red', tq: 'amber', work_plan: 'muted' } as const
const th: React.CSSProperties = {
  textAlign: 'left', padding: '8px 10px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border)', background: 'var(--gray-50)', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-sm)', verticalAlign: 'top' }
const pct = (x: number) => `${(x * 100).toFixed(1)} %`

export default function LookaheadView({ project, initialWindow, initialEdit, cells, sources, progress, canEdit, canCommit }: Props) {
  const t = useTranslations('Daily')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [win, setWin] = useState<LookaheadWindow>(initialWindow)
  const [basis, setBasis] = useState<'forecast' | 'commitment'>('forecast')
  const [edit, setEdit] = useState(initialEdit)
  const [error, setError] = useState<string | null>(null)
  const [savedN, setSavedN] = useState<number | null>(null)
  const [draft, setDraft] = useState<Record<string, { forecast: string; commitment: string }>>({})
  const [reason, setReason] = useState('')
  // Fecha local del navegador (el servidor renderiza en UTC).
  const today = useMemo(() => todayIso(), [])
  const end = addDays(today, win)
  const base = `/projects/${project.id}`
  const progressOf = new Map(progress.map(p => [p.systemId, p]))

  const items: LookaheadItem[] = useMemo(() => {
    const out: LookaheadItem[] = []
    for (const c of cells) {
      if (SETTLED.has(c.status)) continue
      const date = basis === 'forecast' ? c.forecast : c.commitment
      if (!inWindow(date, end)) continue
      out.push({
        kind: 'gate', id: `${c.systemId}:${c.gateId}`, ref: c.gateCode, title: c.gateName, systemId: c.systemId, systemCode: c.systemCode,
        date, basis, status: c.status, href: `${base}/systems/${c.systemId}?tab=plan`,
        gapDays: gateGap(c.forecast, c.commitment), atRisk: gateAtRisk(c.status, date, end), detail: c.blocker,
      })
    }
    for (const s of sources) {
      if (!inWindow(s.date, end)) continue
      const href = s.kind === 'work_plan' ? `${base}/work-plans` : `${base}/daily/${s.kind}/${s.id}`
      out.push({ kind: s.kind, id: s.id, ref: s.ref, title: s.title, systemId: s.systemId, systemCode: s.systemCode, date: s.date, status: s.status, href })
    }
    return out
  }, [cells, sources, basis, end, base])
  const groups = groupBySystem(items)
  const atRisk = items.filter(i => i.atRisk).length
  const behind = cells.filter(c => !SETTLED.has(c.status) && (gateGap(c.forecast, c.commitment) ?? 0) > 0).length

  // ── Grilla de edición ──
  const gates = [...new Map(cells.map(c => [c.gateId, { id: c.gateId, code: c.gateCode, order: c.gateOrder }])).values()].sort((a, b) => a.order - b.order)
  const systems = [...new Map(cells.map(c => [c.systemId, { id: c.systemId, code: c.systemCode, name: c.systemName }])).values()]
  const cellOf = new Map(cells.map(c => [`${c.systemId}:${c.gateId}`, c]))
  const val = (key: string, field: 'forecast' | 'commitment') => draft[key]?.[field] ?? cellOf.get(key)?.[field] ?? ''
  function setVal(key: string, field: 'forecast' | 'commitment', v: string) {
    const c = cellOf.get(key)
    setDraft(d => ({ ...d, [key]: { forecast: d[key]?.forecast ?? c?.forecast ?? '', commitment: d[key]?.commitment ?? c?.commitment ?? '', [field]: v } }))
  }
  const changes = Object.entries(draft).flatMap(([key, v]) => {
    const c = cellOf.get(key)!
    const [systemId, gateId] = key.split(':')
    const out: { systemId: string; gateId: string; field: 'forecast' | 'commitment'; date: string | null; prev: string | null }[] = []
    if ((v.forecast || null) !== c.forecast) out.push({ systemId, gateId, field: 'forecast', date: v.forecast || null, prev: c.forecast })
    if ((v.commitment || null) !== c.commitment) out.push({ systemId, gateId, field: 'commitment', date: v.commitment || null, prev: c.commitment })
    return out
  })
  const needsReason = changes.some(c => c.field === 'commitment' && c.prev !== null)

  function save() {
    setError(null); setSavedN(null)
    startTransition(async () => {
      const res = await saveGatePlanBatch({ projectId: project.id, changes: changes.map(({ prev: _prev, ...c }) => ({ ...c, reason })) })
      setSavedN(res.saved)
      if (res.error) { setError(res.error); router.refresh(); return }
      setDraft({}); setReason('')
      router.refresh()
    })
  }

  const seg = (on: boolean): React.CSSProperties => ({
    ...btn('outline'), padding: '5px 12px', fontSize: 'var(--text-xs)',
    background: on ? 'var(--primary-500)' : 'var(--card-bg)', color: on ? '#fff' : 'var(--text-strong)',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ ...small, margin: 0, maxWidth: 760 }}>{t('lookahead.subtitle')}</p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {LOOKAHEAD_WINDOWS.map(w => (
            <button key={w} type="button" aria-pressed={win === w} style={seg(win === w)} onClick={() => setWin(w)}>{t('lookahead.window', { n: w })}</button>
          ))}
          <span style={{ width: 12 }} />
          {(['forecast', 'commitment'] as const).map(b => (
            <button key={b} type="button" aria-pressed={basis === b} style={seg(basis === b)} onClick={() => setBasis(b)} disabled={edit}>{t(`lookahead.basis.${b}`)}</button>
          ))}
        </div>
        {canEdit && (
          <button type="button" style={btn(edit ? 'primary' : 'outline')} onClick={() => { setEdit(!edit); setDraft({}); setError(null) }}>
            {edit ? t('lookahead.closeEdit') : t('lookahead.editDates')}
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        {[
          { label: t('lookahead.kpi.items', { n: win }), value: items.length },
          { label: t('lookahead.kpi.atRisk'), value: atRisk, red: true },
          { label: t('lookahead.kpi.behind'), value: behind, red: true },
          { label: t('lookahead.kpi.progress'), value: pct(progress.reduce((s, p) => s + p.weightedPct * p.itrTotal, 0) / Math.max(1, progress.reduce((s, p) => s + p.itrTotal, 0))) },
        ].map(k => (
          <div key={k.label} style={{ ...card, padding: 16 }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{k.label}</div>
            <div suppressHydrationWarning style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: k.red && Number(k.value) > 0 ? 'var(--danger-700)' : 'var(--text-strong)' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {error && <Alert kind="error">{error}{savedN ? ` · ${t('lookahead.savedPartial', { n: savedN })}` : ''}</Alert>}
      {!error && savedN !== null && savedN > 0 && <Alert kind="ok">{t('lookahead.saved', { n: savedN })}</Alert>}

      {!edit && (
        <>
          <p style={{ ...small, margin: 0 }}>{t('lookahead.help', { end })}</p>
          {groups.length === 0 && <div style={{ ...card, ...small, textAlign: 'center' }}>{t('lookahead.empty')}</div>}
          {groups.map(g => {
            const p = g.systemId ? progressOf.get(g.systemId) : undefined
            return (
              <section key={g.systemId ?? 'none'} style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  {g.systemId ? (
                    <Link href={`${base}/systems/${g.systemId}?tab=plan`} style={{ fontWeight: 700, color: 'var(--text-strong)', textDecoration: 'none', fontFamily: 'ui-monospace, monospace' }}>{g.systemCode}</Link>
                  ) : <strong>{t('lookahead.noSystem')}</strong>}
                  {p && <span style={small}>{t('lookahead.systemProgress', { pct: pct(p.weightedPct), approved: p.gatesApproved, total: p.gatesTotal })}</span>}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {g.items.map(it => (
                      <tr key={`${it.kind}:${it.id}`}>
                        <td style={{ ...td, width: 110, whiteSpace: 'nowrap', color: it.date < today ? 'var(--danger-700)' : undefined, fontWeight: it.date < today ? 700 : 400 }} suppressHydrationWarning>{it.date}</td>
                        <td style={{ ...td, width: 130 }}><Chip tone={KIND_TONE[it.kind]}>{t(`lookahead.kind.${it.kind}`)}</Chip></td>
                        <td style={{ ...td, width: 120, whiteSpace: 'nowrap' }}>
                          <Link href={it.href} style={{ fontWeight: 700, color: 'var(--text-strong)', textDecoration: 'none', fontFamily: 'ui-monospace, monospace' }}>{it.ref}</Link>
                        </td>
                        <td style={td}>
                          {it.title}
                          {it.detail && <div style={{ ...small, color: it.atRisk ? 'var(--danger-700)' : undefined }}>{it.detail}</div>}
                        </td>
                        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {it.kind === 'gate' && (
                            <span style={{ display: 'inline-flex', gap: 6 }}>
                              <Chip tone="muted">{t(`lookahead.gateStatus.${it.status}`)}</Chip>
                              {it.gapDays != null && it.gapDays !== 0 && (
                                <Chip tone={it.gapDays > 0 ? 'red' : 'green'}>{t('lookahead.gap', { n: it.gapDays > 0 ? `+${it.gapDays}` : String(it.gapDays) })}</Chip>
                              )}
                              {it.atRisk && <Chip tone="red">{t('lookahead.risk')}</Chip>}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )
          })}
        </>
      )}

      {edit && (
        <>
          <p style={{ ...small, margin: 0 }}>{canCommit ? t('lookahead.editHelp') : t('lookahead.editHelpNoCommit')}</p>
          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>{t('col.system')}</th>
                  <th style={th}>{t('lookahead.kpi.progress')}</th>
                  {gates.map(g => <th key={g.id} style={th}>{g.code}</th>)}
                </tr>
              </thead>
              <tbody>
                {systems.map(s => {
                  const p = progressOf.get(s.id)
                  return (
                    <tr key={s.id}>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}><strong style={{ fontFamily: 'ui-monospace, monospace' }}>{s.code}</strong><div style={small}>{s.name}</div></td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{p ? pct(p.weightedPct) : '—'}</td>
                      {gates.map(g => {
                        const key = `${s.id}:${g.id}`
                        const c = cellOf.get(key)
                        if (!c) return <td key={g.id} style={td}>—</td>
                        const settled = SETTLED.has(c.status)
                        const gap = gateGap(val(key, 'forecast') || null, val(key, 'commitment') || null)
                        return (
                          <td key={g.id} style={{ ...td, minWidth: 170 }}>
                            {settled ? <Chip tone="green">{t(`lookahead.gateStatus.${c.status}`)}</Chip> : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ ...small, display: 'flex', gap: 6, alignItems: 'center' }}>
                                  <span style={{ width: 14, fontWeight: 700 }}>{t('lookahead.f')}</span>
                                  <input type="date" aria-label={`${s.code} ${g.code} ${t('lookahead.basis.forecast')}`} style={{ ...input, padding: '4px 6px' }}
                                    value={val(key, 'forecast')} onChange={e => setVal(key, 'forecast', e.target.value)} />
                                </label>
                                <label style={{ ...small, display: 'flex', gap: 6, alignItems: 'center' }}>
                                  <span style={{ width: 14, fontWeight: 700 }}>{t('lookahead.c')}</span>
                                  <input type="date" aria-label={`${s.code} ${g.code} ${t('lookahead.basis.commitment')}`} style={{ ...input, padding: '4px 6px' }}
                                    value={val(key, 'commitment')} disabled={!canCommit} onChange={e => setVal(key, 'commitment', e.target.value)} />
                                </label>
                                {gap != null && gap !== 0 && <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: gap > 0 ? 'var(--danger-700)' : 'var(--success-700)' }}>{t('lookahead.gap', { n: gap > 0 ? `+${gap}` : String(gap) })}</span>}
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', position: 'sticky', bottom: 0, background: 'var(--page-bg, var(--card-bg))', padding: '10px 0' }}>
            {needsReason && (
              <input aria-label={t('lookahead.reason')} placeholder={t('lookahead.reason')} style={{ ...input, maxWidth: 420 }} value={reason} onChange={e => setReason(e.target.value)} />
            )}
            <button type="button" style={btn('primary', isPending || changes.length === 0 || (needsReason && reason.trim().length < 3))}
              disabled={isPending || changes.length === 0 || (needsReason && reason.trim().length < 3)} onClick={save}>
              {isPending ? t('form.saving') : t('lookahead.saveChanges', { n: changes.length })}
            </button>
            {changes.length > 0 && <button type="button" style={btn('outline')} disabled={isPending} onClick={() => setDraft({})}>{t('lookahead.discard')}</button>}
          </div>
        </>
      )}
    </div>
  )
}
