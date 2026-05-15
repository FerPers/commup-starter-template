import { getActiveMembership } from '@/lib/supabase/membership'
import {
  renderAreaKpisPdf,
  type AreaKpisData,
  type AreaKpisRow,
  type AreaSystemTopEntry,
} from '@/lib/pdf/area-kpis'

export const dynamic = 'force-dynamic'

type AreaRow      = { id: string; code: string; name: string }
type SystemRow    = { id: string; code: string; name: string; area_id: string }
type SubsystemRow = { id: string; system_id: string }
type TagRow       = { id: string; subsystem_id: string }
type ItrRow       = { id: string; status: string; subsystem_id: string }
type PunchRow     = { id: string; category: 'A' | 'B' | 'C'; status: string; subsystem_id: string }
type CertRow      = { id: string; status: string; system_id: string | null; subsystem_id: string | null }

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
    { data: areas },
    { data: systems },
    { data: subsystems },
    { data: tags },
    { data: itrs },
    { data: punches },
    { data: certs },
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('id, code, name, client')
      .eq('id', projectId)
      .eq('org_id', orgId)
      .single(),
    supabase
      .from('areas')
      .select('id, code, name')
      .eq('project_id', projectId)
      .order('code'),
    supabase
      .from('systems')
      .select('id, code, name, area_id')
      .eq('project_id', projectId),
    supabase
      .from('subsystems')
      .select('id, system_id')
      .eq('project_id', projectId),
    supabase
      .from('tags')
      .select('id, subsystem_id')
      .eq('project_id', projectId),
    supabase
      .from('itrs')
      .select('id, status, subsystem_id')
      .eq('project_id', projectId),
    supabase
      .from('punches')
      .select('id, category, status, subsystem_id')
      .eq('project_id', projectId),
    supabase
      .from('certificates')
      .select('id, status, system_id, subsystem_id')
      .eq('project_id', projectId),
  ])

  if (projectErr || !project) {
    return new Response('Project not found', { status: 404 })
  }

  const areaList      = (areas      ?? []) as AreaRow[]
  const systemList    = (systems    ?? []) as SystemRow[]
  const subsystemList = (subsystems ?? []) as SubsystemRow[]
  const tagList       = (tags       ?? []) as TagRow[]
  const itrList       = (itrs       ?? []) as ItrRow[]
  const punchList     = (punches    ?? []) as PunchRow[]
  const certList      = (certs      ?? []) as CertRow[]

  // subsystem_id → system_id (NOT NULL via schema, but be defensive)
  const subToSystem = new Map<string, string>()
  for (const s of subsystemList) subToSystem.set(s.id, s.system_id)

  // system_id → area_id
  const sysToArea = new Map<string, string>()
  for (const s of systemList) sysToArea.set(s.id, s.area_id)

  // subsystem_id → area_id (derived)
  const subToArea = new Map<string, string>()
  for (const [subId, sysId] of subToSystem.entries()) {
    const areaId = sysToArea.get(sysId)
    if (areaId) subToArea.set(subId, areaId)
  }

  // Counters: per area
  type Counters = {
    tagCount: number
    itrTotal: number
    itrCompleted: number
    itrApproved: number
    certsTotal: number
    certsIssued: number
    openA: number
    openB: number
    openC: number
  }
  const emptyCounters = (): Counters => ({
    tagCount: 0, itrTotal: 0, itrCompleted: 0, itrApproved: 0,
    certsTotal: 0, certsIssued: 0, openA: 0, openB: 0, openC: 0,
  })
  const byArea = new Map<string, Counters>()
  for (const a of areaList) byArea.set(a.id, emptyCounters())

  // Tags
  for (const t of tagList) {
    const areaId = subToArea.get(t.subsystem_id)
    if (!areaId) continue
    const c = byArea.get(areaId); if (!c) continue
    c.tagCount += 1
  }

  // ITRs
  for (const it of itrList) {
    const areaId = subToArea.get(it.subsystem_id)
    if (!areaId) continue
    const c = byArea.get(areaId); if (!c) continue
    c.itrTotal += 1
    if (it.status === 'completed') c.itrCompleted += 1
    if (it.status === 'approved')  c.itrApproved += 1
  }

  // Punches (open = not closed/cancelled), per category
  // Also build per-system open count for drill-down (open across A+B+C).
  const sysOpen = new Map<string, number>()
  for (const p of punchList) {
    if (p.status === 'closed' || p.status === 'cancelled') continue
    const areaId = subToArea.get(p.subsystem_id)
    if (!areaId) continue
    const c = byArea.get(areaId); if (!c) continue
    if (p.category === 'A') c.openA += 1
    else if (p.category === 'B') c.openB += 1
    else if (p.category === 'C') c.openC += 1
    const sysId = subToSystem.get(p.subsystem_id)
    if (sysId) sysOpen.set(sysId, (sysOpen.get(sysId) ?? 0) + 1)
  }

  // Certificates — resolve area via subsystem (preferred) or system
  for (const cert of certList) {
    let areaId: string | undefined
    if (cert.subsystem_id) areaId = subToArea.get(cert.subsystem_id)
    if (!areaId && cert.system_id) areaId = sysToArea.get(cert.system_id) ?? undefined
    if (!areaId) continue
    const c = byArea.get(areaId); if (!c) continue
    c.certsTotal += 1
    if (cert.status === 'issued') c.certsIssued += 1
  }

  // Build top-3 systems per area
  const systemsByArea = new Map<string, SystemRow[]>()
  for (const s of systemList) {
    const arr = systemsByArea.get(s.area_id) ?? []
    arr.push(s)
    systemsByArea.set(s.area_id, arr)
  }

  const areaRows: AreaKpisRow[] = areaList.map(area => {
    const c = byArea.get(area.id) ?? emptyCounters()
    const areaSystems = systemsByArea.get(area.id) ?? []
    const topSystems: AreaSystemTopEntry[] = areaSystems
      .map(s => ({ code: s.code, name: s.name, openPunches: sysOpen.get(s.id) ?? 0 }))
      .filter(s => s.openPunches > 0)
      .sort((a, b) => b.openPunches - a.openPunches)
      .slice(0, 3)

    return {
      id: area.id,
      code: area.code,
      name: area.name,
      tagCount: c.tagCount,
      itrs: { total: c.itrTotal, completed: c.itrCompleted, approved: c.itrApproved },
      punches: { openA: c.openA, openB: c.openB, openC: c.openC },
      certs: { total: c.certsTotal, issued: c.certsIssued },
      topSystems,
    }
  })

  const reportData: AreaKpisData = {
    projectName: project.name,
    projectCode: project.code,
    projectClient: project.client ?? null,
    areas: areaRows,
  }

  const bytes = await renderAreaKpisPdf(reportData)
  const safeCode = project.code.replace(/[^a-zA-Z0-9-]/g, '_')
  const today = new Date().toISOString().slice(0, 10)
  const filename = `${safeCode}-area-kpis-${today}.pdf`

  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-cache',
    },
  })
}
