import { hasBearerSecret } from '@/lib/security/secret-compare'
import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllRows } from '@/lib/list/fetch-all'

/**
 * POST /api/cron/snapshot
 *
 * Takes KPI snapshots for ALL active projects across ALL orgs.
 * Protected by a shared secret — only callable by an authorized scheduler.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Scheduled from .github/workflows/cron.yml (02:00 UTC daily): POST https://commup.app/api/cron/snapshot
 */

/** S20 (B-21): proyectos en paralelo por tanda (antes, todos en serie: el cron crecía lineal con los proyectos). */
const CONCURRENCY = 4

type Result = { projectId: string; ok: boolean; error?: string; gateDrift?: number }

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

  const runProject = async (pid: string): Promise<Result> => {
    try {
      // S09 (B-01/B-25): conteos completos en SQL e idempotente (antes: ≤1000 filas en JS, borrar + insertar).
      // S10 (D-27/B-29): sin p_date la BD usa el día local del proyecto (projects.timezone); el cron de las
      // 02:00 UTC es el cierre del día anterior en América y ya no queda etiquetado con la fecha siguiente.
      const { error: kpiErr } = await supabase.rpc('take_kpi_snapshot', { p_project_id: pid })

      // ── Readiness (fase 5): avance ponderado por sistema y KPIs de gestión diaria, en SQL ──
      const { error: mgmtErr } = await supabase.rpc('take_mgmt_snapshot', { p_project_id: pid })

      // S20 (D-07): red de seguridad del estado materializado de gates. drift > 0 = un cambio no marcó su sistema
      // como sucio (falta un trigger de invalidación); la auditoría lo corrige y aquí queda reportado.
      const { data: audit, error: auditErr } = await supabase.rpc('gate_status_audit', { p_project_id: pid })
      const gateDrift = (audit as { drift?: number } | null)?.drift ?? 0
      if (gateDrift > 0) console.error('[gate_status_audit] drift', { projectId: pid, gateDrift })

      const errMsg = kpiErr?.message ?? mgmtErr?.message ?? auditErr?.message
      return { projectId: pid, ok: !errMsg, error: errMsg, gateDrift }
    } catch (err) {
      return { projectId: pid, ok: false, error: String(err) }
    }
  }

  const results: Result[] = []
  for (let i = 0; i < projects.length; i += CONCURRENCY) {
    results.push(...await Promise.all(projects.slice(i, i + CONCURRENCY).map(p => runProject(p.id))))
  }

  const ok = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length

  // S20 (B-21): 500 si algún proyecto falló, para que el workflow (`curl -f`) lo marque en rojo.
  return NextResponse.json({
    total: results.length,
    ok,
    failed,
    results,
  }, { status: failed > 0 ? 500 : 200 })
}
