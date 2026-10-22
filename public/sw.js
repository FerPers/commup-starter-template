// CommUp Service Worker — v2.1 (S18; 2026-10-22: /api propio y fetch() de la app fuera de la caché)
// Strategy:
//   /_next/static/*  → cache-first (immutable assets)
//   navigate (HTML)  → network-first, fallback to cache (commup-pages, últimas 40; commup-pages-prep, ITR preparados), fallback to /offline.html
//   images           → cache-first (same-origin)
//   API/Supabase     → NO se intercepta ni se cachea (S18, G-03): lo offline va por IndexedDB; tampoco /api/* propio
//   scripts/estilos  → network-first (S18, G-20)
//   default          → stale-while-revalidate, solo recursos que pide el navegador (manifest…); un fetch() de la app
//                      (destination '') va directo a la red: antes /api/itrs-for-plan y /api/admin/export salían viejos
// Plus: Push notifications.
//
// S18 (C-08/G-03/A-09): las páginas van en su propia caché (`commup-pages-*`) para que el cierre de sesión
// (src/lib/sync/session.ts → purgeSessionCaches) las borre junto con las imágenes. Al activar esta versión se
// borran las cachés viejas, incluida `commup-api-*` (respuestas REST/Auth de Supabase de versiones anteriores).

const SW_VERSION = '2.2.1'
const CACHE_STATIC = `commup-static-v${SW_VERSION}`
const CACHE_PAGES  = `commup-pages-v${SW_VERSION}`
// S18 sesión 2 (C-09): ITR descargados con «Preparar para trabajar sin red» (no se recortan; se reemplazan al preparar).
const CACHE_PREP   = `commup-pages-prep-v${SW_VERSION}`
const MAX_PREP     = 30
const CACHE_IMAGES = `commup-images-v${SW_VERSION}`
const KEEP_CACHES  = [CACHE_STATIC, CACHE_PAGES, CACHE_PREP, CACHE_IMAGES]
const OFFLINE_URL  = '/offline.html'
const MAX_PAGES    = 40

const PRECACHE = [
  OFFLINE_URL,
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
]

const API_PATTERNS = [
  /\/rest\/v1\//,
  /\/auth\/v1\//,
  /supabase\.co/,
]

// ── Install ───────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(PRECACHE).catch(err => console.warn('[SW] Precache failed:', err)))
      .then(() => self.skipWaiting())
  )
})

// ── Activate ──────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !KEEP_CACHES.includes(k)).map(k => caches.delete(k))
      ))
      .then(() => purgeAppDataFromStatic())
      .then(() => self.clients.claim())
  )
})

// ── Fetch ─────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Skip Next.js internals that must always hit network
  if (url.pathname.startsWith('/_next/data/') || url.searchParams.has('_rsc')) return

  // Cache-first for immutable Next.js static chunks
  if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, CACHE_STATIC))
    return
  }

  // /api/* propio: datos y exportaciones (respaldo de la org); nunca se cachea
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return

  // Network-first for navigation (HTML)
  if (request.mode === 'navigate') {
    event.respondWith(navigateFirst(request))
    return
  }

  // Supabase / API: nunca se cachea (datos y tokens de la sesión).
  if (API_PATTERNS.some(p => p.test(request.url))) return

  // Images (solo del propio origen: las URLs firmadas de evidencias no se guardan)
  if (url.origin === self.location.origin && request.destination === 'image') {
    event.respondWith(cacheFirst(request, CACHE_IMAGES))
    return
  }

  // Same-origin scripts/styles/fonts
  if (
    url.origin === self.location.origin &&
    (request.destination === 'script' || request.destination === 'style' || request.destination === 'font')
  ) {
    event.respondWith(networkFirst(request, CACHE_STATIC))
    return
  }

  // Default: stale-while-revalidate for same-origin assets que pide el navegador (no los fetch() de la app)
  if (url.origin === self.location.origin && request.destination !== '') {
    event.respondWith(staleWhileRevalidate(request, CACHE_STATIC))
  }
})

// ── Strategies ────────────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const resp = await fetch(request)
    if (resp.ok) {
      const clone = resp.clone()
      caches.open(cacheName).then(c => c.put(request, clone))
    }
    return resp
  } catch {
    return new Response('Asset offline', { status: 503 })
  }
}

async function networkFirst(request, cacheName) {
  try {
    const resp = await fetch(request)
    if (resp.ok) {
      const clone = resp.clone()
      caches.open(cacheName).then(c => c.put(request, clone))
    }
    return resp
  } catch {
    const cached = await caches.match(request)
    return cached ?? new Response('Asset offline', { status: 503 })
  }
}

// Borra las respuestas de /api/* que versiones anteriores guardaron por error en la caché estática.
async function purgeAppDataFromStatic() {
  const cache = await caches.open(CACHE_STATIC)
  for (const req of await cache.keys()) {
    const url = new URL(req.url)
    if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) await cache.delete(req)
  }
}

async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i])
}

async function navigateFirst(request) {
  try {
    const resp = await fetch(request)
    // Solo HTML: una descarga (Excel, PDF, ZIP del handover) también llega como navegación
    if (resp.ok && (resp.headers.get('content-type') || '').includes('text/html')) {
      const clone = resp.clone()
      caches.open(CACHE_PAGES).then(c => c.put(request, clone)).then(() => trimCache(CACHE_PAGES, MAX_PAGES))
    }
    return resp
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    // S18 (G-23): página estática bilingüe (no depende de JS ni de chunks que quizá no estén en caché).
    const offline = await caches.match(OFFLINE_URL)
    return offline ?? new Response('Offline', { status: 503 })
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const fetchPromise = fetch(request).then(resp => {
    if (resp.ok) cache.put(request, resp.clone())
    return resp
  }).catch(() => cached || new Response('Offline', { status: 503 }))
  return cached || fetchPromise
}

// ── Preparar para trabajar sin red (S18 sesión 2, C-09) ─────────────
// La página manda { type: 'PRECACHE_PAGES', urls } por un MessageChannel; el SW descarga cada página (con las
// cookies de la sesión), guarda el HTML en CACHE_PREP y los chunks /_next/static/ que referencia, y responde
// { ok, failed }. Una redirección (p. ej. a /login) cuenta como fallo.
self.addEventListener('message', event => {
  const data = event.data || {}
  if (data.type !== 'PRECACHE_PAGES' || !Array.isArray(data.urls)) return
  const port = event.ports && event.ports[0]
  event.waitUntil(precachePages(data.urls).then(result => { if (port) port.postMessage(result) }))
})

async function precachePages(urls) {
  await caches.delete(CACHE_PREP)
  const pages = await caches.open(CACHE_PREP)
  const statics = await caches.open(CACHE_STATIC)
  let ok = 0
  let failed = 0
  for (const raw of urls.slice(0, MAX_PREP)) {
    try {
      const url = new URL(raw, self.location.origin)
      if (url.origin !== self.location.origin) { failed++; continue }
      const resp = await fetch(url.href, { credentials: 'same-origin' })
      if (!resp.ok || resp.redirected) { failed++; continue }
      const html = await resp.clone().text()
      await pages.put(url.href, resp)
      const assets = new Set([...html.matchAll(/\/_next\/static\/[^"'\s)\\]+/g)].map(m => m[0]))
      for (const a of assets) {
        if (await statics.match(a)) continue
        try { const r = await fetch(a); if (r.ok) await statics.put(a, r) } catch { /* sigue con las demás */ }
      }
      ok++
    } catch {
      failed++
    }
  }
  return { ok, failed }
}

// ── Push Notifications ────────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return

  let payload = {}
  try { payload = event.data.json() } catch { payload = { title: 'CommUp', body: event.data.text() } }

  const title = payload.title || 'CommUp'
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: payload.tag || 'commup-notification',
    renotify: true,
    requireInteraction: payload.priority === 'high',
    silent: payload.priority === 'low',
    data: {
      url: payload.action_url || '/',
      type: payload.type || 'SYSTEM',
      entity_id: payload.entity_id || null,
    },
    actions: buildActions(payload),
    vibrate: payload.priority === 'high' ? [200, 100, 200] : [100],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const data = event.notification.data || {}
  const target = data.url || '/'

  if (event.action === 'dismiss') return

  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of all) {
      if (client.url.includes(self.location.origin) && 'focus' in client) {
        client.focus()
        client.postMessage({ type: 'NAVIGATE', url: target })
        return
      }
    }
    return self.clients.openWindow(target)
  })())
})

// S22 (G-22): solo «Abrir» y «Cerrar», con los textos que manda el servidor (antes había un «Completar» que solo
// abría la URL y una rama a /itrs/<id>/capture, que no existe).
function buildActions(payload) {
  const labels = payload.labels || {}
  return [
    { action: 'view', title: labels.open || 'Abrir' },
    { action: 'dismiss', title: labels.dismiss || 'Cerrar' },
  ]
}
