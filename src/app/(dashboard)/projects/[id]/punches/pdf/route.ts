import { getActiveMembership } from '@/lib/supabase/membership'
import { renderPunchListPdf, type PunchListPdfData, type PunchPdfRow } from '@/lib/pdf/punch-list'

export const dynamic = 'force-dynamic'

function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

const CAT_ORDER: Record<string, number> = { A: 0, B: 1, C: 2 }

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
    { data: punches },
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('id, code, name, client')
      .eq('id', projectId)
      .eq('org_id', orgId)
      .single(),
    supabase
      .from('punches')
      .select(`
        punch_number, category, status, description, target_date,
        assigned_to_profile:profiles!assigned_to(full_name),
        tags(tag_number, disciplines(code)),
        subsystems(code)
      `)
      .eq('project_id', projectId)
      .order('punch_number'),
  ])

  if (projectErr || !project) {
    return new Response('Project not found', { status: 404 })
  }

  const rows: PunchPdfRow[] = (punches ?? []).map(p => {
    const tag = p.tags
    const disc = pickOne(tag?.disciplines)
    const assigned = pickOne(p.assigned_to_profile)
    return {
      number: p.punch_number,
      category: p.category as 'A' | 'B' | 'C',
      status: p.status as string,
      tag: tag?.tag_number ?? null,
      discipline: disc?.code ?? null,
      subsystem: p.subsystems?.code ?? null,
      description: p.description,
      targetDate: p.target_date ?? null,
      assignedTo: assigned?.full_name ?? null,
    }
  })

  // Within each category, open punches first, then by number
  rows.sort((a, b) => {
    const c = (CAT_ORDER[a.category] ?? 9) - (CAT_ORDER[b.category] ?? 9)
    if (c !== 0) return c
    return a.number.localeCompare(b.number)
  })

  const reportData: PunchListPdfData = {
    projectName: project.name,
    projectCode: project.code,
    projectClient: project.client ?? null,
    punches: rows,
  }

  const bytes = await renderPunchListPdf(reportData)
  const safeCode = project.code.replace(/[^a-zA-Z0-9-]/g, '_')
  const today = new Date().toISOString().slice(0, 10)
  const filename = `${safeCode}-punch-list-${today}.pdf`

  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-cache',
    },
  })
}
