import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import type { HandoverSnapshot } from '@/lib/pdf/daily-report'
import HandoverView from './HandoverView'

// Detalle de un relevo de turno (fase 5, sesión 3): estado en campo precargado, pendientes y notas
// de seguridad, firma de quien entrega y de quien recibe (otra persona).
export default async function HandoverPage({ params }: { params: Promise<{ id: string; handoverId: string }> }) {
  const { id, handoverId } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name, timezone').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()
  const { data: h } = await supabase.from('shift_handovers').select('*').eq('id', handoverId).eq('project_id', id).maybeSingle()
  if (!h) notFound()
  const { data: members } = await supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId)
  const names: Record<string, string> = {}
  for (const m of members ?? []) {
    const p = m.profiles as unknown as { full_name: string | null } | null
    if (p?.full_name) names[m.user_id] = p.full_name
  }
  const who = (u: string | null) => (u ? names[u] ?? '—' : null)

  return (
    <HandoverView
      project={project}
      handover={{
        id: h.id, number: h.number, date: h.shift_date, label: h.shift_label as 'day' | 'night' | 'other',
        status: h.status as 'draft' | 'handed_over' | 'accepted', snapshot: h.snapshot as unknown as HandoverSnapshot, snapshotAt: h.snapshot_at,
        pending: h.pending_items ?? '', safety: h.safety_notes ?? '',
        openedBy: who(h.opened_by), handedBy: who(h.handed_by), handedAt: h.handed_at,
        receivedBy: who(h.received_by), receivedAt: h.received_at, receiverComment: h.receiver_comment, hash: h.content_hash,
      }}
      isOpener={h.opened_by === ctx.userId}
      canReceive={h.status === 'handed_over' && h.handed_by !== ctx.userId && ctx.role !== 'client'}
    />
  )
}
