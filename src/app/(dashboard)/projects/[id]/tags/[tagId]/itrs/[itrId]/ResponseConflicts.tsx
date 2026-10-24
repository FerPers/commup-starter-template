'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { getAllQueued, OUTBOX_CHANGED_EVENT, patchResponseEntry, removeFromQueue, type QueuedResponse } from '@/lib/offline-queue'
import { replayQueueOnce } from '@/lib/sync/replay'
import { ownershipOf } from '@/lib/sync/ownership'
import { responseValueLabel } from '@/lib/sync/response-utils'
import { formatInZone } from '@/lib/time/zone'

/**
 * S18 sesión 2 (B-16, decisión de Luis 2026-10-20): respuestas capturadas sin red cuya casilla cambió otra persona
 * después de que el dispositivo la vio. Muestra «tu valor» frente al actual y decide el usuario:
 * «Aplicar la mía» (se reenvía sin comprobar versión) o «Descartar» (rastro en sync_conflicts; exige red).
 */
export default function ResponseConflicts({ itrId, userId, labels, names, timezone }: {
  itrId: string
  userId: string
  /** item_id → «N.º descripción». */
  labels: Record<string, string>
  /** user_id → nombre (miembros del proyecto que ya carga la página). */
  names: Record<string, string>
  timezone: string
}) {
  const t = useTranslations('ItrExecution.sync')
  const locale = useLocale()
  const [rows, setRows] = useState<QueuedResponse[]>([])
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const load = () => {
      getAllQueued()
        .then(all => { if (alive) setRows(all.filter(r => r.itrId === itrId && r.state === 'conflict' && ownershipOf(r, userId) === 'mine')) })
        .catch(() => {})
    }
    load()
    window.addEventListener(OUTBOX_CHANGED_EVENT, load)
    return () => { alive = false; window.removeEventListener(OUTBOX_CHANGED_EVENT, load) }
  }, [itrId, userId])

  if (rows.length === 0) return null
  const whoChanged = (id: string | null | undefined) => (id && names[id] ? names[id] : undefined)
  const vl = { yes: t('yes'), no: t('no'), empty: '—' }

  async function applyMine(r: QueuedResponse) {
    if (r.id === undefined) return
    setBusy(r.id); setError(null)
    await patchResponseEntry(r.id, { state: 'pending', force: true, remote: null })
    if (navigator.onLine) await replayQueueOnce().catch(() => {})
    setBusy(null)
  }

  async function discard(r: QueuedResponse) {
    if (r.id === undefined) return
    if (!navigator.onLine) { setError(t('discardNeedsNetwork')); return }
    setBusy(r.id); setError(null)
    const { error: err } = await createClient().rpc('log_sync_conflict', {
      p_entity_type: 'itr_response',
      p_entity_id: `${r.itrId}:${r.itemId}`,
      p_local_payload: { valueText: r.valueText ?? null, valueNumeric: r.valueNumeric ?? null, valueBool: r.valueBool ?? null, valueOption: r.valueOption ?? null, remarks: r.remarks ?? null },
      p_remote_payload: r.remote ?? {},
      p_local_ts: r.updatedAt ?? r.queuedAt,
      p_remote_ts: r.remote?.respondedAt ?? new Date().toISOString(),
      p_winner: 'remote',
      p_notes: 'Conflicto sin red: el usuario conservó el valor del servidor',
    })
    if (err) setError(err.message)
    else await removeFromQueue(r.id)
    setBusy(null)
  }

  return (
    <div role="alert" style={{ marginTop: '12px', padding: '10px 14px', background: 'var(--warning-50)', borderRadius: '8px', border: '1px solid var(--warning-200)' }}>
      <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--warning-800)', margin: '0 0 6px' }}>⚠ {t('conflictTitle')}</p>
      {error && <p style={{ fontSize: '12px', color: 'var(--danger-700)', margin: '0 0 6px' }}>{error}</p>}
      {rows.map(r => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, fontSize: '12px', color: 'var(--warning-900)' }}>
            <div style={{ fontWeight: 600 }}>{labels[r.itemId] ?? r.itemId}</div>
            <div>{t('conflictMine', { value: responseValueLabel(r, vl) })}</div>
            <div>{t('conflictTheirs', {
              value: r.remote ? responseValueLabel(r.remote, vl) : '—',
              who: whoChanged(r.remote?.respondedBy) ?? t('someone'),
              when: r.remote?.respondedAt ? formatInZone(r.remote.respondedAt, timezone, locale) : '—',
            })}</div>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <button type="button" disabled={busy !== null} onClick={() => { void applyMine(r) }}
              style={{ padding: '3px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--warning-500)', background: 'var(--warning-100)', color: 'var(--warning-800)', fontWeight: 600, cursor: 'pointer' }}>
              {t('applyMine')}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => { void discard(r) }}
              style={{ padding: '3px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--danger-200)', background: 'var(--card-bg)', color: 'var(--danger-700)', cursor: 'pointer' }}>
              {t('keepTheirs')}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
