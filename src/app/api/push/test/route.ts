import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWebPush } from '@/lib/push/web-push'

/**
 * POST /api/push/test — envía un push de prueba a TODAS las subscriptions
 * activas del usuario autenticado. Útil para debugging.
 */
export async function POST(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_secret, topics')
    .eq('user_id', user.id)
    .eq('enabled', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!subs || subs.length === 0) {
    return NextResponse.json({ error: 'No active subscriptions' }, { status: 404 })
  }

  const payload = {
    title: 'CommUp · Notificación de prueba',
    body: 'Si ves esto, las notificaciones están funcionando ✓',
    type: 'SYSTEM',
    action_url: '/dashboard',
    priority: 'normal' as const,
  }

  const results = await Promise.all(
    subs.map(async sub => {
      const res = await sendWebPush({
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth_secret,
        payload: JSON.stringify(payload),
      })
      if (!res.ok) {
        await admin.rpc('bump_push_subscription_failure', { p_sub_id: sub.id })
      } else {
        await admin
          .from('push_subscriptions')
          .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
          .eq('id', sub.id)
      }
      return { id: sub.id, ok: res.ok, status: res.status }
    })
  )

  return NextResponse.json({ sent: results.filter(r => r.ok).length, total: results.length, results })
}
