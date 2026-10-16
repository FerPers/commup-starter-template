import { getLocale } from 'next-intl/server'
import { getActiveMembership } from '@/lib/supabase/membership'
import { renderHandoverPdf, type HandoverSnapshot } from '@/lib/pdf/daily-report'

export const dynamic = 'force-dynamic'

/** PDF del relevo de turno, regenerado desde el snapshot congelado (fase 5, §11.22). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; handoverId: string }> }) {
  const { id, handoverId } = await params
  const ctx = await getActiveMembership()
  if (!ctx) return new Response('Unauthorized', { status: 401 })

  const [{ data: project }, { data: org }, locale] = await Promise.all([
    ctx.supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).maybeSingle(),
    ctx.supabase.from('organizations').select('name').eq('id', ctx.orgId).single(),
    getLocale(),
  ])
  if (!project) return new Response('Not found', { status: 404 })
  const { data: h } = await ctx.supabase.from('shift_handovers').select('*').eq('id', handoverId).eq('project_id', id).maybeSingle()
  if (!h) return new Response('Not found', { status: 404 })
  const ids = [h.handed_by, h.received_by].filter((x): x is string => !!x)
  const { data: people } = ids.length ? await ctx.supabase.from('profiles').select('id, full_name').in('id', ids) : { data: [] }
  const name = (u: string | null) => (u ? people?.find(p => p.id === u)?.full_name ?? null : null)

  const bytes = await renderHandoverPdf({
    lang: locale === 'en' ? 'en' : 'es',
    orgName: org?.name ?? 'CommUp',
    projectCode: project.code,
    projectName: project.name,
    number: h.number,
    shiftDate: h.shift_date,
    shiftLabel: h.shift_label as 'day' | 'night' | 'other',
    status: h.status as 'draft' | 'handed_over' | 'accepted',
    snapshot: h.snapshot as unknown as HandoverSnapshot,
    pending: h.pending_items,
    safety: h.safety_notes,
    handedBy: name(h.handed_by),
    handedAt: h.handed_at,
    receivedBy: name(h.received_by),
    receivedAt: h.received_at,
    receiverComment: h.receiver_comment,
    hash: h.content_hash,
  })
  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${project.code}-${h.number}.pdf"`,
      'Cache-Control': 'private, no-cache',
    },
  })
}
