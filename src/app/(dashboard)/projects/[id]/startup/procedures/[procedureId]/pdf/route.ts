import { getLocale, getTranslations } from 'next-intl/server'
import { getActiveMembership } from '@/lib/supabase/membership'
import { renderProcedurePdf } from '@/lib/pdf/procedure'
import { loadProcedurePdf } from '@/lib/pdf/load'
import { pdfResponse } from '@/lib/pdf/response'

export const dynamic = 'force-dynamic'

/** PDF de una revisión del procedimiento (?rev=<id>; por defecto la vigente). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; procedureId: string }> }) {
  const { id, procedureId } = await params
  const revId = new URL(req.url).searchParams.get('rev')
  const ctx = await getActiveMembership()
  if (!ctx) return new Response('Unauthorized', { status: 401 })

  const [{ data: project }, { data: org }, locale, t] = await Promise.all([
    ctx.supabase.from('projects').select('id').eq('id', id).eq('org_id', ctx.orgId).maybeSingle(),
    ctx.supabase.from('organizations').select('name').eq('id', ctx.orgId).single(),
    getLocale(),
    getTranslations('Startup'),
  ])
  if (!project) return new Response('Not found', { status: 404 })
  const pdf = await loadProcedurePdf(ctx.supabase, { projectId: id, procedureId, revId, orgName: org?.name ?? 'CommUp', lang: locale === 'en' ? 'en' : 'es', t })
  if (!pdf) return new Response('Not found', { status: 404 })
  return pdfResponse(await renderProcedurePdf(pdf.input), pdf.filename, 'inline')
}
