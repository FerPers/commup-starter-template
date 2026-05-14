import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
  if ((req.headers.get('authorization') ?? '') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const redispatchCutoffIso = new Date(Date.now() - REDISPATCH_DAYS * 86_400_000).toISOString()

  const { data: reviewsData, error: reviewsErr } = await admin
    .from('pssr_reviews')
    .select('id, org_id, project_id, review_number, title, review_due_date, status, last_overdue_notif_at')
    .in('status', OVERDUE_STATUSES)
    .lt('review_due_date', today)
    .not('review_due_date', 'is', null)
    .limit(2000)

  if (reviewsErr) return NextResponse.json({ error: reviewsErr.message }, { status: 500 })

  const reviews = (reviewsData ?? []) as ReviewRow[]
  const due = reviews.filter(r =>
    !r.last_overdue_notif_at || r.last_overdue_notif_at < redispatchCutoffIso,
  )

  if (due.length === 0) {
    return NextResponse.json({ scanned: reviews.length, fired: 0, inserted: 0, date: today })
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

    const overdueDays = Math.max(
      0,
      Math.floor((Date.parse(today) - Date.parse(review.review_due_date)) / 86_400_000),
    )

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
    date: today,
  })
}
