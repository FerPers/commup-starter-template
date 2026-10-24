// CommUp offline queue — IndexedDB-backed storage for ITR work captured while
// there is no network. No external libraries.
//
// Stores:
//   itr_responses  — respuestas de ítems (Stage 14.5), replay con LWW.
//   itr_snapshots  — obsoleto (S18, C-38): ya no se escribe; se vacía al cerrar sesión.
//   outbox         — Sprint O (2026-09-07): fotos (blob), punches y firmas capturados
//                    sin red, en orden de captura. Se drenan en src/lib/sync/replay.ts.
//   startup_outbox — fase 6 (2026-10-16): pasos de ejecución, «Detener» y posiciones de line-up
//                    capturados sin red. Reglas en src/lib/sync/startup-outbox-utils.ts.
//
// S18: cada entrada guarda `capturedBy` (usuario en sesión al capturar); el replay solo envía las del usuario
// en sesión (src/lib/sync/ownership.ts). Al cerrar sesión se vacía todo con clearOfflineData().

import type { StartupEntry, StartupOp } from './sync/startup-outbox-utils'
import { countByOwner, type OwnerCounts } from './sync/ownership'
import type { ResponseConflict, ResponseQueueState } from './sync/response-utils'

const DB_NAME = 'commup-offline'
const DB_VERSION = 4
const STORE = 'itr_responses'
const SNAPSHOTS_STORE = 'itr_snapshots'
const OUTBOX_STORE = 'outbox'
const STARTUP_STORE = 'startup_outbox'

/** Evento de ventana que se dispara cuando cambia la bandeja de salida (para refrescar contadores y miniaturas). */
export const OUTBOX_CHANGED_EVENT = 'commup:outbox-changed'
/** Evento de ventana tras un replay que subió algo al servidor (para router.refresh()). */
export const SYNC_DONE_EVENT = 'commup:sync-done'
/** Evento de ventana cuando el replay descarta una entrada (rechazo definitivo del servidor). detail: SyncDroppedDetail. */
export const SYNC_DROPPED_EVENT = 'commup:sync-dropped'
export type SyncDroppedDetail = { kind: OutboxInput['kind'] | 'response'; itrId: string; error: string }
/** Evento de ventana cuando el replay deja registros de arranque rechazados o en conflicto. detail: { count }. */
export const STARTUP_SYNC_ISSUE_EVENT = 'commup:startup-sync-issue'

export type OutboxPhoto = {
  kind: 'photo'
  itrId: string
  itemId: string | null
  projectId: string
  tagId: string
  fileName: string
  fileType: string
  blob: Blob
  /** A02: UUID de la captura (ruta fija + adjunto único). Ausente en fotos encoladas antes de A02: se fija al reenviar. */
  captureId?: string
  /** A02: hora del dispositivo al tomarla. Ausente antes de A02 → `queuedAt`. */
  capturedAt?: string
}

export type OutboxPunch = {
  kind: 'punch'
  itrId: string
  projectId: string
  tagId: string
  category: 'A' | 'B' | 'C'
  description: string
  targetDate: string | null
  /** Ausente en punch encolados antes de la fase 4 (impacto obligatorio). */
  impact?: 'safety' | 'process' | 'equipment' | 'operability' | 'environment'
  /** S06 (C-22): id generado en el cliente — el reenvío es idempotente y las fotos van a `<punchId>/…`. Ausente en entradas viejas. */
  punchId?: string
  itrItemId?: string | null
  assignedTo?: string | null
  /** S06 (C-22): fotos del defecto, tomadas con el punch (viajan juntas). */
  photos?: Array<{ fileName: string; fileType: string; blob: Blob }>
}

export type OutboxSignature = {
  kind: 'signature'
  itrId: string
  projectId: string
  tagId: string
  role: 'executor' | 'supervisor' | 'client'
  signatureImage: string | null
}

export type OutboxInput = OutboxPhoto | OutboxPunch | OutboxSignature

export type OutboxEntry = OutboxInput & {
  id?: number
  /** S18: usuario que capturó (ausente en entradas de antes de S18 → retenidas hasta confirmar). */
  capturedBy?: string | null
  queuedAt: string
  attempts: number
  lastError?: string | null
}

export type QueuedResponse = {
  id?: number            // auto-increment key
  itrId: string
  itemId: string
  templateId: string
  valueText?: string | null
  valueNumeric?: number | null
  valueBool?: boolean | null
  valueOption?: string | null
  remarks?: string | null
  isPassed?: boolean | null
  queuedAt: string
  updatedAt?: string     // ISO timestamp for conflict resolution
  /** S18: usuario que capturó; ausente en entradas de antes de S18. */
  capturedBy?: string | null
  /** S18 (C-07): rechazos lógicos del servidor; al agotar la política se descarta con rastro. */
  attempts?: number
  lastError?: string | null
  /** S18 sesión 2 (B-16): `responded_at` de la casilla tal como lo vio el dispositivo (null = sin respuesta). */
  expectedRespondedAt?: string | null
  /** «conflicto» = otra persona cambió la casilla; queda hasta que el usuario decide. */
  state?: ResponseQueueState
  remote?: ResponseConflict | null
  /** «Aplicar la mía»: enviar sin comprobar versión. */
  force?: boolean
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains(SNAPSHOTS_STORE)) {
        db.createObjectStore(SNAPSHOTS_STORE, { keyPath: 'itrId' })
      }
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE, { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains(STARTUP_STORE)) {
        db.createObjectStore(STARTUP_STORE, { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = e => resolve((e.target as IDBOpenDBRequest).result)
    req.onerror = () => reject(req.error)
  })
}

export async function enqueueResponse(item: Omit<QueuedResponse, 'id' | 'capturedBy' | 'attempts' | 'lastError'>, capturedBy: string | null): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).add({ ...item, capturedBy, attempts: 0 })
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function getAllQueued(): Promise<QueuedResponse[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => { db.close(); resolve(req.result as QueuedResponse[]) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

/** S18 (C-07): anota un rechazo lógico de una respuesta (no de red). */
export async function markResponseAttempt(id: number, lastError: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const req = store.get(id)
    req.onsuccess = () => {
      const row = req.result as QueuedResponse | undefined
      if (row) store.put({ ...row, attempts: (row.attempts ?? 0) + 1, lastError })
    }
    tx.oncomplete = () => { db.close(); notifyOutboxChanged(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function patchResponseEntry(id: number, patch: Partial<QueuedResponse>): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const req = store.get(id)
    req.onsuccess = () => {
      const row = req.result as QueuedResponse | undefined
      if (row) store.put({ ...row, ...patch, id })
    }
    tx.oncomplete = () => { db.close(); notifyOutboxChanged(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function removeFromQueue(id: number): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => { db.close(); notifyOutboxChanged(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

// ── ITR Snapshots ───────────────────────────────────────────────────
// S18 (C-38): ya no se escriben (nunca se leían); sin red la página sale de la caché del SW. El store queda para no
// cambiar la versión de la base y clearOfflineData lo vacía al cerrar sesión.

// ── Outbox — fotos y punches capturados sin red (Sprint O) ───────────

export function notifyOutboxChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OUTBOX_CHANGED_EVENT))
}

/** Encola una entrada y devuelve su id numérico (para referenciarla desde la UI). */
export async function enqueueOutbox(entry: OutboxInput, capturedBy: string | null): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite')
    const req = tx.objectStore(OUTBOX_STORE).add({ ...entry, capturedBy, queuedAt: new Date().toISOString(), attempts: 0 })
    let key = 0
    req.onsuccess = () => { key = Number(req.result) }
    tx.oncomplete = () => { db.close(); notifyOutboxChanged(); resolve(key) }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function getOutbox(): Promise<OutboxEntry[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readonly')
    const req = tx.objectStore(OUTBOX_STORE).getAll()
    req.onsuccess = () => { db.close(); resolve(req.result as OutboxEntry[]) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

export async function removeFromOutbox(id: number): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite')
    tx.objectStore(OUTBOX_STORE).delete(id)
    tx.oncomplete = () => { db.close(); notifyOutboxChanged(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

/** Anota un intento fallido (error lógico del servidor, no de red). */
/** A02: completa una entrada de la bandeja (p. ej. el `captureId` de una foto vieja) antes de reenviarla. */
export async function patchOutboxEntry(id: number, patch: Partial<OutboxPhoto>): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite')
    const store = tx.objectStore(OUTBOX_STORE)
    const req = store.get(id)
    req.onsuccess = () => {
      const row = req.result as OutboxEntry | undefined
      if (row) store.put({ ...row, ...patch, id })
    }
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function markOutboxAttempt(id: number, lastError: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite')
    const store = tx.objectStore(OUTBOX_STORE)
    const req = store.get(id)
    req.onsuccess = () => {
      const row = req.result as OutboxEntry | undefined
      if (row) store.put({ ...row, attempts: (row.attempts ?? 0) + 1, lastError })
    }
    // S06: la bandeja «No sincronizado» del ITR se repinta con el error.
    tx.oncomplete = () => { db.close(); notifyOutboxChanged(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

/**
 * Total de pendientes (respuestas + bandeja de salida; sin filtro, también arranque), opcionalmente de un solo ITR.
 * S18: con `userId` (aunque sea null) cuenta solo lo de ese usuario; sin él, todo lo del dispositivo.
 */
export async function countPending(itrId?: string, userId?: string | null): Promise<number> {
  const [responses, outbox, startup] = await Promise.all([getAllQueued(), getOutbox(), itrId ? Promise.resolve([]) : getStartupOutbox()])
  const match = (r: { itrId?: string; capturedBy?: string | null }) =>
    (!itrId || r.itrId === itrId) && (userId === undefined || (userId !== null && r.capturedBy === userId))
  return responses.filter(match).length + outbox.filter(match).length + startup.filter(match).length
}

// ── Bandeja de arranque — ejecuciones y line-ups (fase 6) ─────────────

/** Encola una captura (o reemplaza `replaceId`, para re-fijar una fila) y devuelve su id. */
export async function enqueueStartup(op: StartupOp, replaceId: number | null, capturedBy: string | null): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STARTUP_STORE, 'readwrite')
    const store = tx.objectStore(STARTUP_STORE)
    if (replaceId !== null) store.delete(replaceId)
    const entry: StartupEntry = { ...op, capturedBy, capturedAt: new Date().toISOString(), state: 'pending', error: null, remote: null }
    const req = store.add(entry)
    let key = 0
    req.onsuccess = () => { key = Number(req.result) }
    tx.oncomplete = () => { db.close(); notifyOutboxChanged(); resolve(key) }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function getStartupOutbox(): Promise<StartupEntry[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STARTUP_STORE, 'readonly')
    const req = tx.objectStore(STARTUP_STORE).getAll()
    req.onsuccess = () => { db.close(); resolve(req.result as StartupEntry[]) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

export async function patchStartupEntry(id: number, patch: Partial<StartupEntry>): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STARTUP_STORE, 'readwrite')
    const store = tx.objectStore(STARTUP_STORE)
    const req = store.get(id)
    req.onsuccess = () => {
      const row = req.result as StartupEntry | undefined
      if (row) store.put({ ...row, ...patch, id })
    }
    tx.oncomplete = () => { db.close(); notifyOutboxChanged(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function removeStartupEntry(id: number): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STARTUP_STORE, 'readwrite')
    tx.objectStore(STARTUP_STORE).delete(id)
    tx.oncomplete = () => { db.close(); notifyOutboxChanged(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

// ── S18: dueño de las capturas y limpieza al cerrar sesión ────────────

const OWNED_STORES = [STORE, OUTBOX_STORE, STARTUP_STORE] as const

/** Pendientes de todas las bandejas por dueño (propias, sin autor de antes de S18, de otra persona). */
export async function pendingByOwner(userId: string | null): Promise<OwnerCounts> {
  const [responses, outbox, startup] = await Promise.all([getAllQueued(), getOutbox(), getStartupOutbox()])
  return countByOwner([...responses, ...outbox, ...startup], userId)
}

/** «Son mías»: asigna a `userId` todas las entradas sin autor (capturadas antes de S18). */
export async function claimLegacyEntries(userId: string): Promise<number> {
  const db = await openDB()
  let claimed = 0
  return new Promise((resolve, reject) => {
    const tx = db.transaction([...OWNED_STORES], 'readwrite')
    for (const name of OWNED_STORES) {
      const store = tx.objectStore(name)
      const req = store.getAll()
      req.onsuccess = () => {
        for (const row of req.result as Array<{ capturedBy?: string | null }>) {
          if (!row.capturedBy) { store.put({ ...row, capturedBy: userId }); claimed++ }
        }
      }
    }
    tx.oncomplete = () => { db.close(); notifyOutboxChanged(); resolve(claimed) }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

/** Entradas de un dueño dado (para descartarlas con rastro): 'legacy' = sin autor, o un userId distinto al de la sesión. */
export async function entriesNotOwnedBy(userId: string | null): Promise<{
  responses: QueuedResponse[]; outbox: OutboxEntry[]; startup: StartupEntry[]
}> {
  const notMine = (r: { capturedBy?: string | null }) => !r.capturedBy || r.capturedBy !== userId
  const [responses, outbox, startup] = await Promise.all([getAllQueued(), getOutbox(), getStartupOutbox()])
  return { responses: responses.filter(notMine), outbox: outbox.filter(notMine), startup: startup.filter(notMine) }
}

/** Cierre de sesión: vacía todas las bandejas y las copias de ITR del dispositivo. */
export async function clearOfflineData(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const names = [STORE, SNAPSHOTS_STORE, OUTBOX_STORE, STARTUP_STORE]
    const tx = db.transaction(names, 'readwrite')
    for (const name of names) tx.objectStore(name).clear()
    tx.oncomplete = () => { db.close(); notifyOutboxChanged(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}
