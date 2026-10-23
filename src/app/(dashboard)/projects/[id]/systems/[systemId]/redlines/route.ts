import { createClient } from '@/lib/supabase/server'
import { renderRedlinesPdf } from '@/lib/pdf/redlines'
import { loadRedlinesPdf } from '@/lib/pdf/load'
import { pdfResponse } from '@/lib/pdf/response'

export const dynamic = 'force-dynamic'

// F-21c: PDF de red-lines del sistema (pestaña «Planos»). El mismo cargador arma el anexo del paquete de handover.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; systemId: string }> }
) {
  const { id: projectId, systemId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const pdf = await loadRedlinesPdf(supabase, { projectId, systemId })
  if (!pdf) return new Response('System not found', { status: 404 })
  return pdfResponse(await renderRedlinesPdf(pdf.input), pdf.filename, 'attachment')
}
