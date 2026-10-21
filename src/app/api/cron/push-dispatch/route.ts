import { hasBearerSecret } from '@/lib/security/secret-compare'
import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWebPush } from '@/lib/push/web-push'
import { isUrgentKind, notificationTopic } from '@/lib/notifications/topics'

/**
 * POST /api/cron/push-dispatch
 *
 * Envía por push los avisos de `notifications` a las suscripciones de su destinatario que tienen activo el tema del
 * aviso (src/lib/notifications/topics.ts).
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * S22 (I-09): el push sale de la bandeja. Cada aviso ya es de una persona, así que llega lo que de verdad le toca
 * (holds, co-firmas, traspasos, asignaciones, vencidos…); antes salía de domain_events con eventos que no existían.
 * Cola en la BD: el trigger de notifications encola los avisos de quien tiene una suscripción activa y
 * `claim_push_notifications` los saca al reclamarlos (un cron atrasado no pierde avisos; dos corridas no los repiten;
 * los ya leídos en la app no se envían).
 */

type QueuedNotification = {
  id: string
  org_id: string
  recipient_user_id: string
  kind: string
  title: string
  body: string | null
  link_url: string | null
}

type PushSub = {
  id: string
  user_id: string
  org_id: string
  endpoint: string
  p256dh: string
  auth_secret: string
  topics: string[]
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  if (!hasBearerSecret(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: queued, error } = await admin.rpc('claim_push_notifications', { p_limit: 500 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const items = (queued ?? []) as QueuedNotification[]

  // Suscripciones de todos los destinatarios del lote en una consulta.
  const userIds = Array.from(new Set(items.map(n => n.recipient_user_id)))
  const { data: allSubs, error: subsErr } = userIds.length === 0
    ? { data: [], error: null }
    : await admin
        .from('push_subscriptions')
        .select('id, user_id, org_id, endpoint, p256dh, auth_secret, topics')
        .in('user_id', userIds)
        .eq('enabled', true)
  if (subsErr) return NextResponse.json({ error: subsErr.message }, { status: 500 })
  const subsByUserOrg = new Map<string, PushSub[]>()
  for (const s of (allSubs ?? []) as PushSub[]) {
    const k = `${s.user_id}:${s.org_id}`
    subsByUserOrg.set(k, [...(subsByUserOrg.get(k) ?? []), s])
  }

  let dispatched = 0
  let failed = 0

  for (const n of items) {
    const topic = notificationTopic(n.kind)
    const targets = (subsByUserOrg.get(`${n.recipient_user_id}:${n.org_id}`) ?? []).filter(s => s.topics.includes(topic))
    const urgent = isUrgentKind(n.kind)

    // G-22/I-28: el SW muestra lo que llega (título y textos ya armados) y abre link_url, una ruta real de la app.
    const payloadStr = JSON.stringify({
      title: n.title,
      body: n.body ?? '',
      type: n.kind,
      entity_id: n.id,
      action_url: n.link_url ?? '/inbox',
      priority: urgent ? 'high' : 'normal',
      tag: `${n.kind}:${n.id}`,
      labels: { open: 'Abrir', dismiss: 'Cerrar' },
    })

    await Promise.all(targets.map(async sub => {
      const res = await sendWebPush({
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth_secret,
        payload: payloadStr,
        urgency: urgent ? 'high' : 'normal',
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
    notifications: items.length,
    dispatched,
    failed,
  })
}
