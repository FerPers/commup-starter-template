import { getLocale, getTranslations } from 'next-intl/server'
import { getActiveMembership } from '@/lib/supabase/membership'
import { renderLineupPdf } from '@/lib/pdf/startup-records'
import { loadLineupPdf } from '@/lib/pdf/load'
import { pdfResponse } from '@/lib/pdf/response'

export const dynamic = 'force-dynamic'

/** PDF de una hoja de line-up (S24b, E-22): respaldo en papel y registro ejecutado del dossier. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; sheetId: string }> }) {
  const { id, sheetId } = await params
  const ctx = await getActiveMembership()
  if (!ctx) return new Response('Unauthorized', { status: 401 })

  const [{ data: project }, { data: org }, locale, t] = await Promise.all([
    ctx.supabase.from('projects').select('id').eq('id', id).eq('org_id', ctx.orgId).maybeSingle(),
    ctx.supabase.from('organizations').select('name').eq('id', ctx.orgId).single(),
    getLocale(),
    getTranslations('Startup'),
  ])
  if (!project) return new Response('Not found', { status: 404 })
  const pdf = await loadLineupPdf(ctx.supabase, { projectId: id, sheetId, orgName: org?.name ?? 'CommUp', lang: locale === 'en' ? 'en' : 'es', t: k => t(k as never) })
  if (!pdf) return new Response('Not found', { status: 404 })
  return pdfResponse(await renderLineupPdf(pdf.input), pdf.filename, 'inline')
}
