// CommUp offline queue — IndexedDB-backed storage for ITR work captured while
// there is no network. No external libraries.
//
// Stores:
//   itr_responses  — respuestas de ítems (Stage 14.5), replay con LWW.
//   itr_snapshots  — copia completa del ITR para verlo sin red.
//   outbox         — Sprint O (2026-09-07): fotos (blob) y punches creados sin
//                    red, en orden de captura. Se drenan en src/lib/sync/replay.ts.

const DB_NAME = 'commup-offline'
const DB_VERSION = 3
const STORE = 'itr_responses'
const SNAPSHOTS_STORE = 'itr_snapshots'
const OUTBOX_STORE = 'outbox'

/** Evento de ventana que se dispara cuando cambia la bandeja de salida (para refrescar contadores y miniaturas). */
export const OUTBOX_CHANGED_EVENT = 'commup:outbox-changed'
/** Evento de ventana tras un replay que subió algo al servidor (para router.refresh()). */
export const SYNC_DONE_EVENT = 'commup:sync-done'

export type OutboxPhoto = {
  kind: 'photo'
  itrId: string
  itemId: string | null
  projectId: string
  tagId: string
  fileName: string
  fileType: string
  blob: Blob
}

export type OutboxPunch = {
  kind: 'punch'
  itrId: string
  projectId: string
  tagId: string
  category: 'A' | 'B' | 'C'
  description: string
  targetDate: string | null
}

export type OutboxEntry = (OutboxPhoto | OutboxPunch) & {
  id?: number
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
    }
    req.onsuccess = e => resolve((e.target as IDBOpenDBRequest).result)
    req.onerror = () => reject(req.error)
  })
}

export async function enqueueResponse(item: Omit<QueuedResponse, 'id'>): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).add(item)
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

export async function removeFromQueue(id: number): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

// ── ITR Snapshots — full ITR data for offline viewing ────────────────

export async function saveItrSnapshot(itrId: string, data: unknown): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SNAPSHOTS_STORE, 'readwrite')
    tx.objectStore(SNAPSHOTS_STORE).put({ itrId, data, savedAt: new Date().toISOString() })
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function getItrSnapshot(itrId: string): Promise<unknown | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SNAPSHOTS_STORE, 'readonly')
    const req = tx.objectStore(SNAPSHOTS_STORE).get(itrId)
    req.onsuccess = () => {
      db.close()
      resolve(req.result ? (req.result as { data: unknown }).data : null)
    }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

export async function removeItrSnapshot(itrId: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SNAPSHOTS_STORE, 'readwrite')
    tx.objectStore(SNAPSHOTS_STORE).delete(itrId)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

// ── Outbox — fotos y punches capturados sin red (Sprint O) ───────────

export function notifyOutboxChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OUTBOX_CHANGED_EVENT))
}

/** Encola una entrada y devuelve su id numérico (para referenciarla desde la UI). */
export async function enqueueOutbox(entry: OutboxPhoto | OutboxPunch): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite')
    const req = tx.objectStore(OUTBOX_STORE).add({ ...entry, queuedAt: new Date().toISOString(), attempts: 0 })
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
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

/** Total de pendientes (respuestas + bandeja de salida), opcionalmente de un solo ITR. */
export async function countPending(itrId?: string): Promise<number> {
  const [responses, outbox] = await Promise.all([getAllQueued(), getOutbox()])
  const match = (id: string) => !itrId || id === itrId
  return responses.filter(r => match(r.itrId)).length + outbox.filter(o => match(o.itrId)).length
}
