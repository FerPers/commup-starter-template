import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('project_id')
  if (!projectId) return NextResponse.json([], { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json([], { status: 401 })

  const { data } = await supabase
    .from('itrs')
    .select('id, itr_number, tags(tag_number), itr_templates(title)')
    .eq('project_id', projectId)
    .in('status', ['not_started', 'in_progress'])
    .order('itr_number')
    .limit(500)

  const result = (data ?? []).map(itr => ({
    id: itr.id,
    itr_number: itr.itr_number,
    tag_number: (itr.tags as any)?.tag_number ?? '',
    title: (itr.itr_templates as any)?.title ?? '',
  }))

  return NextResponse.json(result)
}
