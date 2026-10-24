import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import PssrReviewForm from './PssrReviewForm'
import { loadMyCapacities } from '@/lib/capacities/server'
import { ROLE_TIERS } from '@/lib/constants/roles'
import { PSSR_CAPACITIES, type PssrCapacity } from '@/lib/constants/pssr'
import type { ItemStatus, ReviewStatus } from './pssr-review-shared'

export default async function PssrReviewPage({
  params }: {
  params: Promise<{ id: string; reviewId: string }>
}) {
  const { id: projectId, reviewId } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }


  const [
    { data: project },
    { data: review },
    { data: items },
    { data: signatures },
    { data: profile },
  ] = await Promise.all([
    supabase.from('projects').select('id, name, code').eq('id', projectId).single(),
    supabase
      .from('pssr_reviews')
      .select('id, review_number, title, status, notes, review_due_date, rfsu_certificate_id, approved_at, required_signatures, submitted_by, rejected_reason, systems(id, code, name)')
      .eq('id', reviewId)
      .eq('project_id', projectId)
      .single(),
    supabase
      .from('pssr_review_items')
      .select('id, item_order, category, element, requirement, notes_hint, status, responsible, actions, completion_date')
      .eq('review_id', reviewId)
      .order('item_order'),
    supabase
      .from('pssr_signatures')
      .select('id, user_id, discipline, capacity, signature_data, signed_at, profiles(full_name, id)')
      .eq('review_id', reviewId)
      .order('signed_at'),
    supabase.from('profiles').select('id, full_name').eq('id', ctx.userId).single(),
  ])

  if (!project || !review) notFound()

  // Fase 4: pendientes abiertos del sistema con su disposición para el arranque (16.37).
  const systemId = (review.systems as { id: string } | null)?.id
  const { data: systemPunches } = systemId
    ? await supabase
        .from('punches')
        .select('id, punch_number, category, description, status, resolved_at, startup_disposition, tags(id, tag_number), subsystems!inner(system_id)')
        .eq('project_id', projectId)
        .eq('subsystems.system_id', systemId)
        .in('status', ['open', 'in_progress'])
        .order('category')
        .order('punch_number')
        .limit(500)
    : { data: [] }

  const totalItems = items?.length ?? 0

  // Fase 5: acción del tracker por ítem (la viva primero; si no, la última).
  const itemIds = (items ?? []).map(i => i.id)
  const { data: linkedActions } = itemIds.length
    ? await supabase.from('actions').select('id, number, status, source_id, seq')
        .eq('project_id', projectId).eq('source_kind', 'pssr').in('source_id', itemIds).order('seq')
    : { data: [] }
  const itemActions: Record<string, { id: string; number: string; status: string }> = {}
  for (const a of linkedActions ?? []) {
    const cur = a.source_id ? itemActions[a.source_id] : undefined
    const live = ['open', 'in_progress', 'done'].includes(a.status)
    if (a.source_id && (!cur || live || !['open', 'in_progress', 'done'].includes(cur.status))) {
      itemActions[a.source_id] = { id: a.id, number: a.number, status: a.status }
    }
  }

  // S16 (C-32): quién firma cada capacidad y quién aprueba (Comisionamiento) sale de S14 (designados o respaldo).
  const caps = await loadMyCapacities(supabase, projectId)
  const canApprove = ROLE_TIERS.editor.includes(membership.role) && caps.commissioning.allowed
  const signableCaps = PSSR_CAPACITIES.filter(c => caps[c].allowed) as PssrCapacity[]

  return (
    <div style={{ padding: '32px' }}>
      <PssrReviewForm
        projectId={projectId}
        review={{ ...review, status: review.status as ReviewStatus, required_signatures: (review.required_signatures ?? []) as PssrCapacity[] }}
        items={(items ?? []).map(i => ({ ...i, status: i.status as ItemStatus }))}
        signatures={signatures ?? []}
        project={project}
        currentUserId={ctx.userId}
        currentUserName={profile?.full_name ?? ctx.userEmail ?? 'Usuario'}
        canApprove={canApprove}
        signableCaps={signableCaps}
        totalItems={totalItems}
        systemPunches={(systemPunches ?? [])}
        canEditPunches={ctx.role !== 'client'}
        itemActions={itemActions}
      />
    </div>
  )
}