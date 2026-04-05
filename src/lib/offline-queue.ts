// CommUp offline queue — IndexedDB-backed storage for ITR responses
// captured while there is no network. No external libraries.

const DB_NAME = 'commup-offline'
const DB_VERSION = 1
const STORE = 'itr_responses'

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
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
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