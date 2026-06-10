import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/supabase.generated'

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

  const { data, error } = await supabase.rpc('upsert_push_subscription', {
    p_endpoint: body.endpoint,
    p_p256dh: body.p256dh,
    p_auth_secret: body.auth,
    p_topics: body.topics ?? ['itr_returned', 'punch_cat_a', 'cert_ready'],
    p_device_info: body.device_info ?? {},
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ id: data })
}
