// ══════════════════════════════════════════════════════════════
// Stage 11.2 — evaluate-workflow (Supabase Edge Function, Deno)
// ══════════════════════════════════════════════════════════════
// Triggered by pg_net on domain_events INSERT. Loads matching
// workflow_rules, evaluates condition_jsonlogic against payload,
// executes action if matched, logs every attempt to
// workflow_executions.
//
// Deploy: supabase functions deploy evaluate-workflow --no-verify-jwt
// ══════════════════════════════════════════════════════════════

// @ts-nocheck — Deno runtime, not Node
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import jsonLogic from 'https://esm.sh/json-logic-js@2.0.5'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let body: { event_id?: string }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const eventId = body.event_id
  if (!eventId) return new Response('event_id required', { status: 400 })

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

  // 2. Fetch matching enabled rules
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
async function executeAction(
  supabase: ReturnType<typeof createClient>,
  rule: WorkflowRule,
  event: DomainEvent,
): Promise<Record<string, unknown>> {
  const payload = rule.action_payload ?? {}

  switch (rule.action_type) {
    case 'block_certificate': {
      // Expect: event is on certificates or has certificate_id in payload
      const certId =
        (event.payload.new as Record<string, unknown> | undefined)?.id ??
        payload.certificate_id
      if (!certId) throw new Error('No certificate_id resolvable')
      const { error } = await supabase
        .from('certificates')
        .update({
          is_blocked: true,
          block_reason: payload.reason ?? `workflow rule: ${rule.id}`,
        })
        .eq('id', certId)
      if (error) throw new Error(error.message)
      return { certificate_id: certId, blocked: true }
    }

    case 'notify_user': {
      // Insert into alerts table (assumes it exists; falls back gracefully)
      const { error } = await supabase.from('alerts').insert({
        org_id: event.org_id,
        project_id: event.project_id,
        user_id: payload.user_id ?? null,
        role: payload.role ?? null,
        severity: payload.severity ?? 'info',
        title: payload.title ?? `Workflow: ${rule.id}`,
        message: payload.message ?? event.event_type,
        source_event_id: event.id,
      })
      if (error) throw new Error(error.message)
      return { notified: true }
    }

    case 'create_punch': {
      const eventNew = event.payload.new as Record<string, unknown> | undefined
      const { error } = await supabase.from('punches').insert({
        org_id: event.org_id,
        project_id: event.project_id,
        tag_id: payload.tag_id ?? eventNew?.tag_id ?? null,
        category: payload.category ?? 'B',
        description: payload.description ?? `Auto: ${rule.id}`,
        status: 'open',
        created_via: 'workflow',
      })
      if (error) throw new Error(error.message)
      return { punch_created: true }
    }

    case 'change_system_state': {
      const table = (payload.table as string) ?? 'systems'
      const id = payload.id ?? (event.payload.new as Record<string, unknown> | undefined)?.id
      if (!id) throw new Error('No target id')
      const { error } = await supabase
        .from(table)
        .update({ state: payload.state })
        .eq('id', id)
      if (error) throw new Error(error.message)
      return { table, id, new_state: payload.state }
    }

    case 'webhook_call': {
      const url = payload.url as string
      if (!url) throw new Error('Missing webhook url')
      const resp = await fetch(url, {
        method: (payload.method as string) ?? 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(payload.headers as Record<string, string> ?? {}),
        },
        body: JSON.stringify({
          rule_id: rule.id,
          event,
          extra: payload.extra ?? null,
        }),
      })
      return { status: resp.status, ok: resp.ok }
    }

    default:
      throw new Error(`Unknown action_type: ${rule.action_type}`)
  }
}
