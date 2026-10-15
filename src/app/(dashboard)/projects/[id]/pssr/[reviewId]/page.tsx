import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import PssrReviewForm from './PssrReviewForm'
import type { ItemStatus, ReviewStatus } from './pssr-review-shared'
import type { SystemPunch } from './PssrPunchDisposition'

export default async function PssrReviewPage({
  params,
}: {
  params: Promise<{ id: string; reviewId: string }>
}) {
  const { id: projectId, reviewId } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const canApprove = ['owner','admin','architect','leader'].includes(membership.role)

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
      .select('id, review_number, title, status, notes, review_due_date, rfsu_certificate_id, approved_at, systems(id, code, name)')
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
      .select('id, user_id, discipline, signature_data, signed_at, profiles(full_name, id)')
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

  return (
    <div style={{ padding: '32px' }}>
      <PssrReviewForm
        projectId={projectId}
        review={{ ...review, status: review.status as ReviewStatus }}
        items={(items ?? []).map(i => ({ ...i, status: i.status as ItemStatus }))}
        signatures={signatures ?? []}
        project={project}
        currentUserId={ctx.userId}
        currentUserName={profile?.full_name ?? ctx.userEmail ?? 'Usuario'}
        canApprove={canApprove}
        totalItems={totalItems}
        systemPunches={(systemPunches ?? []) as unknown as SystemPunch[]}
        canEditPunches={ctx.role !== 'client'}
      />
    </div>
  )
}