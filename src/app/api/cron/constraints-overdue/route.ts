import { hasBearerSecret } from '@/lib/security/secret-compare'
import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllRowsFlagged } from '@/lib/list/fetch-all'

/**
 * POST /api/cron/constraints-overdue
 *
 * Gestión diaria (fase 5, decisión §11.7): restricciones abiertas con fecha requerida vencida.
 * Avisa al responsable (y a quien la registró, si es otra persona) sugiriendo escalar. El
 * escalamiento sigue siendo manual y con motivo: este cron solo notifica.
 *
 * Idempotencia: vuelve a avisar por restricción solo si last_overdue_notif_at es null o tiene más
 * de 3 días (update_constraint lo reinicia al cambiar la fecha requerida).
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 */

type ConstraintRow = {
  id: string
  org_id: string
  project_id: string
  number: string
  title: string
  need_date: string
  escalation_level: number
  owner_id: string | null
  created_by: string | null
  last_overdue_notif_at: string | null
}

const REDISPATCH_DAYS = 3

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
  const redispatchCutoffIso = new Date(Date.now() - REDISPATCH_DAYS * 86_400_000).toISOString()

  // S09 (B-07): paginado; .limit(2000) devolvía igual 1000 y las demás vencidas no se avisaban
  let rows: ConstraintRow[]
  try {
    const res = await fetchAllRowsFlagged(() => admin
      .from('project_constraints')
      .select('id, org_id, project_id, number, title, need_date, escalation_level, owner_id, created_by, last_overdue_notif_at')
      .eq('status', 'open')
      .lt('need_date', today))
    rows = res.rows as ConstraintRow[]
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
  const due = rows.filter(r => !r.last_overdue_notif_at || r.last_overdue_notif_at < redispatchCutoffIso)

  let inserted = 0
  let fired = 0
  const nowIso = new Date().toISOString()

  for (const c of due) {
    const recipients = Array.from(new Set([c.owner_id, c.created_by].filter((x): x is string => !!x)))
    if (recipients.length === 0) continue
    const overdueDays = Math.max(0, Math.floor((Date.parse(today) - Date.parse(c.need_date)) / 86_400_000))
    const next = Math.min(c.escalation_level + 1, 4)

    const notifs = recipients.map(uid => ({
      org_id: c.org_id,
      recipient_user_id: uid,
      kind: 'constraint_overdue',
      title: `Restricción vencida: ${c.number}`,
      body: `${c.title} (vencida hace ${overdueDays} día${overdueDays === 1 ? '' : 's'}, nivel ${c.escalation_level})`
        + (c.escalation_level < 4 ? ` — considera escalar a nivel ${next}` : ''),
      link_url: `/projects/${c.project_id}/daily/constraint/${c.id}`,
      payload: {
        constraintId: c.id,
        projectId: c.project_id,
        number: c.number,
        needDate: c.need_date,
        level: c.escalation_level,
        overdueDays,
      },
    }))

    const { error: notifErr } = await admin.from('notifications').insert(notifs)
    if (notifErr) {
      console.error('[notifications.insert constraint_overdue]', notifErr)
      continue
    }
    inserted += notifs.length
    fired++

    const { error: updErr } = await admin
      .from('project_constraints')
      .update({ last_overdue_notif_at: nowIso })
      .eq('id', c.id)
    if (updErr) console.error('[project_constraints.update last_overdue_notif_at]', updErr)
  }

  return NextResponse.json({ scanned: rows.length, fired, inserted, date: today })
}
