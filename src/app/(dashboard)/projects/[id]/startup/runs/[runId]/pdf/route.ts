import { getLocale, getTranslations } from 'next-intl/server'
import { getActiveMembership } from '@/lib/supabase/membership'
import { renderRunPdf } from '@/lib/pdf/startup-records'
import { loadRunPdf } from '@/lib/pdf/load'
import { pdfResponse } from '@/lib/pdf/response'

export const dynamic = 'force-dynamic'

/** PDF de una ejecución de procedimiento (S24b, E-22): respaldo en papel y registro ejecutado del dossier. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await params
  const ctx = await getActiveMembership()
  if (!ctx) return new Response('Unauthorized', { status: 401 })

  const [{ data: project }, { data: org }, locale, t] = await Promise.all([
    ctx.supabase.from('projects').select('id').eq('id', id).eq('org_id', ctx.orgId).maybeSingle(),
    ctx.supabase.from('organizations').select('name').eq('id', ctx.orgId).single(),
    getLocale(),
    getTranslations('Startup'),
  ])
  if (!project) return new Response('Not found', { status: 404 })
  const pdf = await loadRunPdf(ctx.supabase, { projectId: id, runId, orgName: org?.name ?? 'CommUp', lang: locale === 'en' ? 'en' : 'es', t: k => t(k as never) })
  if (!pdf) return new Response('Not found', { status: 404 })
  return pdfResponse(await renderRunPdf(pdf.input), pdf.filename, 'inline')
}
