import { getTranslations } from 'next-intl/server'
import { getActiveMembership } from '@/lib/supabase/membership'
import { REQ_STATES, parseReqParams } from '@/lib/itr/requirements'
import { REQ_EXPORT_DETAIL_LIMIT, buildRequirementsWorkbook, type RequirementsExport } from '@/lib/excel/requirements'
import { todayIn } from '@/lib/time/zone'

export const dynamic = 'force-dynamic'

// R2b: Excel del registro «Requisitos ITR» (reporte gerencial · resumen · detalle) para el nodo del árbol que se
// ve en pantalla (?area / ?system / ?subsystem). Los filtros de chips no aplican: el libro es el plan completo del
// nodo, como la matriz de certificación.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getActiveMembership()
  if (!ctx) return new Response('Unauthorized', { status: 401 })
  const { supabase, orgId } = ctx
  const { id } = await params
  const p = parseReqParams(Object.fromEntries(new URL(req.url).searchParams.entries()))

  const { data: project } = await supabase.from('projects').select('id, code, name, timezone').eq('id', id).eq('org_id', orgId).maybeSingle()
  if (!project) return new Response('Project not found', { status: 404 })

  const [res, node, t] = await Promise.all([
    supabase.rpc('tag_requirements_export', {
      p_project_id: project.id,
      ...(p.area ? { p_area_id: p.area } : {}), ...(p.system ? { p_system_id: p.system } : {}),
      ...(p.subsystem ? { p_subsystem_id: p.subsystem } : {}),
      p_limit: REQ_EXPORT_DETAIL_LIMIT,
    }),
    p.subsystem ? supabase.from('subsystems').select('code, name').eq('id', p.subsystem).eq('project_id', project.id).maybeSingle()
      : p.system ? supabase.from('systems').select('code, name').eq('id', p.system).eq('project_id', project.id).maybeSingle()
        : p.area ? supabase.from('areas').select('code, name').eq('id', p.area).eq('project_id', project.id).maybeSingle()
          : Promise.resolve({ data: null }),
    getTranslations('ItrRequirements'),
  ])
  if (res.error) return new Response(res.error.message, { status: 500 })
  const data = res.data as unknown as RequirementsExport
  const today = todayIn(project.timezone)
  const nodeCode = node.data?.code ?? null

  const states = new Set<string>(REQ_STATES)
  const bytes = buildRequirementsWorkbook(data, {
    project: `${project.code} — ${project.name}`,
    node: node.data ? `${node.data.code} · ${node.data.name}` : t('allProject'),
    date: today,
  }, {
    sheet: { report: t('xls.sheet.report'), summary: t('xls.sheet.summary'), detail: t('xls.sheet.detail') },
    title: t('title'),
    info: {
      project: t('xls.info.project'), node: t('xls.info.node'), date: t('xls.info.date'), tags: t('xls.info.tags'),
      noType: t('filter.notype'), noRule: t('filter.norule'), proposed: t('xls.info.proposed'), truncated: t('xls.info.truncated'),
    },
    col: {
      area: t('xls.col.area'), system: t('xls.col.system'), systemName: t('xls.col.systemName'), subsystem: t('xls.col.subsystem'),
      subsystemName: t('xls.col.subsystemName'), discipline: t('xls.col.discipline'), disciplineName: t('xls.col.disciplineName'),
      stage: t('xls.col.stage'), stageName: t('xls.col.stageName'), required: t('stat.required'), generated: t('stat.generated'),
      inProgress: t('state.in_progress'), approved: t('stat.approved'), pct: t('xls.col.pct'), missing: t('stat.missing'),
      pending: t('xls.col.pending'), excluded: t('stat.excluded'), outside: t('state.outside'),
      element: t('xls.col.element'), description: t('col.description'), type: t('col.type'), code: t('xls.col.code'),
      clientCode: t('xls.col.clientCode'), template: t('xls.col.template'), state: t('xls.col.state'), origin: t('xls.col.origin'),
      itr: t('xls.col.itr'), reason: t('xls.col.reason'),
    },
    total: t('xls.total'),
    state: s => (states.has(s) ? t(`state.${s as 'missing'}`) : s === 'no_type' ? t('filter.notype') : s === 'no_rule' ? t('filter.norule') : s),
    origin: o => (o === 'matrix' || o === 'manual' || o === 'ai' ? t(`origin.${o}`) : o),
  })

  const name = ['requisitos-itr', project.code, nodeCode, today].filter(Boolean).join('-').replace(/[^a-zA-Z0-9._-]/g, '_')
  return new Response(bytes as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}.xlsx"`,
    },
  })
}
