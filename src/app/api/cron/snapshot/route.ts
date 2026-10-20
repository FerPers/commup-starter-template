import { hasBearerSecret } from '@/lib/security/secret-compare'
import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllRows } from '@/lib/list/fetch-all'

/**
 * POST /api/cron/snapshot
 *
 * Takes KPI snapshots for ALL active projects across ALL orgs.
 * Protected by a shared secret — only callable by Cloudflare Cron Triggers
 * or any authorized scheduler.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Wrangler cron (wrangler.jsonc):
 *   "triggers": { "crons": ["0 2 * * *"] }   ← every day at 02:00 UTC
 *
 * The route calls: POST https://commup.app/api/cron/snapshot
 */

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  if (!hasBearerSecret(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // ── Load all active projects ──────────────────────────────────────────
  let projects: { id: string }[]
  try {
    projects = await fetchAllRows(() => supabase.from('projects').select('id').eq('status', 'active'))
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }

  const results: Array<{ projectId: string; ok: boolean; error?: string }> = []

  for (const project of projects) {
    const pid = project.id

    try {
      // S09 (B-01/B-25): conteos completos en SQL e idempotente (antes: ≤1000 filas en JS, borrar + insertar).
      // S10 (D-27/B-29): sin p_date la BD usa el día local del proyecto (projects.timezone); el cron de las
      // 02:00 UTC es el cierre del día anterior en América y ya no queda etiquetado con la fecha siguiente.
      const { error: kpiErr } = await supabase.rpc('take_kpi_snapshot', { p_project_id: pid })

      // ── Readiness (fase 5): avance ponderado por sistema y KPIs de gestión diaria, en SQL ──
      const { error: mgmtErr } = await supabase.rpc('take_mgmt_snapshot', { p_project_id: pid })

      const errMsg = kpiErr?.message ?? mgmtErr?.message
      results.push({ projectId: pid, ok: !errMsg, error: errMsg })
    } catch (err) {
      results.push({ projectId: pid, ok: false, error: String(err) })
    }
  }

  const ok = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length

  return NextResponse.json({
    total: results.length,
    ok,
    failed,
    results,
  })
}
