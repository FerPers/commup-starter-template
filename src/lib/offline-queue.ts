// CommUp offline queue — IndexedDB-backed storage for ITR responses
// captured while there is no network. No external libraries.

const DB_NAME = 'commup-offline'
const DB_VERSION = 2
const STORE = 'itr_responses'
const SNAPSHOTS_STORE = 'itr_snapshots'

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