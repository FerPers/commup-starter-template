import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
  const authHeader = req.headers.get('authorization') ?? ''
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  // ── Load all active projects ──────────────────────────────────────────
  const { data: projects, error: projectsErr } = await supabase
    .from('projects')
    .select('id')
    .eq('status', 'active')

  if (projectsErr) {
    return NextResponse.json({ error: projectsErr.message }, { status: 500 })
  }

  const results: Array<{ projectId: string; ok: boolean; error?: string }> = []

  for (const project of projects ?? []) {
    const pid = project.id

    try {
      const [
        { data: itrs },
        { data: punches },
        { count: tagCount },
        { data: preservationPlans },
      ] = await Promise.all([
        supabase.from('itrs').select('id, status').eq('project_id', pid),
        supabase.from('punches').select('id, category, status').eq('project_id', pid),
        supabase.from('tags').select('id', { count: 'exact', head: true }).eq('project_id', pid),
        supabase
          .from('preservation_plans')
          .select('id, next_due_date')
          .eq('project_id', pid)
          .eq('status', 'active'),
      ])

      const totalItrs = itrs?.length ?? 0
      const completedItrs = (itrs ?? []).filter(i => i.status === 'approved').length
      const punchesA = (punches ?? []).filter(p => p.category === 'A')
      const punchesB = (punches ?? []).filter(p => p.category === 'B')
      const openPunchesA = punchesA.filter(p => !['closed', 'cancelled'].includes(p.status)).length
      const openPunchesB = punchesB.filter(p => !['closed', 'cancelled'].includes(p.status)).length
      const overduePreservation = (preservationPlans ?? []).filter(p => (p.next_due_date as string) < today).length
      const completionPct = totalItrs > 0 ? Number(((completedItrs / totalItrs) * 100).toFixed(2)) : 0

      // Delete any existing project-level snapshot for today before re-inserting
      await supabase
        .from('kpi_snapshots')
        .delete()
        .eq('project_id', pid)
        .eq('snapshot_date', today)
        .is('phase_id', null)
        .is('subsystem_id', null)
        .is('area_id', null)
        .is('system_id', null)

      const { error: insertErr } = await supabase.from('kpi_snapshots').insert({
        project_id: pid,
        area_id: null,
        system_id: null,
        subsystem_id: null,
        phase_id: null,
        total_itrs: totalItrs,
        completed_itrs: completedItrs,
        total_punches_a: punchesA.length,
        open_punches_a: openPunchesA,
        total_punches_b: punchesB.length,
        open_punches_b: openPunchesB,
        total_tags: tagCount ?? 0,
        total_preservation: preservationPlans?.length ?? 0,
        overdue_preservation: overduePreservation,
        completion_pct: completionPct,
        snapshot_date: today,
      })

      results.push({ projectId: pid, ok: !insertErr, error: insertErr?.message })
    } catch (err) {
      results.push({ projectId: pid, ok: false, error: String(err) })
    }
  }

  const ok = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length

  return NextResponse.json({
    date: today,
    total: results.length,
    ok,
    failed,
    results,
  })
}
