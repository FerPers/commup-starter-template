import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import HandoversListView from './HandoversListView'

// Relevos de turno del proyecto (fase 5 plan readiness, sesión 3).
export default async function HandoversPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()

  const [{ data: rows }, { data: members }] = await Promise.all([
    supabase.from('shift_handovers')
      .select('id, number, shift_date, shift_label, status, opened_by, handed_by, handed_at, received_by, received_at')
      .eq('project_id', id).order('seq', { ascending: false }).limit(400),
    supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId),
  ])
  const names: Record<string, string> = {}
  for (const m of members ?? []) {
    const p = m.profiles as unknown as { full_name: string | null } | null
    if (p?.full_name) names[m.user_id] = p.full_name
  }
  const who = (u: string | null) => (u ? names[u] ?? '—' : null)

  return (
    <HandoversListView
      project={project}
      rows={(rows ?? []).map(h => ({
        id: h.id, number: h.number, date: h.shift_date, label: h.shift_label as 'day' | 'night' | 'other',
        status: h.status as 'draft' | 'handed_over' | 'accepted',
        openedBy: who(h.opened_by), handedBy: who(h.handed_by), handedAt: h.handed_at, receivedBy: who(h.received_by), receivedAt: h.received_at,
        mineToReceive: h.status === 'handed_over' && h.handed_by !== ctx.userId && ctx.role !== 'client',
      }))}
      canOpen={ctx.role !== 'client'}
    />
  )
}
