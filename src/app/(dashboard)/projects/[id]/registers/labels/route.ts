import { getTranslations } from 'next-intl/server'
import { getActiveMembership } from '@/lib/supabase/membership'
import { renderRegisterLabelsPdf, type RegisterLabel } from '@/lib/pdf/register-labels'
import { OPEN_STATUSES, REGISTER_KINDS, type RegisterKind } from '@/lib/registers/catalog'
import { registerQrUrl } from '@/lib/registers/qr'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_LABELS = 400

/**
 * Etiquetas QR de registros controlados (§8.9). `?ids=a,b` = esas etiquetas; si no,
 * `?kind=<tipo>&status=open|all` = la lista (abiertos por defecto). Se abre en el navegador.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const ctx = await getActiveMembership()
  if (!ctx) return new Response('Unauthorized', { status: 401 })
  const { supabase, orgId } = ctx

  const { data: project } = await supabase.from('projects').select('id, code').eq('id', projectId).eq('org_id', orgId).single()
  if (!project) return new Response('Project not found', { status: 404 })

  const url = new URL(req.url)
  const ids = (url.searchParams.get('ids') ?? '').split(',').map(s => s.trim()).filter(s => UUID.test(s)).slice(0, MAX_LABELS)
  const kind = url.searchParams.get('kind') as RegisterKind | null
  const all = url.searchParams.get('status') === 'all'

  let query = supabase
    .from('register_items')
    .select('id, number, kind, title, systems(code)')
    .eq('project_id', projectId)
    .order('number')
    .limit(MAX_LABELS)
  if (ids.length) query = query.in('id', ids)
  else {
    if (kind && REGISTER_KINDS.includes(kind)) query = query.eq('kind', kind)
    if (!all) query = query.in('status', OPEN_STATUSES)
  }
  const { data: items, error } = await query
  if (error) return new Response('Error', { status: 500 })

  const t = await getTranslations('Registers')

  const labels: RegisterLabel[] = (items ?? []).map(r => ({
    number: r.number,
    kindLabel: t(`kind.${r.kind as RegisterKind}`),
    title: r.title,
    project: project.code,
    system: (r.systems as { code: string } | null)?.code ?? null,
    url: registerQrUrl(url.origin, r.id),
  }))

  const bytes = await renderRegisterLabelsPdf(labels, {
    scan: t('labels.scan'),
    system: t('labels.system'),
    printed: t('labels.printed', { date: new Date().toISOString().slice(0, 10) }),
  })
  const safeCode = project.code.replace(/[^a-zA-Z0-9-]/g, '_')
  const filename = labels.length === 1 ? `${safeCode}-${labels[0].number}.pdf` : `${safeCode}-etiquetas-registros.pdf`
  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-cache',
    },
  })
}
