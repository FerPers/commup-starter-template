import { fetchAllRows } from '@/lib/list/fetch-all'
import { getActiveMembership } from '@/lib/supabase/membership'
import {
  renderSystemCompletionPdf,
  type SystemCompletionData,
  type SystemGroup,
  type SubsystemStatus,
} from '@/lib/pdf/system-completion'

export const dynamic = 'force-dynamic'

type SystemRow    = { id: string; code: string; name: string }
type SubsystemRow = { id: string; code: string; name: string; system_id: string; current_phase_id: string | null }
type PhaseRow     = { id: string; code: string }
type ItrRow       = { subsystem_id: string; status: string }
type PunchRow     = { subsystem_id: string; category: 'A' | 'B' | 'C'; status: string }
type CertRow      = { subsystem_id: string | null; status: string }

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
    { data: systems },
    subsystems,
    { data: phases },
    itrs,
    punches,
    certs,
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('id, code, name, client')
      .eq('id', projectId)
      .eq('org_id', orgId)
      .single(),
    supabase
      .from('systems')
      .select('id, code, name')
      .eq('project_id', projectId)
      .order('code'),
    fetchAllRows(() => supabase
      .from('subsystems')
      .select('id, code, name, system_id, current_phase_id')
      .eq('project_id', projectId)
      .order('code')),
    supabase
      .from('project_phases')
      .select('id, code')
      .eq('org_id', orgId),
    fetchAllRows(() => supabase
      .from('itrs')
      .select('subsystem_id, status')
      .eq('project_id', projectId)),
    fetchAllRows(() => supabase
      .from('punches')
      .select('subsystem_id, category, status')
      .eq('project_id', projectId)),
    fetchAllRows(() => supabase
      .from('certificates')
      .select('subsystem_id, status')
      .eq('project_id', projectId)),
  ])

  if (projectErr || !project) {
    return new Response('Project not found', { status: 404 })
  }

  const systemList    = (systems ?? []) as SystemRow[]
  const subsystemList = (subsystems ?? []) as SubsystemRow[]
  const phaseList     = (phases ?? []) as PhaseRow[]
  const itrList       = (itrs ?? []) as ItrRow[]
  const punchList     = (punches ?? []) as PunchRow[]
  const certList      = (certs ?? []) as CertRow[]

  const phaseCode = new Map<string, string>()
  for (const p of phaseList) phaseCode.set(p.id, p.code)

  // ITR approved/total per subsystem
  const itrTotal = new Map<string, number>()
  const itrApproved = new Map<string, number>()
  for (const i of itrList) {
    itrTotal.set(i.subsystem_id, (itrTotal.get(i.subsystem_id) ?? 0) + 1)
    if (i.status === 'approved') {
      itrApproved.set(i.subsystem_id, (itrApproved.get(i.subsystem_id) ?? 0) + 1)
    }
  }

  // Open punches by category per subsystem ("open" = not closed/cancelled)
  const openA = new Map<string, number>()
  const openB = new Map<string, number>()
  const openC = new Map<string, number>()
  for (const p of punchList) {
    if (p.status === 'closed' || p.status === 'cancelled') continue
    const bucket = p.category === 'A' ? openA : p.category === 'B' ? openB : openC
    bucket.set(p.subsystem_id, (bucket.get(p.subsystem_id) ?? 0) + 1)
  }

  // Best certificate status per subsystem (issued > in_review > pending > rejected)
  const certRank: Record<string, number> = { issued: 4, in_review: 3, pending: 2, rejected: 1 }
  const bestCert = new Map<string, SubsystemStatus['certStatus']>()
  for (const c of certList) {
    if (!c.subsystem_id) continue
    const prev = bestCert.get(c.subsystem_id)
    const status = c.status as SubsystemStatus['certStatus']
    if (!prev || (certRank[status] ?? 0) > (certRank[prev] ?? 0)) {
      bestCert.set(c.subsystem_id, status)
    }
  }

  const subsBySystem = new Map<string, SubsystemStatus[]>()
  for (const s of subsystemList) {
    const status: SubsystemStatus = {
      code: s.code,
      name: s.name,
      phaseCode: s.current_phase_id ? (phaseCode.get(s.current_phase_id) ?? null) : null,
      itrTotal: itrTotal.get(s.id) ?? 0,
      itrApproved: itrApproved.get(s.id) ?? 0,
      punchOpenA: openA.get(s.id) ?? 0,
      punchOpenB: openB.get(s.id) ?? 0,
      punchOpenC: openC.get(s.id) ?? 0,
      certStatus: bestCert.get(s.id) ?? 'none',
    }
    const list = subsBySystem.get(s.system_id) ?? []
    list.push(status)
    subsBySystem.set(s.system_id, list)
  }

  const groups: SystemGroup[] = systemList.map(sys => ({
    code: sys.code,
    name: sys.name,
    subsystems: subsBySystem.get(sys.id) ?? [],
  }))

  const reportData: SystemCompletionData = {
    projectName: project.name,
    projectCode: project.code,
    projectClient: project.client ?? null,
    systems: groups,
  }

  const bytes = await renderSystemCompletionPdf(reportData)
  const safeCode = project.code.replace(/[^a-zA-Z0-9-]/g, '_')
  const today = new Date().toISOString().slice(0, 10)
  const filename = `${safeCode}-system-completion-${today}.pdf`

  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-cache',
    },
  })
}
