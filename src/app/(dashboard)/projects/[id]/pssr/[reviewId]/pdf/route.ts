import { createClient } from '@/lib/supabase/server'
import { renderPssrPdf, type PssrPdfData } from '@/lib/pdf/pssr'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; reviewId: string }> }
) {
  const { id: projectId, reviewId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const [
    { data: review, error: reviewErr },
    { data: project },
    { data: items },
    { data: signatures },
  ] = await Promise.all([
    supabase
      .from('pssr_reviews')
      .select(`
        id, review_number, title, status, notes,
        review_due_date, approved_at, rfsu_certificate_id,
        systems(code, name)
      `)
      .eq('id', reviewId)
      .eq('project_id', projectId)
      .single(),
    supabase
      .from('projects')
      .select('code, name, client')
      .eq('id', projectId)
      .single(),
    supabase
      .from('pssr_review_items')
      .select('id, item_order, category, element, requirement, notes_hint, status, responsible, actions, completion_date')
      .eq('review_id', reviewId)
      .order('item_order'),
    supabase
      .from('pssr_signatures')
      .select(`
        id, discipline, signature_data, signed_at,
        profiles(full_name)
      `)
      .eq('review_id', reviewId)
      .order('signed_at'),
  ])

  if (reviewErr || !review) {
    return new Response('PSSR review not found', { status: 404 })
  }

  const reviewData: PssrPdfData = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase typed join shape doesn't match PssrPdfData 1:1; field set verified above
    ...(review as any),
    projectName: project?.name ?? '',
    projectCode: project?.code ?? '',
    projectClient: project?.client ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase select shape passes through; PssrPdfData defines the validated subset
    items: (items ?? []) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase join (profiles) returns possibly-array shape; pssr.ts handles both
    signatures: (signatures ?? []) as any,
  }

  const bytes = await renderPssrPdf(reviewData)
  const filename = `PSSR-${review.review_number.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`

  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-cache',
    },
  })
}
