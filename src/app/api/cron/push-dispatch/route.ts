import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWebPush } from '@/lib/push/web-push'

/**
 * POST /api/cron/push-dispatch
 *
 * Despacha notificaciones push para los `domain_events` recientes
 * a las subscriptions cuyas topics matcheen.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Mapping evento → topic:
 *   itr.returned          → itr_returned
 *   punch.created (cat A) → punch_cat_a
 *   punch.assigned        → punch_assigned
 *   certificate.ready     → cert_ready
 *
 * Para topic `my_items_only`, sólo se notifica al user_id en payload.assignee_id
 * (o assigned_to / responsible_user_id, según el evento).
 *
 * Cursor: tabla `push_dispatch_cursor (id=1, last_event_at)` para
 * no reprocesar. Si la tabla no existe, procesa los últimos 5 minutos.
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

function eventToTopic(ev: DomainEvent): { topic: string; title: string; body: string; url: string; priority: 'high' | 'normal' | 'low'; assignee?: string | null } | null {
  const p = ev.payload as Record<string, unknown>
  switch (ev.event_type) {
    case 'itr.returned':
      return {
        topic: 'itr_returned',
        title: 'ITR devuelto',
        body: typeof p.itr_number === 'string' ? `ITR ${p.itr_number} requiere correcciones` : 'Un ITR fue devuelto',
        url: `/itrs/${ev.aggregate_id}`,
        priority: 'high',
        assignee: typeof p.submitted_by === 'string' ? p.submitted_by : null,
      }
    case 'punch.created':
      if (p.category === 'A') {
        return {
          topic: 'punch_cat_a',
          title: 'Punch Cat A creado',
          body: typeof p.punch_number === 'string' ? `Punch ${p.punch_number} bloquea completion` : 'Punch crítico nuevo',
          url: `/punch-list`,
          priority: 'high',
          assignee: typeof p.assigned_to === 'string' ? p.assigned_to : null,
        }
      }
      return null
    case 'punch.assigned':
      return {
        topic: 'punch_assigned',
        title: 'Punch asignado',
        body: typeof p.punch_number === 'string' ? `Punch ${p.punch_number} te fue asignado` : 'Tienes un punch asignado',
        url: `/punch-list`,
        priority: 'normal',
        assignee: typeof p.assigned_to === 'string' ? p.assigned_to : null,
      }
    case 'certificate.ready':
      return {
        topic: 'cert_ready',
        title: 'Certificado listo',
        body: typeof p.cert_type === 'string' ? `${p.cert_type} disponible para firma` : 'Un certificado está listo',
        url: `/certificates`,
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
  if ((req.headers.get('authorization') ?? '') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Cursor: últimos 5 minutos como ventana por defecto.
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString()

  const { data: events, error } = await admin
    .from('domain_events')
    .select('id, org_id, project_id, aggregate_type, aggregate_id, event_type, payload, occurred_at')
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: true })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let dispatched = 0
  let failed = 0

  for (const ev of (events ?? []) as DomainEvent[]) {
    const mapping = eventToTopic(ev)
    if (!mapping) continue

    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth_secret, topics')
      .eq('org_id', ev.org_id)
      .eq('enabled', true)
      .contains('topics', [mapping.topic])
    let targets = (subs ?? []) as PushSub[]

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
    window_since: since,
    events: events?.length ?? 0,
    dispatched,
    failed,
  })
}
