import { createClient } from '@/lib/supabase/server'
import { renderItrPdf } from '@/lib/pdf/itr'
import { loadItrPdf } from '@/lib/pdf/load'
import { pdfResponse } from '@/lib/pdf/response'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; tagId: string; itrId: string }> }
) {
  const { id: projectId, tagId, itrId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const pdf = await loadItrPdf(supabase, { projectId, itrId, tagId })
  if (!pdf) return new Response('ITR not found', { status: 404 })
  return pdfResponse(await renderItrPdf(pdf.input), pdf.filename, 'attachment')
}
