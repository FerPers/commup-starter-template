// CommUp Service Worker — v1
// Strategy:
//   /_next/static/*  → cache-first (immutable assets)
//   navigate (HTML)  → network-first, fallback to cache, fallback to /offline
//   everything else  → network-first, fallback to cache

const CACHE = 'commup-v1'
const OFFLINE_URL = '/offline'

// ── Install ───────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.add(OFFLINE_URL))
  )
  self.skipWaiting()
})

// ── Activate ──────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// ── Fetch ─────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET and cross-origin
  if (request.method !== 'GET') return
  if (url.origin !== self.location.origin) return

  // Skip Next.js server actions (_next/action, _rsc, etc.)
  if (url.pathname.startsWith('/_next/data/') || url.searchParams.has('_rsc')) return

  // ── Cache-first for immutable static chunks ────────────────────────
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached
        return fetch(request).then(resp => {
          if (resp.ok) {
            const clone = resp.clone()
            caches.open(CACHE).then(c => c.put(request, clone))
          }
          return resp
        })
      })
    )
    return
  }

  // ── Network-first for HTML navigation ─────────────────────────────
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(resp => {
          if (resp.ok) {
            const clone = resp.clone()
            caches.open(CACHE).then(c => c.put(request, clone))
          }
          return resp
        })
        .catch(() =>
          caches.match(request).then(cached =>
            cached ?? caches.match(OFFLINE_URL)
          )
        )
    )
    return
  }

  // ── Network-first for everything else (images, fonts, API) ────────
  event.respondWith(
    fetch(request)
      .then(resp => {
        if (resp.ok && url.pathname.startsWith('/icons/')) {
          const clone = resp.clone()
          caches.open(CACHE).then(c => c.put(request, clone))
        }
        return resp
      })
      .catch(() => caches.match(request))
  )
})