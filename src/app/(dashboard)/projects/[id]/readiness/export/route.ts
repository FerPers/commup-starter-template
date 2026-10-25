import { getTranslations } from 'next-intl/server'
import { getActiveMembership } from '@/lib/supabase/membership'
import { buildDailyWorkbook } from '@/lib/excel/daily'
import { blockerCount, filterMatrix, nextGate, parseMatrixFilters, rowState } from '@/lib/readiness/matrix'
import { loadMatrix } from '@/lib/readiness/matrix-server'
import { actorText } from '@/lib/readiness/actors'
import { gateState } from '@/lib/states'

export const dynamic = 'force-dynamic'

// S23 (D-19): la matriz de Readiness en Excel, con los mismos filtros y orden que la pantalla (reunión diaria).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getActiveMembership()
  if (!ctx) return new Response('Unauthorized', { status: 401 })
  const { supabase, orgId } = ctx
  const { id } = await params
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries())

  const { data: project } = await supabase.from('projects').select('id, code').eq('id', id).eq('org_id', orgId).maybeSingle()
  if (!project) return new Response('Project not found', { status: 404 })

  const [t, tg, ts] = await Promise.all([getTranslations('ControlTower'), getTranslations('Gates'), getTranslations('States')])
  const data = await loadMatrix(supabase, project.id, orgId)
  const rows = filterMatrix(data.rows, parseMatrixFilters(sp), {
    commitment: (s, g) => data.commitments.get(`${s}:${g}`) ?? null,
    changedIds: data.changedIds,
    today: data.today,
  })
  const gateCodes = data.rows[0]?.gates.map(g => g.code) ?? []

  const bytes = buildDailyWorkbook([{
    name: t('title'),
    headers: [t('col.area'), t('col.system'), t('col.physical'), t('col.punchA'), t('col.punchB'), ...gateCodes,
      t('col.next'), t('col.nextState'), t('col.blocker'), t('col.actor'), t('col.commitment'), t('col.conditions')],
    rows: rows.map(r => {
      const next = nextGate(r.gates)
      const p = data.punches.get(r.system_id) ?? { a: 0, b: 0 }
      const blocker = next?.blocker
      const by = next ? data.blocks.get(`${r.system_id}:${next.gate_id}`) : undefined
      const n = blockerCount(blocker)
      return [
        r.area_code, `${r.system_code} — ${r.system_name}`, Number(((data.weighted.get(r.system_id)?.pct ?? 0) * 100).toFixed(1)), p.a, p.b,
        // A47: la celda dice la causa del «no listo» (sin información · en ejecución · bloqueado), como la pantalla.
        ...gateCodes.map(code => {
          const g = r.gates.find(x => x.code === code)
          const st = gateState({ status: g?.status ?? 'not_ready', workState: g?.work_state })
          return ts(`${st.family}.${st.key}`)
        }),
        next?.code ?? '', t(`rowState.${rowState(r.gates)}`),
        by ? t('blockedBy', { systems: by.join(', ') }) : blocker ? `${blocker.label ?? tg(`kind.${blocker.kind}`)}${n ? ` (${n})` : ''}` : '',
        (() => {
          const a = data.actors.get(r.system_id)
          return a ? actorText(a, {
            action: (k, v) => t(`actors.${k}`, v),
            capacity: c => tg(`capacity.${c as 'hse'}`),
            criterion: k => tg(`kind.${k as 'previous_gate'}`),
            more: (names, count) => t('actors.more', { names, count }),
            nobody: t('actors.nobody'),
          }) : ''
        })(),
        next ? data.commitments.get(`${r.system_id}:${next.gate_id}`) ?? '' : '',
        r.gates.reduce((sum, g) => sum + (g.approval?.id ? (data.openConditions.get(g.approval.id) ?? 0) : 0), 0),
      ]
    }),
  }])

  return new Response(bytes as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="readiness-${project.code}-${data.today}.xlsx"`,
    },
  })
}
