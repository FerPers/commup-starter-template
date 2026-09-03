// ══════════════════════════════════════════════════════════════
// Stage 11.2 — evaluate-workflow (Supabase Edge Function, Deno)
// ══════════════════════════════════════════════════════════════
// Triggered by pg_net on domain_events INSERT. Loads matching
// workflow_rules, evaluates condition_jsonlogic against payload,
// executes action if matched, logs every attempt to
// workflow_executions.
//
// Seguridad (Sprint S, 2026-09-03):
//  - El gateway se despliega con verify_jwt=false porque el trigger
//    pg_net envía la service key guardada en Vault (puede ser una key
//    rotada / formato sb_secret_). La función AUTENTICA POR SU CUENTA:
//    exige `Authorization: Bearer <service key>` y lo valida contra la
//    Admin API (solo service_role responde). Sin eso → 401.
//  - Toda mutación se acota al project/org del evento (nunca tabla o id
//    libres). `change_system_state` está deshabilitada (systems no tiene
//    columna state). `webhook_call` solo a https públicos (anti-SSRF).
//
// Deploy: supabase functions deploy evaluate-workflow --no-verify-jwt
// ══════════════════════════════════════════════════════════════

// @ts-nocheck — Deno runtime, not Node
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import jsonLogic from 'https://esm.sh/json-logic-js@2.0.5'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const WEBHOOK_TIMEOUT_MS = 10_000

type DomainEvent = {
  id: string
  org_id: string
  project_id: string
  aggregate_type: string
  aggregate_id: string
  event_type: string
  payload: Record<string, unknown>
  actor_id: string | null
}

type WorkflowRule = {
  id: string
  org_id: string
  trigger_event: string
  condition_jsonlogic: Record<string, unknown>
  action_type: string
  action_payload: Record<string, unknown>
  priority: number
  enabled: boolean
}

// ── Auth: solo llamadas con service key ──────────────────────
async function requireServiceCaller(req: Request): Promise<Response | null> {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return new Response('Unauthorized', { status: 401 })
  if (token === SERVICE_ROLE_KEY) return null
  // La key en Vault puede diferir de la inyectada en el runtime (rotación).
  // La Admin API de Auth solo responde a service_role → prueba definitiva.
  try {
    const probe = createClient(SUPABASE_URL, token, { auth: { persistSession: false } })
    const { error } = await probe.auth.admin.listUsers({ page: 1, perPage: 1 })
    if (!error) return null
  } catch { /* cae al 401 */ }
  return new Response('Unauthorized', { status: 401 })
}

// ── Anti-SSRF: solo https hacia hosts públicos ───────────────
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

async function assertPublicHttpsUrl(raw: unknown): Promise<URL> {
  if (typeof raw !== 'string') throw new Error('Missing webhook url')
  let u: URL
  try { u = new URL(raw) } catch { throw new Error('URL inválida') }
  if (u.protocol !== 'https:') throw new Error('Solo se permiten URLs https')
  if (u.username || u.password) throw new Error('URL con credenciales no permitida')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (BLOCKED_HOST_RE.test(host)) throw new Error(`Host no permitido: ${host}`)
  if (/^[\d.]+$/.test(host) || host.includes(':')) {
    if (isPrivateIp(host)) throw new Error(`IP privada no permitida: ${host}`)
    return u
  }
  // Resolución DNS para frenar rebinding hacia rangos privados.
  // Si el runtime no soporta resolveDns, seguimos con los filtros por nombre.
  const addrs: string[] = []
  try {
    const [a, aaaa] = await Promise.allSettled([
      Deno.resolveDns(host, 'A'),
      Deno.resolveDns(host, 'AAAA'),
    ])
    if (a.status === 'fulfilled') addrs.push(...a.value)
    if (aaaa.status === 'fulfilled') addrs.push(...aaaa.value)
  } catch { /* sin soporte DNS en el runtime */ }
  if (addrs.some(isPrivateIp)) throw new Error(`Host resuelve a una IP privada: ${host}`)
  return u
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const denied = await requireServiceCaller(req)
  if (denied) return denied

  let body: { event_id?: string }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const eventId = body.event_id
  if (!eventId || typeof eventId !== 'string') return new Response('event_id required', { status: 400 })

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  // 1. Fetch event
  const { data: event, error: evErr } = await supabase
    .from('domain_events')
    .select('*')
    .eq('id', eventId)
    .single<DomainEvent>()

  if (evErr || !event) {
    return new Response(`Event not found: ${evErr?.message ?? 'unknown'}`, { status: 404 })
  }

  // 2. Fetch matching enabled rules (solo de la org del evento)
  const { data: rules, error: rulesErr } = await supabase
    .from('workflow_rules')
    .select('id, org_id, trigger_event, condition_jsonlogic, action_type, action_payload, priority, enabled')
    .eq('org_id', event.org_id)
    .eq('trigger_event', event.event_type)
    .eq('enabled', true)
    .order('priority', { ascending: true })

  if (rulesErr) {
    return new Response(`Rules fetch error: ${rulesErr.message}`, { status: 500 })
  }

  const results: Array<{ rule_id: string; matched: boolean; error?: string }> = []

  // 3. Evaluate + execute
  for (const rule of (rules ?? []) as WorkflowRule[]) {
    let matched = false
    let actionResult: Record<string, unknown> | null = null
    let errorMessage: string | null = null

    try {
      const conditionEmpty =
        !rule.condition_jsonlogic ||
        Object.keys(rule.condition_jsonlogic).length === 0
      matched = conditionEmpty
        ? true
        : Boolean(jsonLogic.apply(rule.condition_jsonlogic, event.payload))
    } catch (e) {
      errorMessage = `Condition eval error: ${(e as Error).message}`
    }

    if (matched && !errorMessage) {
      try {
        actionResult = await executeAction(supabase, rule, event)
      } catch (e) {
        errorMessage = `Action error: ${(e as Error).message}`
      }
    }

    await supabase.from('workflow_executions').insert({
      rule_id: rule.id,
      event_id: event.id,
      org_id: event.org_id,
      matched,
      action_result: actionResult,
      error_message: errorMessage,
    })

    results.push({ rule_id: rule.id, matched, error: errorMessage ?? undefined })
  }

  return Response.json({ evaluated: results.length, results })
})

// ── Action executor ──────────────────────────────────────────
// Regla de oro: cada escritura se filtra por event.project_id / event.org_id.
// El payload de la regla lo escribe un admin de SU org; nunca puede apuntar
// a filas de otra org.
async function executeAction(
  supabase: ReturnType<typeof createClient>,
  rule: WorkflowRule,
  event: DomainEvent,
): Promise<Record<string, unknown>> {
  const payload = rule.action_payload ?? {}
  const eventNew = event.payload?.new as Record<string, unknown> | undefined

  switch (rule.action_type) {
    case 'block_certificate': {
      const certId = eventNew?.id ?? payload.certificate_id
      if (!certId || typeof certId !== 'string') throw new Error('No certificate_id resolvable')
      const { data, error } = await supabase
        .from('certificates')
        .update({
          is_blocked: true,
          block_reason: String(payload.reason ?? `workflow rule: ${rule.id}`).slice(0, 500),
        })
        .eq('id', certId)
        .eq('project_id', event.project_id)
        .select('id')
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) throw new Error('Certificate not found in event project')
      return { certificate_id: certId, blocked: true }
    }

    case 'notify_user': {
      let userId: string | null = null
      if (payload.user_id) {
        // El destinatario debe ser miembro de la org del evento
        const { data: member } = await supabase
          .from('org_members')
          .select('user_id')
          .eq('org_id', event.org_id)
          .eq('user_id', payload.user_id)
          .maybeSingle()
        if (!member) throw new Error('user_id is not a member of the event org')
        userId = member.user_id
      }
      const { error } = await supabase.from('alerts').insert({
        org_id: event.org_id,
        project_id: event.project_id,
        user_id: userId,
        role: payload.role ?? null,
        severity: payload.severity ?? 'info',
        title: String(payload.title ?? `Workflow: ${rule.id}`).slice(0, 200),
        message: String(payload.message ?? event.event_type).slice(0, 2000),
        source_event_id: event.id,
      })
      if (error) throw new Error(error.message)
      return { notified: true }
    }

    case 'create_punch': {
      // punches exige subsystem_id, discipline_id y raised_by: se derivan
      // del tag del evento (mismo proyecto) y del actor del evento.
      const tagId = payload.tag_id ?? eventNew?.tag_id
      if (!tagId || typeof tagId !== 'string') throw new Error('No tag_id resolvable for punch')
      const { data: tag, error: tagErr } = await supabase
        .from('tags')
        .select('id, project_id, subsystem_id, discipline_id')
        .eq('id', tagId)
        .eq('project_id', event.project_id)
        .maybeSingle()
      if (tagErr) throw new Error(tagErr.message)
      if (!tag) throw new Error('Tag not found in event project')
      const raisedBy = event.actor_id
      if (!raisedBy) throw new Error('Event has no actor to raise the punch')
      const category = ['A', 'B', 'C'].includes(String(payload.category)) ? String(payload.category) : 'B'
      const { data: punch, error } = await supabase
        .from('punches')
        .insert({
          project_id: event.project_id,
          subsystem_id: tag.subsystem_id,
          discipline_id: tag.discipline_id,
          tag_id: tag.id,
          punch_number: '', // el trigger punch_number_before_insert asigna el número
          category,
          description: String(payload.description ?? `Auto: ${rule.id}`).slice(0, 2000),
          raised_by: raisedBy,
          status: 'open',
          created_via: 'workflow',
        })
        .select('id, punch_number')
        .single()
      if (error) throw new Error(error.message)
      return { punch_created: true, punch_id: punch.id, punch_number: punch.punch_number }
    }

    case 'change_system_state': {
      // Deshabilitada: systems/subsystems no tienen columna `state` y la
      // versión anterior aceptaba tabla e id arbitrarios (cross-tenant).
      throw new Error('change_system_state is disabled')
    }

    case 'webhook_call': {
      const url = await assertPublicHttpsUrl(payload.url)
      const method = payload.method === 'PUT' ? 'PUT' : 'POST'
      const extraHeaders: Record<string, string> = {}
      const rawHeaders = (payload.headers ?? {}) as Record<string, unknown>
      for (const [k, v] of Object.entries(rawHeaders).slice(0, 10)) {
        const key = k.toLowerCase()
        if (['host', 'content-length', 'transfer-encoding', 'connection'].includes(key)) continue
        if (typeof v === 'string' && v.length <= 1024) extraHeaders[k] = v
      }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS)
      try {
        const resp = await fetch(url.toString(), {
          method,
          redirect: 'manual', // no seguir redirecciones hacia destinos no validados
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'CommUp-Workflows/1.0',
            ...extraHeaders,
          },
          body: JSON.stringify({
            rule_id: rule.id,
            event,
            extra: payload.extra ?? null,
          }),
          signal: controller.signal,
        })
        return { status: resp.status, ok: resp.ok }
      } finally {
        clearTimeout(timer)
      }
    }

    default:
      throw new Error(`Unknown action_type: ${rule.action_type}`)
  }
}
