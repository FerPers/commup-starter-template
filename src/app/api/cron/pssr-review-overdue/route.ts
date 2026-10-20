import { hasBearerSecret } from '@/lib/security/secret-compare'
import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllRowsFlagged } from '@/lib/list/fetch-all'
import { latestPossibleToday, daysBetween } from '@/lib/time/zone'
import { loadProjectTimezones, projectTodayFn } from '@/lib/time/project-zones'

/**
 * POST /api/cron/pssr-review-overdue
 *
 * Scans `pssr_reviews` whose status is in_progress or pending_approval and
 * whose review_due_date is past. PSSR is a safety gate before energizing or
 * starting up any equipment, so the whole project staff needs visibility:
 * notifies every org_member.
 *
 * Idempotency: re-fires per review only if last_overdue_notif_at is null
 * or older than 3 days. Updates that column after a successful insert batch.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 */

type ReviewRow = {
  id: string
  org_id: string
  project_id: string
  review_number: string
  title: string
  review_due_date: string
  status: string
  last_overdue_notif_at: string | null
}

const REDISPATCH_DAYS = 3
const OVERDUE_STATUSES = ['in_progress', 'pending_approval']

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  if (!hasBearerSecret(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  // S10 (D-05/B-29): vencido según el día local del proyecto (cota UTC+14 en la BD, zona aquí).
  const bound = latestPossibleToday()
  const redispatchCutoffIso = new Date(Date.now() - REDISPATCH_DAYS * 86_400_000).toISOString()

  // S09 (B-07): paginado; .limit(2000) devolvía igual 1000
  let reviews: ReviewRow[]
  try {
    const res = await fetchAllRowsFlagged(() => admin
      .from('pssr_reviews')
      .select('id, org_id, project_id, review_number, title, review_due_date, status, last_overdue_notif_at')
      .in('status', OVERDUE_STATUSES)
      .lt('review_due_date', bound)
      .not('review_due_date', 'is', null))
    reviews = res.rows as ReviewRow[]
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
  let todayOf: (projectId: string) => string
  try {
    todayOf = projectTodayFn(await loadProjectTimezones(admin, reviews.map(r => r.project_id)))
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
  reviews = reviews.filter(r => r.review_due_date < todayOf(r.project_id))
  const due = reviews.filter(r =>
    !r.last_overdue_notif_at || r.last_overdue_notif_at < redispatchCutoffIso,
  )

  if (due.length === 0) {
    return NextResponse.json({ scanned: reviews.length, fired: 0, inserted: 0 })
  }

  // Fetch org members per org in bulk (one query per unique org).
  const orgIds = Array.from(new Set(due.map(r => r.org_id)))
  const membersByOrg = new Map<string, string[]>()
  for (const orgId of orgIds) {
    const { data: members } = await admin
      .from('org_members')
      .select('user_id')
      .eq('org_id', orgId)
    membersByOrg.set(
      orgId,
      (members ?? []).map(m => m.user_id as string).filter(Boolean),
    )
  }

  let inserted = 0
  let fired = 0
  const nowIso = new Date().toISOString()

  for (const review of due) {
    const recipients = membersByOrg.get(review.org_id) ?? []
    if (recipients.length === 0) continue

    const overdueDays = Math.max(0, daysBetween(review.review_due_date, todayOf(review.project_id)))

    const rows = recipients.map(uid => ({
      org_id: review.org_id,
      recipient_user_id: uid,
      kind: 'pssr_review_overdue',
      title: `PSSR vencido: ${review.review_number}`,
      body: `${review.title} (vencido hace ${overdueDays} día${overdueDays === 1 ? '' : 's'})`,
      link_url: `/projects/${review.project_id}/pssr/${review.id}`,
      payload: {
        reviewId: review.id,
        projectId: review.project_id,
        reviewNumber: review.review_number,
        reviewDueDate: review.review_due_date,
        overdueDays,
      },
    }))

    const { error: notifErr } = await admin.from('notifications').insert(rows)
    if (notifErr) {
      console.error('[notifications.insert pssr_review_overdue]', notifErr)
      continue
    }

    inserted += rows.length
    fired++

    const { error: updErr } = await admin
      .from('pssr_reviews')
      .update({ last_overdue_notif_at: nowIso })
      .eq('id', review.id)
    if (updErr) console.error('[pssr_reviews.update last_overdue_notif_at]', updErr)
  }

  return NextResponse.json({
    scanned: reviews.length,
    fired,
    inserted,
  })
}
