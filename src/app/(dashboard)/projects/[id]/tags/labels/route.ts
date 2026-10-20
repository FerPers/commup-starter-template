import { getTranslations } from 'next-intl/server'
import { getActiveMembership } from '@/lib/supabase/membership'
import { renderRegisterLabelsPdf, type RegisterLabel } from '@/lib/pdf/register-labels'
import { tagQrUrl } from '@/lib/tags/qr'
import { todayIn } from '@/lib/time/zone'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_LABELS = 400

/**
 * S13 (C-31/F-18): etiquetas QR de tags. `?ids=a,b` = esos tags; `?subsystem=<id>` = los del subsistema.
 * El QR lleva `/tag_360/<uuid>` (el número se repite entre proyectos). Misma hoja A4 2 × 4 que los registros.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const ctx = await getActiveMembership()
  if (!ctx) return new Response('Unauthorized', { status: 401 })
  const { supabase, orgId } = ctx

  const { data: project } = await supabase.from('projects').select('id, code, timezone').eq('id', projectId).eq('org_id', orgId).single()
  if (!project) return new Response('Project not found', { status: 404 })

  const url = new URL(req.url)
  const ids = (url.searchParams.get('ids') ?? '').split(',').map(s => s.trim()).filter(s => UUID.test(s)).slice(0, MAX_LABELS)
  const subsystem = url.searchParams.get('subsystem') ?? ''
  if (!ids.length && !UUID.test(subsystem)) return new Response('Indica ids o subsystem', { status: 400 })

  let query = supabase
    .from('tags')
    .select('id, tag_number, description, subsystems(code, systems(code))')
    .eq('project_id', projectId)
    .order('tag_number')
    .limit(MAX_LABELS)
  query = ids.length ? query.in('id', ids) : query.eq('subsystem_id', subsystem)
  const { data: tags, error } = await query
  if (error) return new Response('Error', { status: 500 })

  const t = await getTranslations('Tags')
  const labels: RegisterLabel[] = (tags ?? []).map(tag => {
    const ss = tag.subsystems as unknown as { code: string; systems: { code: string } | null } | null
    return {
      number: tag.tag_number,
      kindLabel: t('labels.kind'),
      title: tag.description ?? '',
      project: project.code,
      system: ss ? [ss.systems?.code, ss.code].filter(Boolean).join(' / ') : null,
      url: tagQrUrl(url.origin, tag.id),
    }
  })

  const bytes = await renderRegisterLabelsPdf(labels, {
    scan: t('labels.scan'),
    system: t('labels.system'),
    printed: t('labels.printed', { date: todayIn(project.timezone) }),
  })
  const safeCode = project.code.replace(/[^a-zA-Z0-9-]/g, '_')
  const filename = labels.length === 1 ? `${safeCode}-${labels[0].number.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf` : `${safeCode}-etiquetas-tags.pdf`
  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-cache',
    },
  })
}
