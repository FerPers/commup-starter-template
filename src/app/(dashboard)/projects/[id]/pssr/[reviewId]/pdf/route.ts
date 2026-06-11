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

  // status es columna text en DB — casts estrechos a los unions del PDF
  const reviewData: PssrPdfData = {
    ...review,
    status: review.status as PssrPdfData['status'],
    projectName: project?.name ?? '',
    projectCode: project?.code ?? '',
    projectClient: project?.client ?? null,
    items: (items ?? []).map(i => ({ ...i, status: i.status as PssrPdfData['items'][number]['status'] })),
    signatures: signatures ?? [],
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
