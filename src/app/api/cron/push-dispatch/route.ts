import { hasBearerSecret } from '@/lib/security/secret-compare'
import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWebPush } from '@/lib/push/web-push'

/**
 * POST /api/cron/push-dispatch
 *
 * Despacha notificaciones push para los `domain_events` encolados en `push_outbox` a las subscriptions cuyas topics
 * matcheen.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Mapping evento (catálogo v1, src/lib/constants/domain-events.ts) → topic:
 *   itr.rejected / itr.returned → itr_returned
 *   punch.created (cat A)       → punch_cat_a
 *   punch.assigned              → punch_assigned
 *   certificate.issued          → cert_ready
 *
 * Para topic `my_items_only`, sólo se notifica al user_id del responsable del evento.
 *
 * S21 (B-11): cola en la BD. `outbox_dispatch` (pg_cron, cada minuto) encola los tipos de PUSH_EVENT_TYPES y
 * `claim_push_events` los saca al reclamarlos: un cron atrasado no pierde eventos y dos corridas solapadas no
 * notifican dos veces. Antes: ventana fija de 5 min y `limit(500)`.
 */

type DomainEvent = {
  id: string
  org_id: string
  project_id: string
  aggregate_type: string
  aggregate_id: string
  event_type: string
  payload: Record<string, unknown>
  occurred_at: string
}

type PushSub = {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth_secret: string
  topics: string[]
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function eventToTopic(ev: DomainEvent): { topic: string; title: string; body: string; url: string; priority: 'high' | 'normal' | 'low'; assignee?: string | null } | null {
  const p = ev.payload as Record<string, unknown>
  // Cambio de fila: la fila está en `new` (los eventos de la API v1 traen los campos sueltos).
  const row = (p.new && typeof p.new === 'object' ? p.new : p) as Record<string, unknown>
  switch (ev.event_type) {
    case 'itr.rejected':
    case 'itr.returned': {
      const tagId = str(p.tag_id)
      return {
        topic: 'itr_returned',
        title: ev.event_type === 'itr.rejected' ? 'ITR rechazado' : 'ITR devuelto',
        body: str(p.number) ? `ITR ${p.number} requiere correcciones` : 'Un ITR fue devuelto',
        url: tagId ? `/projects/${ev.project_id}/tags/${tagId}/itrs/${ev.aggregate_id}` : `/projects/${ev.project_id}/itrs`,
        priority: 'high',
        assignee: null,
      }
    }
    case 'punch.created':
      if (row.category === 'A') {
        return {
          topic: 'punch_cat_a',
          title: 'Punch Cat A creado',
          body: str(row.punch_number) ? `Punch ${row.punch_number} bloquea completion` : 'Punch crítico nuevo',
          url: `/projects/${ev.project_id}/punches`,
          priority: 'high',
          assignee: str(row.assigned_to),
        }
      }
      return null
    case 'punch.assigned':
      return {
        topic: 'punch_assigned',
        title: 'Punch asignado',
        body: str(p.number) ? `Punch ${p.number} te fue asignado` : 'Tienes un punch asignado',
        url: `/projects/${ev.project_id}/punches`,
        priority: 'normal',
        assignee: str(p.assigned_to),
      }
    case 'certificate.issued':
      return {
        topic: 'cert_ready',
        title: 'Certificado emitido',
        body: str(p.number) ? `${p.number} emitido` : 'Se emitió un certificado',
        url: `/projects/${ev.project_id}/certificates`,
        priority: 'normal',
        assignee: null,
      }
    default:
      return null
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  if (!hasBearerSecret(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: events, error } = await admin.rpc('claim_push_events', { p_limit: 500 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const evs = (events ?? []) as DomainEvent[]

  // B-11: suscripciones de todas las orgs del lote en una consulta (antes, una por evento).
  const orgIds = Array.from(new Set(evs.map(e => e.org_id)))
  const { data: allSubs, error: subsErr } = orgIds.length === 0
    ? { data: [], error: null }
    : await admin
        .from('push_subscriptions')
        .select('id, user_id, org_id, endpoint, p256dh, auth_secret, topics')
        .in('org_id', orgIds)
        .eq('enabled', true)
  if (subsErr) return NextResponse.json({ error: subsErr.message }, { status: 500 })
  const subsByOrg = new Map<string, PushSub[]>()
  for (const s of (allSubs ?? []) as (PushSub & { org_id: string })[]) {
    subsByOrg.set(s.org_id, [...(subsByOrg.get(s.org_id) ?? []), s])
  }

  let dispatched = 0
  let failed = 0

  for (const ev of evs) {
    const mapping = eventToTopic(ev)
    if (!mapping) continue

    let targets = (subsByOrg.get(ev.org_id) ?? []).filter(s => s.topics.includes(mapping.topic))

    // Aplicar filtro `my_items_only` si la sub lo tiene activo
    if (mapping.assignee) {
      targets = targets.filter(s =>
        !s.topics.includes('my_items_only') || s.user_id === mapping.assignee
      )
    } else {
      targets = targets.filter(s => !s.topics.includes('my_items_only'))
    }

    const payloadStr = JSON.stringify({
      title: mapping.title,
      body: mapping.body,
      type: ev.event_type.toUpperCase().replace('.', '_'),
      entity_id: ev.aggregate_id,
      action_url: mapping.url,
      priority: mapping.priority,
      tag: `${ev.aggregate_type}:${ev.aggregate_id}`,
    })

    await Promise.all(targets.map(async sub => {
      const res = await sendWebPush({
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth_secret,
        payload: payloadStr,
        urgency: mapping.priority === 'high' ? 'high' : 'normal',
      })
      if (res.ok) {
        dispatched++
        await admin.from('push_subscriptions')
          .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
          .eq('id', sub.id)
      } else {
        failed++
        // 404/410 → endpoint inválido, deshabilitar
        if (res.status === 404 || res.status === 410) {
          await admin.from('push_subscriptions')
            .update({ enabled: false, last_failure_at: new Date().toISOString() })
            .eq('id', sub.id)
        } else {
          await admin.rpc('bump_push_subscription_failure', { p_sub_id: sub.id })
        }
      }
    }))
  }

  return NextResponse.json({
    events: evs.length,
    dispatched,
    failed,
  })
}
