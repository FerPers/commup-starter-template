import { type NextRequest, NextResponse } from 'next/server'
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

  const result = (data ?? []).map(itr => {
    const tag = itr.tags
    const tpl = itr.itr_templates
    return {
      id: itr.id,
      itr_number: itr.itr_number,
      tag_number: tag?.tag_number ?? '',
      title: tpl?.title ?? '',
    }
  })

  return NextResponse.json(result)
}
