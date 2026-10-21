import { createClient } from '@/lib/supabase/server'
import { renderPssrPdf } from '@/lib/pdf/pssr'
import { loadPssrPdf } from '@/lib/pdf/load'
import { pdfResponse } from '@/lib/pdf/response'

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

  const pdf = await loadPssrPdf(supabase, { projectId, reviewId })
  if (!pdf) return new Response('PSSR review not found', { status: 404 })
  return pdfResponse(await renderPssrPdf(pdf.input), pdf.filename, 'attachment')
}
