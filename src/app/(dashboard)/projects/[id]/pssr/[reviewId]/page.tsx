import type { ComponentProps } from 'react'
import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import PssrReviewForm from './PssrReviewForm'

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

  const totalItems = items?.length ?? 0

  return (
    <div style={{ padding: '32px' }}>
      <PssrReviewForm
        projectId={projectId}
        review={review as unknown as ComponentProps<typeof PssrReviewForm>['review']}
        items={(items ?? []) as ComponentProps<typeof PssrReviewForm>['items']}
        signatures={(signatures ?? []) as unknown as ComponentProps<typeof PssrReviewForm>['signatures']}
        project={project}
        currentUserId={ctx.userId}
        currentUserName={profile?.full_name ?? ctx.userEmail ?? 'Usuario'}
        canApprove={canApprove}
        totalItems={totalItems}
      />
    </div>
  )
}