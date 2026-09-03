import { fetchAllRows } from '@/lib/list/fetch-all'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'
import { getSubsystemKpis, getProjectSnapshots } from '@/app/actions/kpi-snapshots'
import { sanitizeRow } from '@/lib/excel/sanitize'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (!membership) return new Response('Unauthorized', { status: 401 })

  const [
    { data: project },
    { data: phases },
    itrs,
    subsystemKpis,
    snapshots,
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, code')
      .eq('id', projectId)
      .eq('org_id', membership.org_id)
      .single(),
    supabase
      .from('project_phases')
      .select('id, code, name, order_index')
      .eq('org_id', membership.org_id)
      .order('order_index'),
    fetchAllRows(() => supabase
      .from('itrs')
      .select('id, status, phase_id')
      .eq('project_id', projectId)),
    getSubsystemKpis(projectId),
    getProjectSnapshots(projectId),
  ])

  if (!project) return new Response('Not found', { status: 404 })

  const wb = XLSX.utils.book_new()

  // Sheet 1: KPI por Fase
  const phaseRows = (phases ?? []).map(phase => {
    const phaseItrs = (itrs ?? []).filter(i => i.phase_id === phase.id)
    const total = phaseItrs.length
    const approved = phaseItrs.filter(i => i.status === 'approved').length
    const pct = total > 0 ? Math.round((approved / total) * 100) : 0
    return {
      Fase: phase.code,
      Nombre: phase.name,
      'Total ITRs': total,
      Aprobados: approved,
      '% Completado': pct,
    }
  })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(phaseRows.map(sanitizeRow)), 'KPI por Fase')

  // Sheet 2: Completamiento por Subsistema
  const ssRows = subsystemKpis.map(ss => ({
    Sistema: ss.systemCode,
    Subsistema: ss.code,
    Nombre: ss.name,
    'Total ITRs': ss.totalItrs,
    Aprobados: ss.approvedItrs,
    '% Completado': ss.completionPct,
    'Punch A abiertos': ss.openCatA,
    'Punch B abiertos': ss.openCatB,
  }))
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(ssRows.length > 0 ? ssRows.map(sanitizeRow) : [{ Nota: 'Sin subsistemas registrados' }]),
    'Subsistemas'
  )

  // Sheet 3: Histórico S-curve
  const snapshotRows = snapshots.map(s => ({
    Fecha: s.snapshot_date,
    '% Completado': s.completion_pct,
    'Total ITRs': s.total_itrs,
    Aprobados: s.completed_itrs,
    'Punch A abiertos': s.open_punches_a,
    'Punch B abiertos': s.open_punches_b,
  }))
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(snapshotRows.length > 0 ? snapshotRows.map(sanitizeRow) : [{ Nota: 'Sin snapshots registrados' }]),
    'Histórico'
  )

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
  const date = new Date().toISOString().split('T')[0]

  return new Response(buf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="KPIs-${project.code}-${date}.xlsx"`,
    },
  })
}
