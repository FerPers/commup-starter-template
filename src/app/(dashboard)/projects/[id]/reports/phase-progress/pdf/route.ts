import { fetchAllRows } from '@/lib/list/fetch-all'
import { getActiveMembership } from '@/lib/supabase/membership'
import { renderPhaseProgressPdf, type PhaseProgressData, type PhaseProgressRow } from '@/lib/pdf/phase-progress'

export const dynamic = 'force-dynamic'

type ItrRow       = { id: string; status: string; phase_id: string | null }
type CertRow      = { id: string; status: string; phase_id: string }
type PunchRow     = { id: string; category: 'A' | 'B' | 'C'; status: string; subsystem_id: string }
type PhaseRow     = { id: string; code: string; name: string; color: string; order_index: number }
type SubsystemRow = { id: string; current_phase_id: string | null }

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params

  const ctx = await getActiveMembership()
  if (!ctx) return new Response('Unauthorized', { status: 401 })
  const { supabase, orgId } = ctx

  const [
    { data: project, error: projectErr },
    { data: phases },
    itrs,
    certs,
    punches,
    subsystems,
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('id, code, name, client')
      .eq('id', projectId)
      .eq('org_id', orgId)
      .single(),
    supabase
      .from('project_phases')
      .select('id, code, name, color, order_index')
      .eq('org_id', orgId)
      .order('order_index'),
    fetchAllRows(() => supabase
      .from('itrs')
      .select('id, status, phase_id')
      .eq('project_id', projectId)),
    fetchAllRows(() => supabase
      .from('certificates')
      .select('id, status, phase_id')
      .eq('project_id', projectId)),
    fetchAllRows(() => supabase
      .from('punches')
      .select('id, category, status, subsystem_id')
      .eq('project_id', projectId)),
    fetchAllRows(() => supabase
      .from('subsystems')
      .select('id, current_phase_id')
      .eq('project_id', projectId)),
  ])

  if (projectErr || !project) {
    return new Response('Project not found', { status: 404 })
  }

  const phaseList = (phases ?? []) as PhaseRow[]
  const itrList = (itrs ?? []) as ItrRow[]
  const certList = (certs ?? []) as CertRow[]
  const punchList = (punches ?? []) as PunchRow[]
  const subsystemList = (subsystems ?? []) as SubsystemRow[]

  const subsystemPhase = new Map<string, string | null>()
  for (const s of subsystemList) subsystemPhase.set(s.id, s.current_phase_id)

  // Count open Cat A punches by phase (via subsystem.current_phase_id).
  // "Open" = not closed and not cancelled.
  const openCatAByPhase = new Map<string, number>()
  let unassignedOpenCatA = 0
  for (const p of punchList) {
    if (p.category !== 'A') continue
    if (p.status === 'closed' || p.status === 'cancelled') continue
    const phaseId = subsystemPhase.get(p.subsystem_id) ?? null
    if (!phaseId) {
      unassignedOpenCatA += 1
      continue
    }
    openCatAByPhase.set(phaseId, (openCatAByPhase.get(phaseId) ?? 0) + 1)
  }

  const phaseRows: PhaseProgressRow[] = phaseList.map(phase => {
    const phaseItrs = itrList.filter(i => i.phase_id === phase.id)
    const inProgress = phaseItrs.filter(i => i.status === 'in_progress').length
    const completed  = phaseItrs.filter(i => i.status === 'completed').length
    const approved   = phaseItrs.filter(i => i.status === 'approved').length

    const phaseCerts = certList.filter(c => c.phase_id === phase.id)
    const issued = phaseCerts.filter(c => c.status === 'issued').length

    return {
      id: phase.id,
      code: phase.code,
      name: phase.name,
      colorHex: phase.color,
      itrs: {
        total: phaseItrs.length,
        in_progress: inProgress,
        completed,
        approved,
      },
      certs: { total: phaseCerts.length, issued },
      openCatA: openCatAByPhase.get(phase.id) ?? 0,
    }
  })

  const reportData: PhaseProgressData = {
    projectName: project.name,
    projectCode: project.code,
    projectClient: project.client ?? null,
    phases: phaseRows,
    unassignedOpenCatA,
  }

  const bytes = await renderPhaseProgressPdf(reportData)
  const safeCode = project.code.replace(/[^a-zA-Z0-9-]/g, '_')
  const today = new Date().toISOString().slice(0, 10)
  const filename = `${safeCode}-phase-progress-${today}.pdf`

  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-cache',
    },
  })
}
