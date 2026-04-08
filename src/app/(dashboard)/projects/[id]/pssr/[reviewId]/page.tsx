import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import PssrReviewForm from './PssrReviewForm'

export default async function PssrReviewPage({
  params,
}: {
  params: Promise<{ id: string; reviewId: string }>
}) {
  const { id: projectId, reviewId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('org_members').select('org_id, role').eq('user_id', user.id).limit(1).maybeSingle()
  if (!membership) redirect('/setup')

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
      .select('*, systems(id, code, name)')
      .eq('id', reviewId)
      .eq('project_id', projectId)
      .single(),
    supabase
      .from('pssr_review_items')
      .select('*')
      .eq('review_id', reviewId)
      .order('item_order'),
    supabase
      .from('pssr_signatures')
      .select('*, profiles(full_name, id)')
      .eq('review_id', reviewId)
      .order('signed_at'),
    supabase.from('profiles').select('id, full_name').eq('id', user.id).single(),
  ])

  if (!project || !review) notFound()

  const totalItems = items?.length ?? 0

  return (
    <div style={{ padding: '32px' }}>
      <PssrReviewForm
        projectId={projectId}
        review={review as any}
        items={(items ?? []) as any[]}
        signatures={(signatures ?? []) as any[]}
        project={project}
        currentUserId={user.id}
        currentUserName={profile?.full_name ?? user.email ?? 'Usuario'}
        canApprove={canApprove}
        totalItems={totalItems}
      />
    </div>
  )
}