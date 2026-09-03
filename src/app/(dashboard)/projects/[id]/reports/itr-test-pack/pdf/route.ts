import { fetchAllRows } from '@/lib/list/fetch-all'
import { getActiveMembership } from '@/lib/supabase/membership'
import {
  renderItrTestPackPdf,
  type ItrTestPackData,
  type TestPackSubsystem,
  type TestPackItr,
} from '@/lib/pdf/itr-test-pack'

export const dynamic = 'force-dynamic'

function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

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
    subsystems,
    itrs,
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('id, code, name, client')
      .eq('id', projectId)
      .eq('org_id', orgId)
      .single(),
    fetchAllRows(() => supabase
      .from('subsystems')
      .select('id, code, name')
      .eq('project_id', projectId)
      .order('code')),
    fetchAllRows(() => supabase
      .from('itrs')
      .select(`
        itr_number, subsystem_id, status, progress_pct, scheduled_date, completed_date,
        itr_templates(code, title),
        tags(tag_number)
      `)
      .eq('project_id', projectId)
      .order('itr_number')),
  ])

  if (projectErr || !project) {
    return new Response('Project not found', { status: 404 })
  }

  const subsystemList = (subsystems ?? []) as { id: string; code: string; name: string }[]

  const itrsBySubsystem = new Map<string, TestPackItr[]>()
  for (const itr of itrs ?? []) {
    const tmpl = pickOne(itr.itr_templates)
    const tag = pickOne(itr.tags)
    const row: TestPackItr = {
      number: itr.itr_number,
      templateCode: tmpl?.code ?? null,
      templateTitle: tmpl?.title ?? null,
      tag: tag?.tag_number ?? null,
      status: itr.status as string,
      progressPct: itr.progress_pct ?? 0,
      scheduledDate: itr.scheduled_date ?? null,
      completedDate: itr.completed_date ?? null,
    }
    const list = itrsBySubsystem.get(itr.subsystem_id) ?? []
    list.push(row)
    itrsBySubsystem.set(itr.subsystem_id, list)
  }

  // Only include subsystems that actually have ITRs
  const packs: TestPackSubsystem[] = subsystemList
    .map(s => ({ code: s.code, name: s.name, itrs: itrsBySubsystem.get(s.id) ?? [] }))
    .filter(s => s.itrs.length > 0)

  const reportData: ItrTestPackData = {
    projectName: project.name,
    projectCode: project.code,
    projectClient: project.client ?? null,
    subsystems: packs,
  }

  const bytes = await renderItrTestPackPdf(reportData)
  const safeCode = project.code.replace(/[^a-zA-Z0-9-]/g, '_')
  const today = new Date().toISOString().slice(0, 10)
  const filename = `${safeCode}-itr-test-pack-${today}.pdf`

  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-cache',
    },
  })
}
