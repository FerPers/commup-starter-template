// @ts-nocheck — Deno runtime
// ══════════════════════════════════════════════════════════════════════════════
// Stage 13.3 — webhook-dispatcher (Supabase Edge Function, Deno)
//
// Two execution modes:
//   A) Called by a pg_net trigger on domain_events INSERT:
//      POST { event_id: "<uuid>" }
//      → Creates webhook_deliveries for matching subscriptions AND
//        immediately dispatches the first attempt in parallel.
//        Failed deliveries stay `pending` with next_retry_at set.
//
//   B) Called by a cron-like scheduler to retry pending deliveries:
//      POST { mode: "retry" }
//      → Fetches pending deliveries due for retry, dispatches them
//
// Outbound request format:
//   POST <endpoint_url>
//   X-CommUp-Event:     <event_type>          e.g. punch.created
//   X-CommUp-Delivery:  <delivery_id>
//   X-CommUp-Signature: sha256=<hmac>         HMAC-SHA256(secret, body)
//   Content-Type:       application/json
//
// Retry schedule (exponential backoff):
//   Attempt 1 → immediate
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
const DISPATCH_TIMEOUT  = 10_000   // 10 s per outbound request

// Retry delays in seconds
const RETRY_DELAYS_SEC  = [0, 60, 300, 1800, 7200]

// ── HMAC-SHA256 ───────────────────────────────────────────────────────────────

async function hmacSha256(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return 'sha256=' + Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── Dispatch a single delivery ────────────────────────────────────────────────

async function dispatchDelivery(
  supabase: ReturnType<typeof createClient>,
  delivery: {
    id: string
    subscription_id: string
    endpoint_url: string
    secret: string
    event_type: string
    event_payload: Record<string, unknown>
    occurred_at: string
    attempts: number
  },
): Promise<{ success: boolean; code?: number; body?: string }> {
  const bodyObj = {
    id:         delivery.id,
    event_type: delivery.event_type,
    occurred_at: delivery.occurred_at,
    data:       delivery.event_payload,
  }
  const bodyStr  = JSON.stringify(bodyObj)
  const signature = await hmacSha256(delivery.secret, bodyStr)

  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT)

  try {
    await assertPublicHttpsUrl(delivery.endpoint_url)
    const res = await fetch(delivery.endpoint_url, {
      method:  'POST',
      redirect: 'manual',
      headers: {
        'Content-Type':       'application/json',
        'X-CommUp-Event':     delivery.event_type,
        'X-CommUp-Delivery':  delivery.id,
        'X-CommUp-Signature': signature,
        'User-Agent':         'CommUp-Webhooks/1.0',
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

// ── processDelivery: dispatch + persist result (used by Mode A and Mode B) ────

type DeliveryOutcome = 'delivered' | 'failed' | 'abandoned'

async function processDelivery(
  supabase: ReturnType<typeof createClient>,
  args: {
    deliveryId:     string
    subscriptionId: string
    endpointUrl:    string
    secret:         string
    eventType:      string
    payload:        Record<string, unknown>
    occurredAt:     string
    currentAttempts: number
  },
): Promise<DeliveryOutcome> {
  const newAttempts = args.currentAttempts + 1
  const result = await dispatchDelivery(supabase, {
    id:              args.deliveryId,
    subscription_id: args.subscriptionId,
    endpoint_url:    args.endpointUrl,
    secret:          args.secret,
    event_type:      args.eventType,
    event_payload:   args.payload,
    occurred_at:     args.occurredAt,
    attempts:        newAttempts,
  })

  if (result.success) {
    await supabase.from('webhook_deliveries').update({
      status:             'delivered',
      attempts:           newAttempts,
      last_response_code: result.code,
      last_response_body: result.body,
      delivered_at:       new Date().toISOString(),
    }).eq('id', args.deliveryId)

    await supabase.from('webhook_subscriptions').update({
      last_success_at: new Date().toISOString(),
      failure_count:   0,
    }).eq('id', args.subscriptionId)

    return 'delivered'
  }

  const status: 'pending' | 'abandoned' = newAttempts >= MAX_ATTEMPTS ? 'abandoned' : 'pending'

  await supabase.from('webhook_deliveries').update({
    status,
    attempts:           newAttempts,
    next_retry_at:      nextRetryAt(newAttempts),
    last_response_code: result.code,
    last_response_body: result.body,
  }).eq('id', args.deliveryId)

  await supabase.rpc('increment_webhook_failure_count', { sub_id: args.subscriptionId }).then(() => {})
  await supabase.from('webhook_subscriptions').update({
    last_error_at: new Date().toISOString(),
  }).eq('id', args.subscriptionId)

  if (status === 'abandoned') {
    console.warn(`Delivery ${args.deliveryId} abandoned after ${newAttempts} attempts`)
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

  let body: { event_id?: string; mode?: string }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  // ── Mode A: new domain event → create deliveries ──────────────────────────

  if (body.event_id) {
    const { data: event, error: evErr } = await supabase
      .from('domain_events')
      .select('id, org_id, project_id, event_type, payload, occurred_at')
      .eq('id', body.event_id)
      .single()

    if (evErr || !event) {
      return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404 })
    }

    // Find matching enabled subscriptions (incl. endpoint/secret for inline dispatch)
    const { data: subs } = await supabase
      .from('webhook_subscriptions')
      .select('id, event_types, project_id, endpoint_url, secret')
      .eq('org_id', event.org_id)
      .eq('enabled', true)

    const matching = (subs ?? []).filter(sub => {
      if (sub.project_id && sub.project_id !== event.project_id) return false
      const types = sub.event_types as string[]
      return types.includes('*') || types.includes(event.event_type)
    })

    if (matching.length === 0) {
      return new Response(JSON.stringify({ created: 0, delivered: 0, failed: 0 }), { status: 200 })
    }

    // Create pending deliveries, return their IDs
    const { data: inserted, error: insErr } = await supabase
      .from('webhook_deliveries')
      .insert(
        matching.map(sub => ({
          subscription_id: sub.id,
          domain_event_id: event.id,
          status:          'pending',
          attempts:        0,
          next_retry_at:   new Date().toISOString(),
        }))
      )
      .select('id, subscription_id')

    if (insErr || !inserted) {
      return new Response(JSON.stringify({ error: insErr?.message ?? 'insert failed' }), { status: 500 })
    }

    // Dispatch inline, in parallel — first attempt for each matching sub
    const subMap = new Map(matching.map(s => [s.id, s]))
    const outcomes = await Promise.all(
      inserted.map(del => {
        const sub = subMap.get(del.subscription_id)!
        return processDelivery(supabase, {
          deliveryId:      del.id,
          subscriptionId:  del.subscription_id,
          endpointUrl:     sub.endpoint_url,
          secret:          sub.secret,
          eventType:       event.event_type,
          payload:         event.payload,
          occurredAt:      event.occurred_at,
          currentAttempts: 0,
        })
      })
    )

    const tally = outcomes.reduce<Record<DeliveryOutcome, number>>(
      (acc, o) => { acc[o]++; return acc },
      { delivered: 0, failed: 0, abandoned: 0 },
    )

    console.log(`Event ${event.id} (${event.event_type}): created=${inserted.length} ` +
                `delivered=${tally.delivered} failed=${tally.failed} abandoned=${tally.abandoned}`)

    return new Response(
      JSON.stringify({ created: inserted.length, ...tally }),
      { status: 200 },
    )
  }

  // ── Mode B: retry pending deliveries ─────────────────────────────────────

  if (body.mode === 'retry' || !body.event_id) {
    const now = new Date().toISOString()

    // Fetch due pending deliveries (join subscription + event)
    const { data: due, error: dueErr } = await supabase
      .from('webhook_deliveries')
      .select(`
        id, subscription_id, attempts,
        domain_event_id,
        domain_events ( event_type, payload, occurred_at ),
        webhook_subscriptions ( endpoint_url, secret, enabled )
      `)
      .eq('status', 'pending')
      .lte('next_retry_at', now)
      .limit(50)   // process up to 50 per invocation

    if (dueErr) {
      return new Response(JSON.stringify({ error: dueErr.message }), { status: 500 })
    }

    const results = { delivered: 0, failed: 0, abandoned: 0 }

    for (const delivery of (due ?? [])) {
      const sub   = delivery.webhook_subscriptions as { endpoint_url: string; secret: string; enabled: boolean }
      const event = delivery.domain_events as { event_type: string; payload: Record<string, unknown>; occurred_at: string }

      if (!sub?.enabled) {
        await supabase.from('webhook_deliveries').update({ status: 'abandoned' }).eq('id', delivery.id)
        results.abandoned++
        continue
      }

      const outcome = await processDelivery(supabase, {
        deliveryId:      delivery.id,
        subscriptionId:  delivery.subscription_id,
        endpointUrl:     sub.endpoint_url,
        secret:          sub.secret,
        eventType:       event.event_type,
        payload:         event.payload,
        occurredAt:      event.occurred_at,
        currentAttempts: delivery.attempts,
      })
      results[outcome]++
    }

    return new Response(JSON.stringify(results), { status: 200 })
  }

  return new Response('Unknown mode', { status: 400 })
})
