import type { RunStepStatus, ValvePosition } from '../startup/catalog'

/**
 * Offline de arranque (fase 6; decisiones offline de Luis 2026-10-16) — reglas puras de la bandeja de ejecuciones y line-ups.
 * Sin imports de Next ni Supabase para testearlas en vitest.
 *
 * Qué se encola sin red: marcar un paso (hecho / N/A / llegar a un hold point), DETENER y fijar la posición
 * de una fila. Liberar, reanudar, completar, abortar, verificar y completar la hoja exigen red.
 *
 * Replay: en orden de captura. Un paso rechazado por el servidor no se reintenta solo: queda en la bandeja
 * «No sincronizado» y RETIENE los pasos posteriores de la misma ejecución (el orden es estricto). Detener nunca
 * se retiene (es seguridad). Las filas de line-up son independientes: compare-and-set contra el set_at /
 * verified_at que vio el dispositivo; si la fila cambió, queda en «conflicto» y decide el usuario.
 */

export type StartupOp =
  | { kind: 'run_step'; projectId: string; runId: string; stepId: string; ord: number; isHold: boolean; na: boolean; actual: string | null; comment: string | null }
  | { kind: 'run_stop'; projectId: string; runId: string; comment: string }
  | {
      kind: 'lineup_set'; projectId: string; sheetId: string; itemId: string; found: ValvePosition; remarks: string | null
      /** S25b (E-21): como se encontró, candado y sello (opcionales; capturas anteriores no los traen). */
      asFound?: ValvePosition | null; lockNumber?: string | null; sealNumber?: string | null
      /** set_at / verified_at de la fila tal como los vio el dispositivo (string original de PostgREST, con microsegundos). */
      expectedSetAt: string | null; expectedVerifiedAt: string | null
      /** «Aplicar la mía» tras un conflicto: se envía sin compare-and-set. */
      force?: boolean
    }

export type StartupEntryState = 'pending' | 'rejected' | 'conflict'

/** Estado de la fila en el servidor cuando el compare-and-set falla. */
export type LineupRemote = { found: ValvePosition | null; setBy: string | null; setAt: string | null; verifiedBy: string | null; verifiedAt: string | null }

export type StartupEntry = StartupOp & {
  id?: number
  /** S18: usuario que capturó (ausente en entradas de antes de S18). */
  capturedBy?: string | null
  /** Hora de captura en el dispositivo (ISO): el servidor la guarda como hora de campo. */
  capturedAt: string
  state: StartupEntryState
  error?: string | null
  remote?: LineupRemote | null
}

export type StartupScope = { runId: string } | { sheetId: string }

export function inScope(e: StartupOp, scope: StartupScope): boolean {
  return 'runId' in scope ? e.kind !== 'lineup_set' && e.runId === scope.runId : e.kind === 'lineup_set' && e.sheetId === scope.sheetId
}

const byId = (a: StartupEntry, b: StartupEntry) => (a.id ?? 0) - (b.id ?? 0)

/** Paso retenido: hay un paso anterior (en orden de captura) de la misma ejecución que el servidor rechazó. */
export function isHeld(entry: StartupEntry, all: readonly StartupEntry[]): boolean {
  if (entry.kind !== 'run_step') return false
  return all.some(o => o.kind === 'run_step' && o.runId === entry.runId && (o.id ?? 0) < (entry.id ?? 0) && o.state !== 'pending')
}

/** Siguiente entrada a enviar: la pendiente más antigua que no esté retenida. */
export function nextSendable(all: readonly StartupEntry[]): StartupEntry | null {
  return [...all].sort(byId).find(e => e.state === 'pending' && !isHeld(e, all)) ?? null
}

export type StartupSendResult =
  | { ok: true; redundant?: boolean }
  | { error: string; conflict?: LineupRemote | null }

/** Qué hacer con una entrada tras la respuesta del servidor (un fallo de red no llega aquí: detiene el replay). */
export function settle(res: StartupSendResult): { remove: true } | { remove: false; patch: Pick<StartupEntry, 'state' | 'error' | 'remote'> } {
  if ('ok' in res) return { remove: true }
  if (res.conflict) return { remove: false, patch: { state: 'conflict', error: res.error, remote: res.conflict } }
  return { remove: false, patch: { state: 'rejected', error: res.error, remote: null } }
}

/**
 * Nueva captura de una fila: reemplaza la entrada previa de esa fila (si la hay). Conserva el compare-and-set
 * de la captura original si seguía pendiente; si estaba en conflicto, el usuario ya vio el estado del servidor,
 * así que la base pasa a ser ese estado remoto.
 */
export function coalesceLineupSet(
  all: readonly StartupEntry[],
  op: Extract<StartupOp, { kind: 'lineup_set' }>,
): { replaceId: number | null; op: Extract<StartupOp, { kind: 'lineup_set' }> } {
  const prev = all.find(e => e.kind === 'lineup_set' && e.itemId === op.itemId) as (StartupEntry & { kind: 'lineup_set' }) | undefined
  if (!prev) return { replaceId: null, op }
  if (prev.state === 'conflict' && prev.remote) {
    return { replaceId: prev.id ?? null, op: { ...op, expectedSetAt: prev.remote.setAt, expectedVerifiedAt: prev.remote.verifiedAt, force: false } }
  }
  return { replaceId: prev.id ?? null, op: { ...op, expectedSetAt: prev.expectedSetAt, expectedVerifiedAt: prev.expectedVerifiedAt, force: prev.force } }
}

// ── Vista local (servidor + bandeja) ────────────────────────────────────

export type SyncMark = 'pending' | 'conflict'

type RunStepLike = { stepId: string; ord: number; status: RunStepStatus; actual: string | null; comment: string | null; doneBy: string | null; doneAt: string | null }

/**
 * Superpone los pasos pendientes de sincronizar sobre lo que trajo el servidor. Solo se aplican las entradas
 * pendientes; con rechazos la ejecución queda bloqueada en local (`locked`) hasta que el usuario los resuelva.
 */
export function overlayRun<S extends RunStepLike>(
  run: { status: string; stopReason: string | null },
  steps: readonly S[],
  all: readonly StartupEntry[],
  userId: string,
): { status: string; stopReason: string | null; steps: (S & { sync?: SyncMark })[]; locked: boolean; pending: number } {
  const mine = all.filter(e => e.kind !== 'lineup_set').sort(byId)
  const pendingSteps = new Map<string, StartupEntry & { kind: 'run_step' }>()
  let stop: (StartupEntry & { kind: 'run_stop' }) | null = null
  for (const e of mine) {
    if (e.state !== 'pending' || isHeld(e, mine)) continue
    if (e.kind === 'run_step') pendingSteps.set(e.stepId, e)
    else if (e.kind === 'run_stop') stop = e
  }
  const out = steps.map(s => {
    const e = pendingSteps.get(s.stepId)
    if (!e || s.status !== 'pending') return { ...s }
    const status: RunStepStatus = e.na ? 'na' : e.isHold ? 'at_hold' : 'done'
    return { ...s, status, actual: e.actual, comment: e.comment, doneBy: userId, doneAt: e.capturedAt, sync: 'pending' as const }
  })
  const live = run.status === 'in_progress' || run.status === 'at_hold'
  let status = run.status
  let stopReason = run.stopReason
  if (live && out.some(s => s.status === 'at_hold')) status = 'at_hold'
  if (live && stop) { status = 'stopped'; stopReason = stop.comment }
  return { status, stopReason, steps: out, locked: mine.some(e => e.state !== 'pending'), pending: mine.length }
}

type LineupItemLike = {
  id: string; found_position: ValvePosition | null; remarks: string | null
  as_found_position?: ValvePosition | null; lock_number?: string | null; seal_number?: string | null
  set_by: string | null; set_at: string | null; verified_by: string | null; verified_at: string | null
}

/** Filas con su posición pendiente aplicada (re-fijar borra la verificación, como en el servidor). */
export function overlayLineup<I extends LineupItemLike>(items: readonly I[], all: readonly StartupEntry[], userId: string): (I & { sync?: SyncMark })[] {
  const byItem = new Map<string, StartupEntry & { kind: 'lineup_set' }>()
  for (const e of all) if (e.kind === 'lineup_set') byItem.set(e.itemId, e)
  return items.map(i => {
    const e = byItem.get(i.id)
    if (!e) return { ...i }
    if (e.state !== 'pending') return { ...i, sync: 'conflict' as const }
    return { ...i, found_position: e.found, remarks: e.remarks, as_found_position: e.asFound ?? null, lock_number: e.lockNumber ?? null, seal_number: e.sealNumber ?? null, set_by: userId, set_at: e.capturedAt, verified_by: null, verified_at: null, sync: 'pending' as const }
  })
}

/** Las acciones que exigen red (liberar, reanudar, completar, verificar…) piden además una bandeja vacía en su ámbito. */
export function networkActionsAllowed(online: boolean, entriesInScope: number): boolean {
  return online && entriesInScope === 0
}
