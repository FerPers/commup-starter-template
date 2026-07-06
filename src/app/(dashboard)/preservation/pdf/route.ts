import { getActiveMembership } from '@/lib/supabase/membership'
import {
  renderPreservationStatusPdf,
  type PreservationStatusData,
  type PreservationProjectGroup,
  type PreservationPlanRow,
} from '@/lib/pdf/preservation-status'

export const dynamic = 'force-dynamic'

const SOON_WINDOW_DAYS = 7

function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export async function GET() {
  const ctx = await getActiveMembership()
  if (!ctx) return new Response('Unauthorized', { status: 401 })
  const { supabase, orgId } = ctx

  const [
    { data: org },
    { data: projects },
  ] = await Promise.all([
    supabase.from('organizations').select('name').eq('id', orgId).maybeSingle(),
    supabase.from('projects').select('id, name, code').eq('org_id', orgId).order('name'),
  ])

  const projectList = (projects ?? []) as { id: string; name: string; code: string }[]
  const projectIds = projectList.map(p => p.id)

  const { data: plans } = projectIds.length === 0
    ? { data: [] }
    : await supabase
        .from('preservation_plans')
        .select(`
          status, next_due_date, last_performed_date, project_id,
          tags(tag_number),
          preservation_procedures(code, title, frequency)
        `)
        .in('project_id', projectIds)
        .order('next_due_date', { ascending: true })

  // Compute due bucket against today (UTC date, matching stored date-only values)
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const soonCutoff = new Date(today)
  soonCutoff.setUTCDate(soonCutoff.getUTCDate() + SOON_WINDOW_DAYS)
  const todayStr = today.toISOString().slice(0, 10)
  const soonStr = soonCutoff.toISOString().slice(0, 10)

  function dueBucket(status: string, nextDue: string): PreservationPlanRow['due'] {
    if (status !== 'active') return 'inactive'
    if (nextDue < todayStr) return 'overdue'
    if (nextDue <= soonStr) return 'soon'
    return 'ok'
  }

  const plansByProject = new Map<string, PreservationPlanRow[]>()
  for (const plan of plans ?? []) {
    const tag = pickOne(plan.tags)
    const proc = pickOne(plan.preservation_procedures)
    const row: PreservationPlanRow = {
      tag: tag?.tag_number ?? null,
      procedureCode: proc?.code ?? null,
      procedureTitle: proc?.title ?? null,
      frequency: proc?.frequency ?? null,
      status: plan.status as string,
      nextDueDate: plan.next_due_date,
      lastPerformedDate: plan.last_performed_date ?? null,
      due: dueBucket(plan.status as string, plan.next_due_date),
    }
    const list = plansByProject.get(plan.project_id) ?? []
    list.push(row)
    plansByProject.set(plan.project_id, list)
  }

  // Only projects that have plans; overdue first within each project
  const dueRank: Record<PreservationPlanRow['due'], number> = { overdue: 0, soon: 1, ok: 2, inactive: 3 }
  const groups: PreservationProjectGroup[] = projectList
    .map(p => ({
      code: p.code,
      name: p.name,
      plans: (plansByProject.get(p.id) ?? []).sort(
        (a, b) => dueRank[a.due] - dueRank[b.due] || a.nextDueDate.localeCompare(b.nextDueDate),
      ),
    }))
    .filter(g => g.plans.length > 0)

  const reportData: PreservationStatusData = {
    orgName: org?.name ?? 'Organization',
    generatedAt: todayStr,
    soonWindowDays: SOON_WINDOW_DAYS,
    projects: groups,
  }

  const bytes = await renderPreservationStatusPdf(reportData)
  const today10 = todayStr
  const filename = `preservation-status-${today10}.pdf`

  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-cache',
    },
  })
}
