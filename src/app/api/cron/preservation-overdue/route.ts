import { hasBearerSecret } from '@/lib/security/secret-compare'
import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/cron/preservation-overdue
 *
 * Scans `preservation_plans` for active plans whose `next_due_date` is in the
 * past and inserts a `preservation_overdue` in-app notification for the
 * responsible user. De-duplicates by checking whether a notification for the
 * same plan was already created today (00:00 UTC), so daily reruns don't spam.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Suggested wrangler cron: `0 7 * * *` (07:00 UTC daily). The current
 * wrangler.jsonc only has one cron (snapshot at 02:00 UTC); add this route to
 * your scheduler of choice (Cloudflare cron + scheduled handler, GitHub Action,
 * etc.).
 */

type PlanRow = {
  id: string
  project_id: string
  tag_id: string
  responsible_user_id: string | null
  procedure_id: string
  next_due_date: string
}

const PAGE = 1000
const IN_BATCH = 200

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  if (!hasBearerSecret(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const dayStartIso = `${today}T00:00:00.000Z`

  // C-39 (S08): paginado (antes un limit(2000) global para todas las orgs cortaba en silencio).
  const plans: PlanRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data: page, error: plansErr } = await admin
      .from('preservation_plans')
      .select('id, project_id, tag_id, responsible_user_id, procedure_id, next_due_date')
      .eq('status', 'active')
      .lt('next_due_date', today)
      .not('responsible_user_id', 'is', null)
      .order('id')
      .range(from, from + PAGE - 1)
    if (plansErr) return NextResponse.json({ error: plansErr.message }, { status: 500 })
    plans.push(...((page ?? []) as PlanRow[]))
    if (!page || page.length < PAGE) break
  }
  if (plans.length === 0) {
    return NextResponse.json({ scanned: 0, inserted: 0, skipped: 0, date: today })
  }

  const projectIds = Array.from(new Set(plans.map(p => p.project_id)))
  const tagIds = Array.from(new Set(plans.map(p => p.tag_id)))
  const procIds = Array.from(new Set(plans.map(p => p.procedure_id)))

  // C-39: `.in()` en lotes de 200 ids (2000 UUID superaban el largo de URL de PostgREST).
  const inBatches = async <T,>(ids: string[], fetch: (chunk: string[]) => PromiseLike<{ data: T[] | null }>): Promise<{ data: T[] }> => {
    const out: T[] = []
    for (let i = 0; i < ids.length; i += IN_BATCH) out.push(...((await fetch(ids.slice(i, i + IN_BATCH))).data ?? []))
    return { data: out }
  }
  const [{ data: projects }, { data: tags }, { data: procs }] = await Promise.all([
    inBatches(projectIds, chunk => admin.from('projects').select('id, org_id').in('id', chunk)),
    inBatches(tagIds, chunk => admin.from('tags').select('id, tag_number').in('id', chunk)),
    inBatches(procIds, chunk => admin.from('preservation_procedures').select('id, code, title').in('id', chunk)),
  ])

  const projectOrgId = new Map<string, string>(
    (projects ?? []).map(p => [p.id as string, p.org_id as string]),
  )
  const tagNumber = new Map<string, string>(
    (tags ?? []).map(t => [t.id as string, t.tag_number as string]),
  )
  const procLabel = new Map<string, string>(
    (procs ?? []).map(p => [p.id as string, (p.title as string) || (p.code as string)]),
  )

  let inserted = 0
  let skipped = 0

  for (const plan of plans) {
    const orgId = projectOrgId.get(plan.project_id)
    const recipient = plan.responsible_user_id
    if (!orgId || !recipient) {
      skipped++
      continue
    }

    const { count } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_user_id', recipient)
      .eq('kind', 'preservation_overdue')
      .gte('created_at', dayStartIso)
      .contains('payload', { planId: plan.id })

    if ((count ?? 0) > 0) {
      skipped++
      continue
    }

    const tagLabel = tagNumber.get(plan.tag_id) ?? ''
    const procTitle = procLabel.get(plan.procedure_id) ?? 'Procedimiento'
    const overdueDays = Math.max(
      0,
      Math.floor((Date.parse(today) - Date.parse(plan.next_due_date)) / 86_400_000),
    )

    const { error: notifErr } = await admin.from('notifications').insert({
      org_id: orgId,
      recipient_user_id: recipient,
      kind: 'preservation_overdue',
      title: `Preservación vencida: ${tagLabel}`,
      body: `${procTitle} (vencido hace ${overdueDays} día${overdueDays === 1 ? '' : 's'})`,
      link_url: `/projects/${plan.project_id}/preservation`,
      payload: {
        planId: plan.id,
        projectId: plan.project_id,
        tagId: plan.tag_id,
        nextDueDate: plan.next_due_date,
        overdueDays,
      },
    })
    if (notifErr) {
      console.error('[notifications.insert]', notifErr)
      skipped++
    } else {
      inserted++
    }
  }

  return NextResponse.json({
    scanned: plans.length,
    inserted,
    skipped,
    date: today,
  })
}
