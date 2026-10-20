'use client'

/**
 * Offline de arranque (fase 6; decisiones offline de Luis 2026-10-16) — helpers de cliente «enviar o encolar» y replay de la bandeja
 * de ejecuciones y line-ups. Reglas puras en ./startup-outbox-utils.ts.
 */

import { completeRunStep, setLineupItem, transitionProcedureRun } from '@/app/actions/startup'
import { createClient } from '@/lib/supabase/client'
import {
  enqueueStartup, getStartupOutbox, patchStartupEntry, removeStartupEntry, STARTUP_SYNC_ISSUE_EVENT,
} from '@/lib/offline-queue'
import type { Json } from '@/types/supabase.generated'
import { isNetworkFailure } from './outbox-utils'
import { currentUserId } from './owner'
import { sendableBy } from './ownership'
import { coalesceLineupSet, nextSendable, settle, type StartupEntry, type StartupOp, type StartupSendResult } from './startup-outbox-utils'

/**
 * Envía en línea si se puede; si no hay red (o ya hay capturas en cola en ese ámbito, para no adelantarlas),
 * encola. `queued: true` cuando quedó pendiente de sincronizar.
 */
export async function sendOrQueueStartup(
  op: StartupOp,
  send: () => Promise<{ error?: string }>,
  opts: { mustQueue: boolean },
): Promise<{ queued: boolean } | { error: string }> {
  if (!opts.mustQueue && typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const res = await send()
      if (res.error) return { error: res.error }
      return { queued: false }
    } catch (err) {
      if (!isNetworkFailure(err)) return { error: err instanceof Error ? err.message : String(err) }
    }
  }
  const uid = await currentUserId()
  if (op.kind === 'lineup_set') {
    // S18: solo se fusiona con una captura propia de la misma fila.
    const { replaceId, op: merged } = coalesceLineupSet(sendableBy(await getStartupOutbox(), uid), op)
    await enqueueStartup(merged, replaceId, uid)
  } else {
    await enqueueStartup(op, null, uid)
  }
  return { queued: true }
}

async function sendEntry(e: StartupEntry): Promise<StartupSendResult> {
  if (e.kind === 'run_step') {
    const res = await completeRunStep({
      projectId: e.projectId, runId: e.runId, stepId: e.stepId, actual: e.actual ?? undefined, comment: e.comment ?? undefined,
      na: e.na, capturedAt: e.capturedAt,
    })
    return res.error ? { error: res.error } : { ok: true }
  }
  if (e.kind === 'run_stop') {
    const res = await transitionProcedureRun({ projectId: e.projectId, runId: e.runId, to: 'stopped', comment: e.comment, capturedAt: e.capturedAt })
    return res.error ? { error: res.error } : { ok: true }
  }
  const res = await setLineupItem({
    projectId: e.projectId, sheetId: e.sheetId, itemId: e.itemId, found: e.found, remarks: e.remarks ?? undefined,
    capturedAt: e.capturedAt, check: !e.force, expectedSetAt: e.expectedSetAt, expectedVerifiedAt: e.expectedVerifiedAt,
  })
  if (res.error) return { error: res.error, conflict: res.conflict ?? null }
  return { ok: true, redundant: res.status === 'redundant' }
}

/**
 * Drena la bandeja de arranque en orden de captura. Un fallo de red detiene el replay; un rechazo deja la
 * entrada en la bandeja «No sincronizado» (sin reintento automático) y retiene los pasos posteriores de esa
 * ejecución. Lo llama replayQueueOnce (src/lib/sync/replay.ts), que ya serializa los replays.
 */
export async function replayStartupOnce(userId: string | null): Promise<{ flushed: number; issues: number; remaining: number }> {
  let flushed = 0
  let issues = 0
  // S18: solo las capturas del usuario en sesión; las demás quedan retenidas (banner del shell).
  let entries = sendableBy(await getStartupOutbox(), userId)
  for (let guard = 0; guard < 500; guard++) {
    const e = nextSendable(entries)
    if (!e || e.id === undefined) break
    let res: StartupSendResult
    try {
      res = await sendEntry(e)
    } catch (err) {
      if (isNetworkFailure(err)) break
      res = { error: err instanceof Error ? err.message : String(err) }
    }
    const outcome = settle(res)
    if (outcome.remove) {
      await removeStartupEntry(e.id)
      flushed++
    } else {
      await patchStartupEntry(e.id, outcome.patch)
      issues++
    }
    entries = sendableBy(await getStartupOutbox(), userId)
  }
  if (issues > 0 && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(STARTUP_SYNC_ISSUE_EVENT, { detail: { count: issues } }))
  return { flushed, issues, remaining: entries.length }
}

/** «Reintentar» un rechazo o «Aplicar la mía» en un conflicto de line-up (sin compare-and-set). */
export async function retryStartupEntry(e: StartupEntry): Promise<void> {
  if (e.id === undefined) return
  await patchStartupEntry(e.id, { state: 'pending', error: null, ...(e.kind === 'lineup_set' && e.state === 'conflict' ? { force: true } : {}) } as Partial<StartupEntry>)
}

/** Descarta un rechazo o conflicto dejando rastro en sync_conflicts (exige red). */
export async function discardStartupEntry(e: StartupEntry): Promise<{ error?: string }> {
  if (e.id === undefined) return {}
  const supabase = createClient()
  const entityType = e.kind === 'run_step' ? 'procedure_run_step' : e.kind === 'run_stop' ? 'procedure_run' : 'lineup_item'
  const entityId = e.kind === 'run_step' ? `${e.runId}:${e.stepId}` : e.kind === 'run_stop' ? e.runId : e.itemId
  const { error } = await supabase.rpc('log_sync_conflict', {
    p_project_id: e.projectId, // S15 (E-37)
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_local_payload: payload(e),
    p_remote_payload: (e.remote ?? {}) as Json,
    p_local_ts: e.capturedAt,
    p_remote_ts: e.remote?.setAt ?? new Date().toISOString(),
    p_winner: 'remote',
    p_notes: `Descartado por el usuario: ${e.error ?? 'sin motivo'}`,
  })
  if (error) return { error: error.message }
  await removeStartupEntry(e.id)
  return {}
}

function payload(e: StartupEntry): Json {
  if (e.kind === 'run_step') return { kind: e.kind, runId: e.runId, stepId: e.stepId, ord: e.ord, na: e.na, actual: e.actual, comment: e.comment }
  if (e.kind === 'run_stop') return { kind: e.kind, runId: e.runId, comment: e.comment }
  return { kind: e.kind, sheetId: e.sheetId, itemId: e.itemId, found: e.found, remarks: e.remarks, expectedSetAt: e.expectedSetAt, expectedVerifiedAt: e.expectedVerifiedAt }
}
