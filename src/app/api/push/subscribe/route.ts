import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/supabase.generated'
import { isAllowedPushEndpoint } from '@/lib/push/endpoint'
import { getActiveMembership } from '@/lib/supabase/membership'
import { DEFAULT_TOPICS } from '@/lib/notifications/topics'

/**
 * POST /api/push/subscribe — registra/upsertea una PushSubscription para el usuario actual.
 * Body: { endpoint, p256dh, auth, topics[], device_info }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json() as {
    endpoint?: string
    p256dh?: string
    auth?: string
    topics?: string[]
    device_info?: { [key: string]: Json | undefined }
  }

  if (!body.endpoint || !body.p256dh || !body.auth) {
    return NextResponse.json({ error: 'endpoint, p256dh and auth are required' }, { status: 400 })
  }
  if (!isAllowedPushEndpoint(body.endpoint)) {
    return NextResponse.json({ error: 'endpoint is not a known push service' }, { status: 400 })
  }

  // S15 (A-22): la suscripción va a la org activa (antes, la primera membresía).
  const ctx = await getActiveMembership()
  const { data, error } = await supabase.rpc('upsert_push_subscription', {
    ...(ctx ? { p_org_id: ctx.orgId } : {}),
    p_endpoint: body.endpoint,
    p_p256dh: body.p256dh,
    p_auth_secret: body.auth,
    // S22 (I-28): temas que existen (categorías de aviso), no eventos que nunca se emitían.
    p_topics: body.topics ?? DEFAULT_TOPICS,
    p_device_info: body.device_info ?? {},
  })

  if (error) return NextResponse.json({ error: 'No se pudo registrar la suscripción' }, { status: 400 })
  return NextResponse.json({ id: data })
}
