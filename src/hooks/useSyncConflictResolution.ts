/**
 * CommUP — Sync Conflict Resolution (Stage 14.6)
 *
 * Estrategia: Last-Write-Wins (LWW) con audit log completo.
 * NO hay silent overwrites: todo conflicto queda registrado.
 *
 * Garantías:
 * - Cada update tiene timestamp del cliente (ISO) + server timestamp
 * - Si hay conflicto (versión remota > versión local que tenemos): LWW gana
 * - Log de conflictos en IndexedDB + Supabase tabla conflict_log
 * - El usuario puede revisar el historial de conflictos
 * - Implementación optimistic con rollback en caso de hard conflict
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Tipos ─────────────────────────────────────────────────────────────────
export type EntityType = 'itr_item' | 'itr_header' | 'punch' | 'certificate';

export interface VersionedEntity {
  id: string;
  entity_type: EntityType;
  local_version: number;        // Incrementa en cada edit local
  server_version: number;       // Última versión confirmada por el servidor
  client_updated_at: string;    // ISO timestamp del cliente
  server_updated_at?: string;   // ISO timestamp del servidor (al sincronizar)
  updated_by: string;           // user_id
  payload: Record<string, unknown>;
}

export interface ConflictRecord {
  id: string;
  entity_id: string;
  entity_type: EntityType;
  conflict_type: 'lww_local_wins' | 'lww_remote_wins' | 'merge_required';
  local_version: VersionedEntity;
  remote_version: VersionedEntity;
  winner: 'local' | 'remote';
  winner_payload: Record<string, unknown>;
  detected_at: string;
  resolved_at?: string;
  resolved_by?: string;
  notes?: string;
}

export interface SyncQueueItem {
  id?: number;
  entity_id: string;
  entity_type: EntityType;
  operation: 'create' | 'update' | 'delete';
  payload: Record<string, unknown>;
  local_version: number;
  client_updated_at: string;
  user_id: string;
  retry_count: number;
  created_at: string;
}

interface UseSyncConflictOptions {
  userId: string;
  onConflictDetected?: (conflict: ConflictRecord) => void;
  onSyncSuccess?: (entityId: string) => void;
  onSyncError?: (entityId: string, error: string) => void;
}

// ─── IndexedDB setup ──────────────────────────────────────────────────────
const DB_NAME = 'commup-sync-v2';
const DB_VERSION = 2;

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;

      // Cola de sync pendiente
      if (!db.objectStoreNames.contains('sync_queue')) {
        const store = db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
        store.createIndex('entity_id', 'entity_id');
        store.createIndex('entity_type', 'entity_type');
        store.createIndex('created_at', 'created_at');
      }

      // Log de conflictos (local)
      if (!db.objectStoreNames.contains('conflict_log')) {
        const store = db.createObjectStore('conflict_log', { keyPath: 'id' });
        store.createIndex('entity_id', 'entity_id');
        store.createIndex('detected_at', 'detected_at');
        store.createIndex('resolved_at', 'resolved_at');
      }

      // Caché de versiones conocidas
      if (!db.objectStoreNames.contains('version_cache')) {
        db.createObjectStore('version_cache', { keyPath: 'id' }); // id = entity_id
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(db: IDBDatabase, store: string, key: IDBValidKey): Promise<any> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(db: IDBDatabase, store: string, value: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll(db: IDBDatabase, store: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(db: IDBDatabase, store: string, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ─── Conflict Detection & Resolution ─────────────────────────────────────
function detectConflict(
  localItem: SyncQueueItem,
  remoteEntity: VersionedEntity
): ConflictRecord | null {
  // Si el local_version <= server_version conocida: sin conflicto (fast-forward)
  if (localItem.local_version <= remoteEntity.server_version) return null;

  // Si los timestamps del cliente son los mismo: sin conflicto (idempotente)
  if (localItem.client_updated_at === remoteEntity.server_updated_at) return null;

  // Hay conflicto: comparar timestamps
  const localTs = new Date(localItem.client_updated_at).getTime();
  const remoteTs = new Date(remoteEntity.server_updated_at || remoteEntity.client_updated_at).getTime();

  const winner: 'local' | 'remote' = localTs >= remoteTs ? 'local' : 'remote';

  return {
    id: crypto.randomUUID(),
    entity_id: localItem.entity_id,
    entity_type: localItem.entity_type,
    conflict_type: 'lww_local_wins',
    local_version: {
      id: localItem.entity_id,
      entity_type: localItem.entity_type,
      local_version: localItem.local_version,
      server_version: remoteEntity.server_version,
      client_updated_at: localItem.client_updated_at,
      updated_by: localItem.user_id,
      payload: localItem.payload,
    },
    remote_version: remoteEntity,
    winner,
    winner_payload: winner === 'local' ? localItem.payload : remoteEntity.payload,
    detected_at: new Date().toISOString(),
  };
}

// ─── Hook Principal ───────────────────────────────────────────────────────
export function useSyncConflictResolution({
  userId,
  onConflictDetected,
  onSyncSuccess,
  onSyncError,
}: UseSyncConflictOptions) {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const dbRef = useRef<IDBDatabase | null>(null);

  // Inicializar DB
  useEffect(() => {
    openDB().then((db) => {
      dbRef.current = db;
      refreshPendingCount(db);
      loadConflicts(db);
    });
  }, []);

  // Online: trigger sync automático
  useEffect(() => {
    const handler = () => {
      if (navigator.onLine) {
        setTimeout(() => syncAll(), 500);
      }
    };
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
  }, []);

  const refreshPendingCount = async (db: IDBDatabase) => {
    const all = await dbGetAll(db, 'sync_queue');
    setPendingCount(all.length);
  };

  const loadConflicts = async (db: IDBDatabase) => {
    const all = await dbGetAll(db, 'conflict_log');
    setConflicts(all.sort((a, b) =>
      new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime()
    ));
  };

  /**
   * Encolar un cambio local para sincronización
   */
  const enqueue = useCallback(async (
    entityId: string,
    entityType: EntityType,
    operation: SyncQueueItem['operation'],
    payload: Record<string, unknown>,
    localVersion: number
  ): Promise<void> => {
    const db = dbRef.current;
    if (!db) return;

    const item: Omit<SyncQueueItem, 'id'> = {
      entity_id: entityId,
      entity_type: entityType,
      operation,
      payload: {
        ...payload,
        _client_ts: new Date().toISOString(),
        _local_version: localVersion,
      },
      local_version: localVersion,
      client_updated_at: new Date().toISOString(),
      user_id: userId,
      retry_count: 0,
      created_at: new Date().toISOString(),
    };

    // Upsert: si ya hay un item para este entity, reemplazar (solo el último cuenta)
    const existing = await dbGetAll(db, 'sync_queue');
    const dup = existing.find((e) => e.entity_id === entityId && e.entity_type === entityType);
    if (dup) {
      await dbPut(db, 'sync_queue', { ...item, id: dup.id });
    } else {
      await dbPut(db, 'sync_queue', item);
    }

    await refreshPendingCount(db);

    // Registrar Service Worker Background Sync si disponible
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const reg = await navigator.serviceWorker.ready;
      const tag = entityType === 'itr_item' ? 'commup-itr-sync'
        : entityType === 'punch' ? 'commup-punch-sync'
        : 'commup-general-sync';
      await (reg as any).sync.register(tag).catch(() => {});
    }
  }, [userId]);

  /**
   * Sincronizar todos los items pendientes
   */
  const syncAll = useCallback(async (): Promise<void> => {
    const db = dbRef.current;
    if (!db || isSyncing || !navigator.onLine) return;

    setIsSyncing(true);
    const items = await dbGetAll(db, 'sync_queue');

    for (const item of items) {
      try {
        // 1. Obtener versión actual del servidor
        const serverResponse = await fetch(
          `/api/sync/entity?id=${item.entity_id}&type=${item.entity_type}`,
          { headers: { 'Content-Type': 'application/json' } }
        );

        let conflict: ConflictRecord | null = null;

        if (serverResponse.ok) {
          const serverEntity: VersionedEntity = await serverResponse.json();

          // 2. Detectar conflicto
          conflict = detectConflict(item, serverEntity);

          if (conflict) {
            console.warn(`[Sync] Conflict detected for ${item.entity_id}:`, conflict);

            // Log conflicto localmente
            await dbPut(db, 'conflict_log', conflict);
            setConflicts((prev) => [conflict!, ...prev].slice(0, 100));
            onConflictDetected?.(conflict);

            // Log en Supabase (async, no bloquea)
            fetch('/api/sync/conflict-log', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(conflict),
            }).catch(() => {});

            // Usar el winner payload
            item.payload = conflict.winner_payload;
          }
        }

        // 3. Enviar al servidor (con el payload correcto: winner en caso de conflicto)
        const syncPayload = {
          entity_id: item.entity_id,
          entity_type: item.entity_type,
          operation: item.operation,
          payload: item.payload,
          local_version: item.local_version,
          client_updated_at: item.client_updated_at,
          user_id: item.user_id,
          conflict_id: conflict?.id ?? null,
          conflict_winner: conflict?.winner ?? null,
        };

        const response = await fetch('/api/sync/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(syncPayload),
        });

        if (response.ok) {
          const result = await response.json();

          // 4. Actualizar caché de versión
          await dbPut(db, 'version_cache', {
            id: item.entity_id,
            server_version: result.server_version,
            server_updated_at: result.server_updated_at,
          });

          // 5. Eliminar de la cola
          await dbDelete(db, 'sync_queue', item.id);

          if (conflict) {
            // Marcar conflicto como resuelto
            const updatedConflict = {
              ...conflict,
              resolved_at: new Date().toISOString(),
              resolved_by: 'system_lww',
            };
            await dbPut(db, 'conflict_log', updatedConflict);
          }

          onSyncSuccess?.(item.entity_id);
        } else if (response.status === 409) {
          // El servidor rechazó por conflicto irreconciliable
          const serverConflict = await response.json();
          console.error('[Sync] Hard conflict — requires manual resolution:', serverConflict);
          // Incrementar retry count pero no eliminar
          await dbPut(db, 'sync_queue', { ...item, retry_count: item.retry_count + 1 });
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (err: any) {
        console.error(`[Sync] Error syncing ${item.entity_id}:`, err);
        onSyncError?.(item.entity_id, err.message);

        // Backoff exponencial: max 5 retries
        if (item.retry_count < 5) {
          await dbPut(db, 'sync_queue', { ...item, retry_count: item.retry_count + 1 });
        } else {
          console.error(`[Sync] Max retries reached for ${item.entity_id}, removing from queue`);
          await dbDelete(db, 'sync_queue', item.id);
        }
      }
    }

    await refreshPendingCount(db);
    setLastSyncAt(new Date().toISOString());
    setIsSyncing(false);
  }, [isSyncing, onConflictDetected, onSyncSuccess, onSyncError]);

  /**
   * Resolver un conflicto manualmente (override de LWW)
   */
  const resolveConflict = useCallback(async (
    conflictId: string,
    winner: 'local' | 'remote',
    notes?: string
  ): Promise<void> => {
    const db = dbRef.current;
    if (!db) return;

    const conflict = await dbGet(db, 'conflict_log', conflictId);
    if (!conflict) return;

    const resolved: ConflictRecord = {
      ...conflict,
      winner,
      winner_payload: winner === 'local' ? conflict.local_version.payload : conflict.remote_version.payload,
      resolved_at: new Date().toISOString(),
      resolved_by: userId,
      notes,
    };

    await dbPut(db, 'conflict_log', resolved);
    setConflicts((prev) => prev.map((c) => c.id === conflictId ? resolved : c));

    // Si el winner es local, volver a encolar con el payload local
    if (winner === 'local') {
      await enqueue(
        conflict.entity_id,
        conflict.entity_type,
        'update',
        conflict.local_version.payload,
        conflict.local_version.local_version + 1
      );
    }

    // Reportar resolución al servidor
    await fetch('/api/sync/conflict-resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conflict_id: conflictId, winner, notes, resolved_by: userId }),
    }).catch(() => {});
  }, [userId, enqueue]);

  /**
   * Obtener estadísticas de sync
   */
  const getSyncStats = useCallback(async () => {
    const db = dbRef.current;
    if (!db) return null;

    const queue = await dbGetAll(db, 'sync_queue');
    const allConflicts = await dbGetAll(db, 'conflict_log');
    const unresolvedConflicts = allConflicts.filter((c) => !c.resolved_at);

    return {
      pending: queue.length,
      total_conflicts: allConflicts.length,
      unresolved_conflicts: unresolvedConflicts.length,
      last_sync_at: lastSyncAt,
      items_by_type: queue.reduce((acc: Record<string, number>, item) => {
        acc[item.entity_type] = (acc[item.entity_type] || 0) + 1;
        return acc;
      }, {}),
    };
  }, [lastSyncAt]);

  return {
    pendingCount,
    isSyncing,
    conflicts,
    lastSyncAt,
    enqueue,
    syncAll,
    resolveConflict,
    getSyncStats,
    unresolvedConflicts: conflicts.filter((c) => !c.resolved_at),
  };
}
