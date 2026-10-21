import { getLocale, getTranslations } from 'next-intl/server'
import { getActiveMembership } from '@/lib/supabase/membership'
import { renderPerformancePdf } from '@/lib/pdf/performance-report'
import { loadPerformancePdf } from '@/lib/pdf/load'
import { pdfResponse } from '@/lib/pdf/response'

export const dynamic = 'force-dynamic'

/** Reporte de 14 secciones de un intento cerrado o evaluado (fase 7, sesión 2b). */
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
  const pdf = await loadPerformancePdf(ctx.supabase, { projectId: id, runId, orgName: org?.name ?? 'CommUp', lang: locale === 'en' ? 'en' : 'es', t })
  if (!pdf) return new Response('Not found', { status: 404 })
  if ('error' in pdf) return new Response(pdf.error, { status: 400 })
  return pdfResponse(await renderPerformancePdf(pdf.input), pdf.filename, 'inline')
}
