// @ts-nocheck — Deno runtime
// ══════════════════════════════════════════════════════════════════════════════
// Stage 13.3 — webhook-dispatcher (Supabase Edge Function, Deno)
//
// S21 (B-03/I-08): un solo modo. `outbox_dispatch()` (pg_cron, cada minuto) crea las entregas en la BD y llama
// aquí solo si hay entregas vencidas: POST { mode: "retry" }. La función las reserva con
// `claim_webhook_deliveries` (SKIP LOCKED + 5 min de reserva: dos invocaciones no repiten una entrega), las envía
// de a CONCURRENCY y guarda el resultado. Antes, dos triggers llamaban por cada evento (entregas duplicadas) y el
// reintento dependía de un pg_cron fuera del repo.
//
// Outbound request format (v1):
//   POST <endpoint_url>
//   X-CommUp-Event:     <event_type>          e.g. punch.closed (catálogo v1, src/lib/constants/domain-events.ts)
//   X-CommUp-Event-Id:  <domain_event_id>     idempotencia: el mismo evento siempre trae el mismo id
//   X-CommUp-Delivery:  <delivery_id>
//   X-CommUp-Timestamp: <unix seconds>
//   X-CommUp-Signature: t=<unix>,v1=<hex>     HMAC-SHA256(secret, "<unix>.<body>") — rechazar si |now − t| > 5 min
//   Content-Type:       application/json
//   Body: { id, event_id, event_type, schema_version, occurred_at, data }
//
// Retry schedule (exponential backoff):
//   Attempt 1 → al minuto siguiente del evento
//   Attempt 2 → 1 min
//   Attempt 3 → 5 min
//   Attempt 4 → 30 min
//   Attempt 5 → 2 h
//   > 5        → abandoned
//
// Deploy: supabase functions deploy webhook-dispatcher --no-verify-jwt
//   (verify_jwt off en gateway; la función exige Bearer service key — ver requireServiceCaller)
// ══════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ── Auth: solo llamadas con service key (Sprint S 2026-09-03) ───────────────
// verify_jwt=false en el gateway porque el trigger pg_net envía la service key
// guardada en Vault (puede estar rotada). Validamos aquí: igualdad con la key
// del runtime o, si difiere, prueba contra la Admin API (solo service_role).
async function requireServiceCaller(req: Request): Promise<Response | null> {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return new Response('Unauthorized', { status: 401 })
  if (token === SERVICE_ROLE_KEY) return null
  try {
    const probe = createClient(SUPABASE_URL, token, { auth: { persistSession: false } })
    const { error } = await probe.auth.admin.listUsers({ page: 1, perPage: 1 })
    if (!error) return null
  } catch { /* cae al 401 */ }
  return new Response('Unauthorized', { status: 401 })
}

// ── Anti-SSRF: endpoints solo https hacia hosts públicos ────────────────────
const BLOCKED_HOST_RE = /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.arpa|metadata\.google\.internal)$/i

function isPrivateIp(ip: string): boolean {
  const l = ip.toLowerCase()
  if (l.includes(':')) {
    return l === '::' || l === '::1' || l.startsWith('fc') || l.startsWith('fd') ||
      l.startsWith('fe80') || l.startsWith('::ffff:')
  }
  const p = l.split('.').map(Number)
  if (p.length !== 4 || p.some(n => Number.isNaN(n))) return true
  return p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224 ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127)
}

async function assertPublicHttpsUrl(raw: string): Promise<void> {
  let u: URL
  try { u = new URL(raw) } catch { throw new Error('URL inválida') }
  if (u.protocol !== 'https:') throw new Error('Solo se permiten URLs https')
  if (u.username || u.password) throw new Error('URL con credenciales no permitida')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (BLOCKED_HOST_RE.test(host)) throw new Error(`Host no permitido: ${host}`)
  if (/^[\d.]+$/.test(host) || host.includes(':')) {
    if (isPrivateIp(host)) throw new Error(`IP privada no permitida: ${host}`)
    return
  }
  const addrs: string[] = []
  try {
    const [a, aaaa] = await Promise.allSettled([
      Deno.resolveDns(host, 'A'),
      Deno.resolveDns(host, 'AAAA'),
    ])
    if (a.status === 'fulfilled') addrs.push(...a.value)
    if (aaaa.status === 'fulfilled') addrs.push(...aaaa.value)
  } catch { /* runtime sin resolveDns: quedan los filtros por nombre */ }
  if (addrs.some(isPrivateIp)) throw new Error(`Host resuelve a una IP privada: ${host}`)
}
const MAX_ATTEMPTS      = 5
const BATCH             = 100
const CONCURRENCY       = 10
const MAX_ROUNDS        = 5
const DISPATCH_TIMEOUT  = 10_000   // 10 s per outbound request

// Retry delays in seconds
const RETRY_DELAYS_SEC  = [0, 60, 300, 1800, 7200]

// ── HMAC-SHA256 ───────────────────────────────────────────────────────────────

async function hmacHex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

type Claimed = {
  delivery_id: string
  subscription_id: string
  attempts: number
  endpoint_url: string
  secret: string
  enabled: boolean
  event_id: string
  event_type: string
  payload: Record<string, unknown>
  occurred_at: string
  schema_version: number
}

// ── Dispatch a single delivery ────────────────────────────────────────────────

async function dispatchDelivery(d: Claimed): Promise<{ success: boolean; code?: number; body?: string }> {
  const bodyStr = JSON.stringify({
    id:             d.delivery_id,
    event_id:       d.event_id,
    event_type:     d.event_type,
    schema_version: d.schema_version,
    occurred_at:    d.occurred_at,
    data:           d.payload,
  })
  // I-08: la firma cubre el timestamp (anti-replay) y el cuerpo, que trae el event_id (idempotencia).
  const ts = Math.floor(Date.now() / 1000).toString()
  const signature = `t=${ts},v1=${await hmacHex(d.secret, `${ts}.${bodyStr}`)}`

  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT)

  try {
    await assertPublicHttpsUrl(d.endpoint_url)
    const res = await fetch(d.endpoint_url, {
      method:  'POST',
      redirect: 'manual',
      headers: {
        'Content-Type':       'application/json',
        'X-CommUp-Event':     d.event_type,
        'X-CommUp-Event-Id':  d.event_id,
        'X-CommUp-Delivery':  d.delivery_id,
        'X-CommUp-Timestamp': ts,
        'X-CommUp-Signature': signature,
        'User-Agent':         'CommUp-Webhooks/1.1',
      },
      body:    bodyStr,
      signal:  controller.signal,
    })
    clearTimeout(timeout)

    const resBody = await res.text().catch(() => '')
    return { success: res.ok, code: res.status, body: resBody.slice(0, 500) }
  } catch (err) {
    clearTimeout(timeout)
    return { success: false, code: 0, body: String(err) }
  }
}

// ── nextRetryAt calculation ───────────────────────────────────────────────────

function nextRetryAt(attempts: number): string {
  const delaySec = RETRY_DELAYS_SEC[attempts] ?? RETRY_DELAYS_SEC[RETRY_DELAYS_SEC.length - 1]
  return new Date(Date.now() + delaySec * 1000).toISOString()
}

// ── processDelivery: dispatch + persist result ────────────────────────────────

type DeliveryOutcome = 'delivered' | 'failed' | 'abandoned'

async function processDelivery(
  supabase: ReturnType<typeof createClient>,
  d: Claimed,
): Promise<DeliveryOutcome> {
  if (!d.enabled) {
    await supabase.from('webhook_deliveries').update({ status: 'abandoned' }).eq('id', d.delivery_id)
    return 'abandoned'
  }

  const newAttempts = d.attempts + 1
  const result = await dispatchDelivery(d)

  if (result.success) {
    await supabase.from('webhook_deliveries').update({
      status:             'delivered',
      attempts:           newAttempts,
      last_response_code: result.code,
      last_response_body: result.body,
      delivered_at:       new Date().toISOString(),
    }).eq('id', d.delivery_id)

    await supabase.from('webhook_subscriptions').update({
      last_success_at: new Date().toISOString(),
      failure_count:   0,
    }).eq('id', d.subscription_id)

    return 'delivered'
  }

  const status: 'pending' | 'abandoned' = newAttempts >= MAX_ATTEMPTS ? 'abandoned' : 'pending'

  await supabase.from('webhook_deliveries').update({
    status,
    attempts:           newAttempts,
    next_retry_at:      nextRetryAt(newAttempts),
    last_response_code: result.code,
    last_response_body: result.body,
  }).eq('id', d.delivery_id)

  await supabase.rpc('increment_webhook_failure_count', { sub_id: d.subscription_id }).then(() => {})
  await supabase.from('webhook_subscriptions').update({
    last_error_at: new Date().toISOString(),
  }).eq('id', d.subscription_id)

  if (status === 'abandoned') {
    console.warn(`Delivery ${d.delivery_id} abandoned after ${newAttempts} attempts`)
    return 'abandoned'
  }
  return 'failed'
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const denied = await requireServiceCaller(req)
  if (denied) return denied

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const results = { claimed: 0, delivered: 0, failed: 0, abandoned: 0 }

  // Hasta MAX_ROUNDS lotes por invocación; cada lote se reserva en la BD antes de enviarse.
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data: claimed, error } = await supabase.rpc('claim_webhook_deliveries', { p_limit: BATCH })
    if (error) {
      return new Response(JSON.stringify({ error: error.message, ...results }), { status: 500 })
    }
    const batch = (claimed ?? []) as Claimed[]
    results.claimed += batch.length
    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      const outcomes = await Promise.all(batch.slice(i, i + CONCURRENCY).map(d => processDelivery(supabase, d)))
      for (const o of outcomes) results[o]++
    }
    if (batch.length < BATCH) break
  }

  return new Response(JSON.stringify(results), { status: 200 })
})
