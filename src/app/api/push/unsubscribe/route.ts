import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { endpoint } = await req.json() as { endpoint?: string }
  if (!endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 })

  const { error } = await supabase.rpc('delete_push_subscription', { p_endpoint: endpoint })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
