import { createClient } from '@/lib/supabase/server'
import { renderCertificatePdf } from '@/lib/pdf/certificate'
import { loadCertificatePdf } from '@/lib/pdf/load'
import { pdfResponse } from '@/lib/pdf/response'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; certId: string }> }
) {
  const { id: projectId, certId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const pdf = await loadCertificatePdf(supabase, { projectId, certId })
  if (!pdf) return new Response('Certificate not found', { status: 404 })
  return pdfResponse(await renderCertificatePdf(pdf.input), pdf.filename, 'attachment')
}
