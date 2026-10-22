import { getTranslations } from 'next-intl/server'
import { getActiveMembership } from '@/lib/supabase/membership'
import { buildDailyWorkbook } from '@/lib/excel/daily'
import { parseSkylineParams, type SkylineBox, type SkylineSystem } from '@/lib/readiness/skyline'
import { loadSkyline } from '@/lib/readiness/skyline-server'

export const dynamic = 'force-dynamic'

// E1: el skyline en Excel con la misma liberación y rango de la pantalla (sistemas en la vista, fuera del rango y
// sin fecha), una fila por sistema.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getActiveMembership()
  if (!ctx) return new Response('Unauthorized', { status: 401 })
  const { supabase, orgId } = ctx
  const { id } = await params
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries())

  const { data: project } = await supabase.from('projects').select('id, code').eq('id', id).eq('org_id', orgId).maybeSingle()
  if (!project) return new Response('Project not found', { status: 404 })

  const [{ gate, sky, today }, t] = await Promise.all([loadSkyline(supabase, project.id, parseSkylineParams(sp)), getTranslations('Planning')])

  const where = (b: SkylineBox, i: number | null) =>
    i !== null ? sky.columns[i].start : b.date < sky.columns[0].start ? t('skyline.xlsBefore') : t('skyline.xlsAfter')
  const boxRow = (b: SkylineBox, i: number | null) => [
    b.areaCode, b.systemCode, b.systemName, gate?.code ?? '', b.date,
    t(b.basis === 'commitment' ? 'skyline.commitment' : 'skyline.forecast'), where(b, i),
    Math.round(b.pct * 1000) / 10, b.itrTotal,
    b.tone === 'approved' ? t('skyline.approved') : b.tone === 'mid' ? t('skyline.legendMid') : t('skyline.legendLow'),
    b.overdue ? t('skyline.overdue') : '',
  ]
  const undatedRow = (s: SkylineSystem) => [
    s.areaCode, s.systemCode, s.systemName, gate?.code ?? '', '', '', t('skyline.xlsUndated'), Math.round(s.pct * 1000) / 10, s.itrTotal, '', '',
  ]

  const bytes = buildDailyWorkbook([{
    name: t('tab.skyline'),
    headers: [t('skyline.col.area'), t('skyline.col.system'), t('skyline.col.name'), t('skyline.gate'), t('skyline.col.date'),
      t('skyline.col.basis'), t('skyline.col.period'), t('skyline.col.pct'), t('skyline.col.itrs'), t('skyline.col.tone'), t('skyline.overdue')],
    rows: [
      ...sky.before.map(b => boxRow(b, null)),
      ...sky.stacks.flatMap((st, i) => st.map(b => boxRow(b, i))),
      ...sky.after.map(b => boxRow(b, null)),
      ...sky.undated.map(undatedRow),
    ],
  }])

  return new Response(bytes as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="skyline-${project.code}-${gate?.code ?? 'gate'}-${today}.xlsx"`,
    },
  })
}
