import { getActiveMembership } from '@/lib/supabase/membership'
import { buildPunchListWorkbook, type PunchExportRow } from '@/lib/excel/punch-list'

export const dynamic = 'force-dynamic'

type RawPunch = {
  punch_number: string
  category: 'A' | 'B' | 'C'
  status: string
  priority: string
  description: string
  target_date: string | null
  closed_date: string | null
  created_at: string
  raised_by_profile: { full_name: string } | { full_name: string }[] | null
  assigned_to_profile: { full_name: string } | { full_name: string }[] | null
  projects: { code: string } | { code: string }[] | null
  tags: { tag_number: string; disciplines: { code: string } | { code: string }[] | null } | null
  subsystems: {
    code: string
    name: string
    systems: {
      code: string
      name: string
      areas: { code: string; name: string } | { code: string; name: string }[] | null
    } | null
  } | null
}

function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export async function GET() {
  const ctx = await getActiveMembership()
  if (!ctx) return new Response('Unauthorized', { status: 401 })
  const { supabase, orgId } = ctx

  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .eq('org_id', orgId)

  const projectIds = (projects ?? []).map(p => p.id)
  if (projectIds.length === 0) {
    const bytes = buildPunchListWorkbook([], { includeProjectCol: true })
    return excelResponse(bytes, `org-punch-list-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const { data: punches } = await supabase
    .from('punches')
    .select(`
      punch_number, category, status, priority, description,
      target_date, closed_date, created_at,
      raised_by_profile:profiles!raised_by(full_name),
      assigned_to_profile:profiles!assigned_to(full_name),
      projects(code),
      tags(tag_number, disciplines(code)),
      subsystems(code, name, systems(code, name, areas(code, name)))
    `)
    .in('project_id', projectIds)
    .order('created_at', { ascending: false })

  const punchList = (punches ?? []) as unknown as RawPunch[]

  const rows: PunchExportRow[] = punchList.map(p => {
    const sub = p.subsystems
    const sys = sub?.systems ?? null
    const area = pickOne(sys?.areas)
    const tag = p.tags
    const disc = pickOne(tag?.disciplines)
    const raised = pickOne(p.raised_by_profile)
    const assigned = pickOne(p.assigned_to_profile)
    const project = pickOne(p.projects)
    return {
      project: project?.code ?? '',
      punchNumber: p.punch_number,
      category: p.category,
      status: p.status,
      priority: p.priority,
      description: p.description,
      tagNumber: tag?.tag_number ?? '',
      discipline: disc?.code ?? '',
      area: area ? `${area.code} — ${area.name}` : '',
      system: sys ? `${sys.code} — ${sys.name}` : '',
      subsystem: sub ? `${sub.code} — ${sub.name}` : '',
      raisedBy: raised?.full_name ?? '',
      assignedTo: assigned?.full_name ?? '',
      targetDate: p.target_date ?? '',
      closedDate: p.closed_date ?? '',
      createdAt: p.created_at.slice(0, 10),
    }
  })

  const bytes = buildPunchListWorkbook(rows, { includeProjectCol: true })
  return excelResponse(bytes, `org-punch-list-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

function excelResponse(bytes: Uint8Array, filename: string): Response {
  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-cache',
    },
  })
}
