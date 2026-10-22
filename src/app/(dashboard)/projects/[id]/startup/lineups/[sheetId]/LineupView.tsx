'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { saveLineupItems, setLineupItem, transitionLineupSheet, verifyLineupItem, type LineupItemDraft } from '@/app/actions/startup'
import {
  LINEUP_FILTERS, VALVE_POSITIONS, filterLineupItems, lineupItemState, lineupProgress, needsLockOrSeal, textOrNull, type LineupFilter, type ValvePosition,
} from '@/lib/startup/catalog'
import { useAskDialog } from '@/components/ui/AskDialog'
import { networkActionsAllowed, overlayLineup, type StartupEntry } from '@/lib/sync/startup-outbox-utils'
import { SyncBanner, SyncTray, useStartupOutbox } from '../../OfflineSync'
import { TagPicker } from '../../../registers/RegisterFields'
import { Alert, Chip, btn, card, input, small } from '../../../daily/daily-ui'
import { SHEET_TONE } from '../../StartupView'
import { useLocalTime } from '@/lib/use-local-time'

type Item = {
  id: string; ord: number; tag_id: string | null; tag_number: string | null; description: string | null; label: string
  required_position: ValvePosition | null; required_note: string; is_critical: boolean; found_position: ValvePosition | null; remarks: string | null
  set_by: string | null; set_at: string | null; verified_by: string | null; verified_at: string | null
  /** S25b (E-21) */
  as_found_position: ValvePosition | null; lock_number: string | null; seal_number: string | null; pid: string | null
}
type Sheet = {
  id: string; number: string; title: string; purpose: string; status: string; system: string; procedure: { id: string; number: string; title: string } | null
  verifiedBy: string | null; verifiedAt: string | null; issuedAt: string | null; hash: string | null; stale: boolean; createdBy: string | null
}
const STATE_TONE = { pending: 'muted', misaligned: 'red', aligned: 'green', to_verify: 'amber', verified: 'green' } as const
const KIND_TONE: Record<string, 'red' | 'amber' | 'violet' | 'blue' | 'muted'> = { bypass: 'red', blind: 'amber', temporary: 'violet', energization: 'red', reinstatement: 'blue', test_pack: 'muted' }

export default function LineupView({ project, sheet, items: serverItems, registers, names, userId, role }: {
  project: { id: string; code: string; name: string }; sheet: Sheet; items: Item[]
  registers: { id: string; number: string; kind: string; status: string; title: string }[]
  names: Record<string, string>; userId: string; role: string
}) {
  const t = useTranslations('Startup')
  const tOff = useTranslations('Startup.offline')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<(LineupItemDraft & { tag_number?: string | null })[]>(() =>
    serverItems.map(i => ({ tag_id: i.tag_id, tag_number: i.tag_number, label: i.label, required_position: i.required_position, required_note: i.required_note, is_critical: i.is_critical })))
  const [newTags, setNewTags] = useState<{ tag_id: string; tag_number: string; role: 'subject' }[]>([])
  const isClient = role === 'client'
  const draft = sheet.status === 'draft'
  const executing = sheet.status === 'issued' || sheet.status === 'in_progress'
  // Offline (F6): las posiciones fijadas sin red se superponen hasta sincronizar.
  const outbox = useStartupOutbox('sheet', sheet.id)
  const items = overlayLineup(serverItems, outbox.entries, userId)
  const prog = lineupProgress(items)
  const netOk = networkActionsAllowed(!outbox.isOffline, outbox.entries.length)
  const online = !outbox.isOffline
  const who = (id: string | null) => (id ? names[id] : undefined) ?? '—'
  const localTime = useLocalTime()  // S10 (E-15b): hora local con su zona, no la UTC del servidor
  const when = (iso: string | null) => localTime(iso)
  const ids = { projectId: project.id, sheetId: sheet.id }
  // S25b (E-21): filtros para hojas largas y detalle de la fila (encontrada / dejada, candado o sello, observaciones).
  const [filter, setFilter] = useState<LineupFilter>('all')
  const [query, setQuery] = useState('')
  const [byPid, setByPid] = useState(false)
  type Edit = { itemId: string; asFound: ValvePosition | ''; left: ValvePosition | ''; lock: string; seal: string; remarks: string }
  const [editing, setEditing] = useState<Edit | null>(null)
  const { dialog, ask } = useAskDialog()

  function act(fn: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) { setError(res.error); return }
      after?.()
      router.refresh()
    })
  }
  const save = () => saveLineupItems({ ...ids, items: drafts })
  const setD = (i: number, p: Partial<LineupItemDraft>) => setDrafts(list => list.map((d, j) => (j === i ? { ...d, ...p } : d)))
  const allRequired = drafts.length > 0 && drafts.every(d => d.required_position)
  /** Fijar posición: en línea si se puede; si no (o si la fila ya tiene una captura en cola), queda en el dispositivo. */
  function setPosition(
    i: (typeof items)[number], found: ValvePosition,
    detail: { asFound: ValvePosition | null; lock: string | null; seal: string | null; remarks: string | null } =
      { asFound: i.as_found_position ?? null, lock: i.lock_number ?? null, seal: i.seal_number ?? null, remarks: i.remarks ?? null },
  ) {
    // LO/LC sin candado ni sello: se abre el detalle en vez de enviar algo que la BD rechazará.
    if (needsLockOrSeal(found) && !detail.lock?.trim() && !detail.seal?.trim()) {
      setEditing({ itemId: i.id, asFound: detail.asFound ?? '', left: found, lock: '', seal: '', remarks: detail.remarks ?? '' })
      return
    }
    const base = serverItems.find(x => x.id === i.id) ?? i
    const queuedRow = outbox.entries.some(e => e.kind === 'lineup_set' && e.itemId === i.id)
    const extra = { asFound: detail.asFound, lockNumber: textOrNull(detail.lock), sealNumber: textOrNull(detail.seal) }
    const remarks = textOrNull(detail.remarks)
    setError(null)
    startTransition(async () => {
      const res = await outbox.capture(
        { kind: 'lineup_set', ...ids, itemId: i.id, found, remarks, ...extra, expectedSetAt: base.set_at, expectedVerifiedAt: base.verified_at },
        () => setLineupItem({ ...ids, itemId: i.id, found, remarks: remarks ?? undefined, ...extra }),
        queuedRow,
      )
      if ('error' in res) setError(res.error)
      else setEditing(null)
    })
  }
  const pos = (p: ValvePosition | null) => (p ? t(`position.${p}`) : '—')
  const itemLabel = (e: StartupEntry) => {
    if (e.kind !== 'lineup_set') return ''
    const i = serverItems.find(x => x.id === e.itemId)
    return `${i?.tag_number ?? i?.label ?? '?'} → ${pos(e.found)}`
  }
  const conflictDetail = (e: StartupEntry) => e.kind === 'lineup_set' && e.remote ? (
    <span style={{ ...small, display: 'flex', flexDirection: 'column' }} suppressHydrationWarning>
      <span>{tOff('conflictMine', { pos: pos(e.found), when: when(e.capturedAt) })}</span>
      <span>{tOff('conflictServer', { pos: pos(e.remote.found), who: who(e.remote.setBy), when: when(e.remote.setAt) })}
        {e.remote.verifiedAt ? ` · ${tOff('conflictVerified', { who: who(e.remote.verifiedBy) })}` : ''}</span>
    </span>
  ) : null

  return (
    <div style={{ padding: '20px 16px', maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {dialog}
      <div>
        <Link href={`/projects/${project.id}/startup?tab=lineups`} style={{ ...small, textDecoration: 'none', color: 'var(--primary-600, #2563eb)' }}>← {t('tab.lineups')}</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace' }}>{sheet.number}</h1>
          <Chip tone={SHEET_TONE[sheet.status] ?? 'muted'}>{t(`sheetStatus.${sheet.status}`)}</Chip>
          {sheet.stale && <Chip tone="red">{t('lineup.stale')}</Chip>}
          <span style={small}>{prog.done}/{prog.total}</span>
          <a href={`/projects/${project.id}/startup/lineups/${sheet.id}/pdf`} target="_blank" rel="noopener" style={{ ...btn('outline'), marginLeft: 'auto', textDecoration: 'none' }} title="PDF">PDF</a>
        </div>
        <p style={{ margin: '4px 0 0', color: 'var(--text-strong)' }}>{sheet.title}</p>
        <p style={{ ...small, margin: '2px 0 0' }}>
          {sheet.system} · {t(`purpose.${sheet.purpose}`)}
          {sheet.procedure && <> · <Link href={`/projects/${project.id}/startup/procedures/${sheet.procedure.id}`} style={{ color: 'var(--primary-600, #2563eb)' }}>{sheet.procedure.number}</Link></>}
        </p>
        {sheet.verifiedAt && <p style={{ ...small, margin: '2px 0 0' }} suppressHydrationWarning>{t('lineup.verifiedBy', { who: who(sheet.verifiedBy), when: when(sheet.verifiedAt) })} · sha256 {sheet.hash?.slice(0, 16)}</p>}
      </div>

      {!draft && <SyncBanner isOffline={outbox.isOffline} count={outbox.sendable} syncing={outbox.syncing} onSync={() => void outbox.sync()} />}
      {error && <Alert kind="error">{error}</Alert>}
      <SyncTray entries={outbox.entries} isOffline={outbox.isOffline} describe={itemLabel} conflictDetail={conflictDetail} onChanged={() => void outbox.sync()} />
      {sheet.stale && <Alert kind="warn">{t('lineup.staleHelp')}</Alert>}

      {registers.length > 0 && (
        <section style={{ ...card, padding: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', marginBottom: 6 }}>{t('lineup.registers', { n: registers.length })}</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {registers.map(r => (
              <li key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 'var(--text-sm)' }}>
                <Link href={`/projects/${project.id}/registers/${r.id}`} style={{ fontWeight: 700, fontFamily: 'ui-monospace, monospace', color: 'var(--text-strong)', textDecoration: 'none' }}>{r.number}</Link>
                <Chip tone={KIND_TONE[r.kind] ?? 'muted'}>{r.kind}</Chip>
                <span>{r.title}</span><span style={small}>· {r.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Borrador: definir filas */}
      {draft && !isClient && (
        <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ ...small, margin: 0 }}>{t('lineup.draftHelp')}</p>
          {drafts.map((d, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
              <strong style={{ width: 24, fontFamily: 'ui-monospace, monospace' }}>{i + 1}</strong>
              {d.tag_id
                ? <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600, minWidth: 140 }}>{d.tag_number ?? '?'}</span>
                : <input aria-label={t('lineup.label')} placeholder={t('lineup.label')} style={{ ...input, width: 180 }} value={d.label} onChange={e => setD(i, { label: e.target.value })} />}
              <select aria-label={t('lineup.required')} style={{ ...input, width: 170 }} value={d.required_position ?? ''} onChange={e => setD(i, { required_position: (e.target.value || null) as ValvePosition | null })}>
                <option value="">{t('lineup.requiredPick')}</option>
                {VALVE_POSITIONS.map(p => <option key={p} value={p}>{t(`position.${p}`)}</option>)}
              </select>
              <input aria-label={t('lineup.note')} placeholder={t('lineup.note')} style={{ ...input, flex: 1, minWidth: 140 }} value={d.required_note} onChange={e => setD(i, { required_note: e.target.value })} />
              <label style={{ ...small, display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <input type="checkbox" checked={d.is_critical} onChange={e => setD(i, { is_critical: e.target.checked })} /> {t('lineup.critical')}
              </label>
              <button type="button" style={{ ...btn('outline'), color: 'var(--danger-700)' }} aria-label={t('step.remove')} onClick={() => setDrafts(l => l.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ minWidth: 280, flex: 1 }}>
              <TagPicker projectId={project.id} kind="temporary" value={newTags} onChange={v => {
                const added = v.filter(x => !drafts.some(d => d.tag_id === x.tag_id))
                setDrafts(l => [...l, ...added.map(x => ({ tag_id: x.tag_id, tag_number: x.tag_number, label: '', required_position: null, required_note: '', is_critical: false }))])
                setNewTags([])
              }} />
            </div>
            <button type="button" style={btn('outline')} onClick={() => setDrafts(l => [...l, { tag_id: null, label: '', required_position: null, required_note: '', is_critical: false }])}>+ {t('lineup.addManual')}</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={btn('outline', isPending)} disabled={isPending} onClick={() => act(save)}>{t('save')}</button>
            <button type="button" style={btn('primary', isPending || !allRequired)} disabled={isPending || !allRequired}
              onClick={() => act(async () => { const s = await save(); if (s.error) return s; return transitionLineupSheet({ ...ids, to: 'issued' }) })}>{t('lineup.issue')}</button>
            {(sheet.createdBy === userId || role === 'owner' || role === 'admin') && (
              <button type="button" style={{ ...btn('outline'), color: 'var(--danger-700)' }} disabled={isPending}
                onClick={async () => {
                  if ((await ask({ title: t('editor.delete'), message: t('editor.deleteConfirm'), confirmLabel: t('editor.delete'), danger: true })) === null) return
                  act(() => transitionLineupSheet({ ...ids, to: 'deleted' }), () => router.push(`/projects/${project.id}/startup?tab=lineups`))
                }}>{t('editor.delete')}</button>
            )}
          </div>
          {!allRequired && drafts.length > 0 && <p style={{ ...small, margin: 0, color: '#b45309' }}>{t('lineup.needRequired')}</p>}
        </section>
      )}

      {/* Ejecución / consulta */}
      {!draft && (
        <section style={{ ...card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: 10 }} aria-label={t('lineup.filters')}>
          <input type="search" style={{ ...input, flex: '1 1 200px' }} placeholder={t('lineup.search')} aria-label={t('lineup.search')} value={query} onChange={e => setQuery(e.target.value)} />
          <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {LINEUP_FILTERS.map(f => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
                style={{ ...btn(filter === f ? 'primary' : 'outline'), padding: '6px 10px' }}>{t(`lineup.filter.${f}`)}</button>
            ))}
          </span>
          {items.some(i => i.pid) && (
            <label style={{ ...small, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={byPid} onChange={e => setByPid(e.target.checked)} /> {t('lineup.byPid')}
            </label>
          )}
        </section>
      )}
      {!draft && (() => {
        const shown = filterLineupItems(items, filter, query)
        const ordered = byPid ? [...shown].sort((a, b) => (a.pid ?? '\uffff').localeCompare(b.pid ?? '\uffff') || a.ord - b.ord) : shown
        return (
          <section style={{ ...card, padding: 0 }}>
            {ordered.length === 0 && <p style={{ ...small, padding: 14, margin: 0 }}>{t('lineup.noMatch')}</p>}
            {ordered.map((i, idx) => {
              const st = lineupItemState(i)
              const ed = editing?.itemId === i.id ? editing : null
              const groupHead = byPid && (idx === 0 || ordered[idx - 1].pid !== i.pid)
              return (
                <div key={i.id}>
                  {groupHead && <div style={{ ...small, fontWeight: 700, padding: '8px 14px', background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>{i.pid ?? t('lineup.noPid')}</div>}
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong style={{ fontFamily: 'ui-monospace, monospace', minWidth: 130 }}>{i.tag_number ?? i.label}</strong>
                      {i.is_critical && <Chip tone="red">{t('lineup.critical')}</Chip>}
                      <span style={small}>{t('lineup.requiredShort')}: <strong style={{ color: 'var(--text-strong)' }}>{i.required_position ? t(`position.${i.required_position}`) : '—'}</strong>{i.required_note ? ` · ${i.required_note}` : ''}</span>
                      <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                        {i.sync === 'pending' && <Chip tone="blue">{tOff('chipPending')}</Chip>}
                        {i.sync === 'conflict' && <Chip tone="red">{tOff('chipConflict')}</Chip>}
                        <Chip tone={STATE_TONE[st]}>{t(`itemState.${st}`)}</Chip>
                      </span>
                    </div>
                    {i.description && <span style={{ ...small, fontSize: 'var(--text-xs)' }}>{i.description}</span>}
                    {i.set_at && (
                      <span style={{ ...small, fontSize: 'var(--text-xs)' }} suppressHydrationWarning>
                        {i.as_found_position && <>{t('lineup.asFound')}: {pos(i.as_found_position)} → </>}
                        {t('lineup.left')}: <strong>{pos(i.found_position)}</strong>
                        {i.lock_number && ` · ${t('lineup.lock')} ${i.lock_number}`}{i.seal_number && ` · ${t('lineup.seal')} ${i.seal_number}`}
                        {' · '}{who(i.set_by)} {when(i.set_at)}{i.remarks ? ` — ${i.remarks}` : ''}
                        {i.verified_at && ` · ${t('lineup.verifiedItem', { who: who(i.verified_by), when: when(i.verified_at) })}`}
                      </span>
                    )}
                    {executing && !ed && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {!isClient && VALVE_POSITIONS.filter(p => p === i.required_position || ['open', 'closed'].includes(p)).map(p => (
                          <button key={p} type="button" disabled={isPending}
                            style={{ ...btn(i.found_position === p ? 'primary' : 'outline', isPending), padding: '8px 12px' }}
                            onClick={() => setPosition(i, p)}>{t(`position.${p}`)}</button>
                        ))}
                        {!isClient && (
                          <button type="button" style={{ ...btn('outline'), padding: '8px 12px' }} disabled={isPending}
                            onClick={() => setEditing({ itemId: i.id, asFound: i.as_found_position ?? '', left: i.found_position ?? i.required_position ?? '', lock: i.lock_number ?? '', seal: i.seal_number ?? '', remarks: i.remarks ?? '' })}>
                            {t('lineup.detail')}
                          </button>
                        )}
                        {(st === 'to_verify' || (st === 'aligned' && !i.verified_at)) && i.set_by !== userId && !i.sync && (
                          <button type="button" style={{ ...btn('primary', isPending || !online), padding: '8px 12px', background: 'var(--success-700, #047857)' }} disabled={isPending || !online}
                            title={online ? undefined : tOff('needsNetwork')}
                            onClick={() => act(() => verifyLineupItem({ ...ids, itemId: i.id }))}>✓ {t('lineup.verify')}</button>
                        )}
                        {st === 'to_verify' && i.set_by === userId && <span style={{ ...small, alignSelf: 'center' }}>{t('lineup.otherVerifies')}</span>}
                      </div>
                    )}
                    {executing && ed && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, padding: 10, background: 'var(--gray-50)', borderRadius: 8 }}>
                        <label style={{ ...small, display: 'flex', flexDirection: 'column', gap: 4 }}>{t('lineup.asFound')}
                          <select style={input} value={ed.asFound} onChange={e => setEditing({ ...ed, asFound: e.target.value as ValvePosition | '' })}>
                            <option value="">—</option>
                            {VALVE_POSITIONS.map(p => <option key={p} value={p}>{t(`position.${p}`)}</option>)}
                          </select>
                        </label>
                        <label style={{ ...small, display: 'flex', flexDirection: 'column', gap: 4 }}>{t('lineup.left')} *
                          <select style={input} value={ed.left} onChange={e => setEditing({ ...ed, left: e.target.value as ValvePosition | '' })}>
                            <option value="">—</option>
                            {VALVE_POSITIONS.map(p => <option key={p} value={p}>{t(`position.${p}`)}</option>)}
                          </select>
                        </label>
                        <label style={{ ...small, display: 'flex', flexDirection: 'column', gap: 4 }}>{t('lineup.lock')}{needsLockOrSeal(ed.left || null) ? ' *' : ''}
                          <input style={input} value={ed.lock} onChange={e => setEditing({ ...ed, lock: e.target.value })} />
                        </label>
                        <label style={{ ...small, display: 'flex', flexDirection: 'column', gap: 4 }}>{t('lineup.seal')}{needsLockOrSeal(ed.left || null) ? ' *' : ''}
                          <input style={input} value={ed.seal} onChange={e => setEditing({ ...ed, seal: e.target.value })} />
                        </label>
                        <label style={{ ...small, display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>{t('lineup.remarks')}
                          <input style={input} value={ed.remarks} placeholder={t('lineup.remarksHint')} onChange={e => setEditing({ ...ed, remarks: e.target.value })} />
                        </label>
                        {needsLockOrSeal(ed.left || null) && !ed.lock.trim() && !ed.seal.trim() && <span style={{ ...small, color: 'var(--danger-700)', gridColumn: '1 / -1' }}>{t('lineup.lockRequired')}</span>}
                        <span style={{ display: 'flex', gap: 6, gridColumn: '1 / -1' }}>
                          <button type="button" style={btn('primary', isPending || !ed.left || (needsLockOrSeal(ed.left) && !ed.lock.trim() && !ed.seal.trim()))}
                            disabled={isPending || !ed.left || (needsLockOrSeal(ed.left) && !ed.lock.trim() && !ed.seal.trim())}
                            onClick={() => ed.left && setPosition(i, ed.left, { asFound: ed.asFound || null, lock: ed.lock, seal: ed.seal, remarks: ed.remarks })}>{t('save')}</button>
                          <button type="button" style={btn('outline')} onClick={() => setEditing(null)}>{t('ops.close')}</button>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </section>
        )
      })()}

      {executing && !isClient && (
        <button type="button" style={{ ...btn('primary', isPending || !prog.complete || !netOk), padding: '12px 18px' }} disabled={isPending || !prog.complete || !netOk}
          onClick={() => act(() => transitionLineupSheet({ ...ids, to: 'verified' }))}>{t('lineup.complete')}</button>
      )}
      {executing && prog.complete && !netOk && <p style={{ ...small, margin: 0 }}>{outbox.isOffline ? tOff('needsNetwork') : tOff('syncFirst')}</p>}
      {executing && !prog.complete && <p style={{ ...small, margin: 0 }}>{t('lineup.progressHelp', { pending: prog.pending, misaligned: prog.misaligned, toVerify: prog.toVerify })}</p>}
    </div>
  )
}
