/**
 * CommUP Service Worker v2 — Stage 14
 * Strategy: offline-first para assets + network-first para API
 * + Background Sync para operaciones offline
 * + Push Notifications handler
 */

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

const SW_VERSION = '2.0.0';
const CACHE_STATIC = `commup-static-v${SW_VERSION}`;
const CACHE_API    = `commup-api-v${SW_VERSION}`;
const CACHE_IMAGES = `commup-images-v${SW_VERSION}`;

// Sync tags
const SYNC_ITR_QUEUE   = 'commup-itr-sync';
const SYNC_PUNCH_QUEUE = 'commup-punch-sync';
const SYNC_PHOTO_QUEUE = 'commup-photo-sync';

// ─── Assets críticos para offline-first ───────────────────────────────────
const PRECACHE_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  // Rutas clave de la app shell
  '/itrs/assigned',
  '/punches',
  '/scan',
  '/tag_360',
];

// ─── Patrones de API que van a la red primero ─────────────────────────────
const API_PATTERNS = [
  /\/rest\/v1\//,
  /\/auth\/v1\//,
  /supabase\.co/,
];

// ─── INSTALL: pre-cache shell + assets críticos ───────────────────────────
self.addEventListener('install', (event: ExtendableEvent) => {
  console.log(`[SW ${SW_VERSION}] Installing...`);
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Pre-cache partial fail (normal en dev):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE: limpiar caches viejos ─────────────────────────────────────
self.addEventListener('activate', (event: ExtendableEvent) => {
  console.log(`[SW ${SW_VERSION}] Activating...`);
  const keepCaches = [CACHE_STATIC, CACHE_API, CACHE_IMAGES];

  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => !keepCaches.includes(name))
          .map((name) => {
            console.log(`[SW] Deleting old cache: ${name}`);
            return caches.delete(name);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ─── FETCH: estrategia por tipo de recurso ───────────────────────────────
self.addEventListener('fetch', (event: FetchEvent) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1) Navegación → network-first con fallback a offline.html
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // 2) API Supabase → network-first sin cache (datos dinámicos)
  if (API_PATTERNS.some((p) => p.test(request.url))) {
    event.respondWith(networkFirstNoCache(request));
    return;
  }

  // 3) Imágenes → cache-first con revalidación background
  if (request.destination === 'image') {
    event.respondWith(cacheFirstWithNetworkFallback(request, CACHE_IMAGES));
    return;
  }

  // 4) Static assets (JS/CSS/fonts) → cache-first agresivo
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font'
  ) {
    event.respondWith(cacheFirstWithNetworkFallback(request, CACHE_STATIC));
    return;
  }

  // 5) Default → stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// ─── Estrategias de caching ──────────────────────────────────────────────

async function networkFirstWithOfflineFallback(request: Request): Promise<Response> {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE_STATIC);
    cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offlinePage = await caches.match('/offline.html');
    return offlinePage || new Response('Offline', { status: 503 });
  }
}

async function networkFirstNoCache(request: Request): Promise<Response> {
  try {
    return await fetch(request);
  } catch {
    // Si hay cache de API reciente (max 5 min), servirla stale
    const cached = await caches.match(request);
    if (cached) {
      const dateHeader = cached.headers.get('sw-cached-at');
      if (dateHeader) {
        const age = Date.now() - parseInt(dateHeader);
        if (age < 5 * 60 * 1000) return cached;
      }
    }
    return new Response(
      JSON.stringify({ error: 'offline', cached: false }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

async function cacheFirstWithNetworkFallback(
  request: Request,
  cacheName: string
): Promise<Response> {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('Asset offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE_STATIC);
  const cached = await cache.match(request);

  const networkPromise = fetch(request).then((response) => {
    cache.put(request, response.clone());
    return response;
  });

  return cached || networkPromise;
}

// ─── BACKGROUND SYNC ─────────────────────────────────────────────────────
self.addEventListener('sync', (event: SyncEvent) => {
  console.log(`[SW] Background sync: ${event.tag}`);

  if (event.tag === SYNC_ITR_QUEUE) {
    event.waitUntil(processITRQueue());
  }
  if (event.tag === SYNC_PUNCH_QUEUE) {
    event.waitUntil(processPunchQueue());
  }
  if (event.tag === SYNC_PHOTO_QUEUE) {
    event.waitUntil(processPhotoQueue());
  }
});

async function processITRQueue(): Promise<void> {
  const db = await openSyncDB();
  const items = await getAllFromStore(db, 'itr_queue');

  for (const item of items) {
    try {
      const response = await fetch('/api/itrs/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload),
      });

      if (response.ok) {
        await deleteFromStore(db, 'itr_queue', item.id);
        console.log(`[SW] ITR synced: ${item.id}`);
        // Notificar a todos los clientes
        notifyClients({ type: 'SYNC_SUCCESS', entity: 'ITR', id: item.payload.id });
      } else {
        console.warn(`[SW] ITR sync failed (${response.status}):`, item.id);
      }
    } catch (err) {
      console.error('[SW] ITR sync error:', err);
      // Se reintentará en el próximo sync
      throw err;
    }
  }
}

async function processPunchQueue(): Promise<void> {
  const db = await openSyncDB();
  const items = await getAllFromStore(db, 'punch_queue');

  for (const item of items) {
    try {
      const response = await fetch('/api/punches/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload),
      });
      if (response.ok) {
        await deleteFromStore(db, 'punch_queue', item.id);
        notifyClients({ type: 'SYNC_SUCCESS', entity: 'PUNCH', id: item.payload.id });
      }
    } catch (err) {
      throw err;
    }
  }
}

async function processPhotoQueue(): Promise<void> {
  const db = await openSyncDB();
  const items = await getAllFromStore(db, 'photo_queue');

  for (const item of items) {
    try {
      const formData = new FormData();
      formData.append('file', item.payload.blob, item.payload.filename);
      formData.append('metadata', JSON.stringify(item.payload.metadata));

      const response = await fetch('/api/photos/upload', {
        method: 'POST',
        body: formData,
      });
      if (response.ok) {
        await deleteFromStore(db, 'photo_queue', item.id);
        notifyClients({ type: 'SYNC_SUCCESS', entity: 'PHOTO', id: item.payload.metadata.itr_id });
      }
    } catch (err) {
      throw err;
    }
  }
}

// ─── PUSH NOTIFICATIONS ───────────────────────────────────────────────────
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;

  const data = event.data.json() as CommUPPushPayload;
  console.log('[SW] Push received:', data);

  const options: NotificationOptions = {
    body: data.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    tag: data.tag || 'commup-notification',
    renotify: true,
    requireInteraction: data.priority === 'high',
    silent: data.priority === 'low',
    data: {
      url: data.action_url,
      type: data.type,
      entity_id: data.entity_id,
    },
    actions: buildNotificationActions(data),
    vibrate: data.priority === 'high' ? [200, 100, 200] : [100],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const { url, type, entity_id } = event.notification.data;
  let targetUrl = url || '/';

  // Handle action buttons
  if (event.action === 'view') targetUrl = url;
  if (event.action === 'dismiss') return;
  if (event.action === 'complete' && type === 'ITR') {
    targetUrl = `/itrs/${entity_id}/capture`;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window si está abierto
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'NAVIGATE', url: targetUrl });
          return;
        }
      }
      // Abrir nueva ventana
      return self.clients.openWindow(targetUrl);
    })
  );
});

function buildNotificationActions(data: CommUPPushPayload): NotificationAction[] {
  switch (data.type) {
    case 'ITR_RETURNED':
      return [
        { action: 'view', title: '👁 Ver ITR' },
        { action: 'dismiss', title: '✕ Cerrar' },
      ];
    case 'PUNCH_ASSIGNED':
      return [
        { action: 'view', title: '🔧 Ver Punch' },
        { action: 'complete', title: '✓ Ir a completar' },
      ];
    case 'CERT_READY':
      return [
        { action: 'view', title: '📄 Ver Certificado' },
      ];
    default:
      return [{ action: 'view', title: '📋 Ver' }];
  }
}

// ─── IndexedDB helpers ────────────────────────────────────────────────────
function openSyncDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('commup-sync', 1);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      const stores = ['itr_queue', 'punch_queue', 'photo_queue', 'conflict_log'];
      stores.forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
        }
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllFromStore(db: IDBDatabase, storeName: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function deleteFromStore(db: IDBDatabase, storeName: string, id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function notifyClients(message: Record<string, unknown>): void {
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => client.postMessage(message));
  });
}

// ─── Types ────────────────────────────────────────────────────────────────
interface CommUPPushPayload {
  title: string;
  body: string;
  type: 'ITR_RETURNED' | 'PUNCH_ASSIGNED' | 'CERT_READY' | 'SYSTEM';
  entity_id: string;
  action_url: string;
  tag?: string;
  priority?: 'low' | 'normal' | 'high';
}

interface SyncEvent extends ExtendableEvent {
  tag: string;
}

interface NotificationEvent extends ExtendableEvent {
  notification: Notification & { data: any };
  action: string;
}
