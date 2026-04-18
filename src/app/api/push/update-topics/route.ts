import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json() as { endpoint?: string; topics?: string[] }
  if (!body.endpoint || !Array.isArray(body.topics)) {
    return NextResponse.json({ error: 'endpoint and topics[] required' }, { status: 400 })
  }

  const { error } = await supabase.rpc('update_push_subscription_topics', {
    p_endpoint: body.endpoint,
    p_topics: body.topics,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
