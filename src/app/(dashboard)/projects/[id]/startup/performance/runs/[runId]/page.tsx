import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DisturbanceKind, Evaluation, PerfResult, PerfRunStatus, VariableSource } from '@/lib/performance/catalog'
import RunConsole from './RunConsole'
import type { Certificate } from './CertificateCard'

// Consola de un intento de prueba de desempeño (fase 7, sesión 1): periodos, reloj, gráfico por variable
// (en vivo con signal_series mientras corre; congelado desde performance_run_data al cerrar o evaluar),
// perturbaciones y lecturas manuales.

const PAGE = 1000
const CAP = 30000

/**
 * PostgREST corta en 1000 filas: pagina hasta CAP. S10 (B-26): un error de red a mitad ya no devuelve una
 * serie parcial sin aviso (lanza), y superar CAP se marca para que la consola lo diga.
 */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<{ rows: T[]; truncated: boolean }> {
  const out: T[] = []
  for (let from = 0; from < CAP; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return { rows: out, truncated: false }
  }
  return { rows: out, truncated: true }
}

export default async function PerformanceRunPage({ params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase as SupabaseClient

  const { data: project } = await ctx.supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()
  const { data: run } = await ctx.supabase.from('performance_runs').select('*').eq('id', runId).eq('project_id', id).maybeSingle()
  if (!run) notFound()

  const [{ data: test }, { data: rev }, { data: vars }, { data: disturbances }, { data: members }] = await Promise.all([
    ctx.supabase.from('performance_tests').select('id, number, title, current_revision_id').eq('id', run.test_id).single(),
    ctx.supabase.from('performance_test_revisions').select('id, rev, status, stabilization_min, formal_min, sample_interval_s, min_coverage_pct').eq('id', run.revision_id).single(),
    ctx.supabase.from('performance_variables').select('id, key, label, unit, source, signal_id').eq('revision_id', run.revision_id).order('ord'),
    ctx.supabase.from('performance_disturbances').select('*').eq('run_id', runId).order('started_at'),
    ctx.supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId),
  ])
  if (!test || !rev) notFound()

  const variables = vars ?? []
  // S12 (E-06): un intento evaluado también está congelado (antes se mezclaban puntos congelados y en vivo).
  const frozen = run.status === 'closed' || run.status === 'evaluated'
  type Point = { variableId: string; bucket: string; value: number | null; source: 'iiot' | 'manual'; enteredBy: string | null }
  let points: Point[] = []
  let truncated = false
  if (frozen || run.stabilization_started_at) {
    // Datos del intento (congelados y manuales).
    const { rows: stored, truncated: t1 } = await fetchAll<{ variable_id: string; bucket: string; avg_val: number | null; source: string; entered_by: string | null }>((a, b) =>
      supabase.from('performance_run_data').select('variable_id, bucket, avg_val, source, entered_by').eq('run_id', runId).order('bucket').range(a, b))
    truncated ||= t1
    points = stored.map(r => ({ variableId: r.variable_id, bucket: r.bucket, value: r.avg_val, source: r.source as 'iiot' | 'manual', enteredBy: r.entered_by }))
    // En curso: las señales se leen en vivo desde la vista de 1 minuto.
    const live = variables.filter(v => v.source === 'signal' && v.signal_id)
    if (!frozen && live.length) {
      // S12 (E-03): serie reducida en la BD (filtro sargable por rango, hasta 35 días) en vez de paginar la vista
      // de 1 minuto, que re-agregaba toda la historia en cada página.
      const bySignal = new Map(live.map(v => [v.signal_id as string, v.id]))
      const { data: rows, error: seriesErr } = await supabase.rpc('signal_series', {
        p_signal_ids: [...bySignal.keys()].slice(0, 50), p_from: run.stabilization_started_at!, p_to: new Date().toISOString(), p_bucket_s: 60,
      })
      if (seriesErr) throw new Error(seriesErr.message)
      points.push(...((rows ?? []) as { signal_id: string; bucket: string; avg_val: number | null }[]).map(r => ({ variableId: bySignal.get(r.signal_id)!, bucket: r.bucket, value: r.avg_val, source: 'iiot' as const, enteredBy: null })))
    }
  }

  // Evaluación: previa mientras está cerrado (la BD la guarda y la recalcula solo si cambian sus entradas, S10
  // B-26); congelada una vez registrado el resultado.
  let evaluation: Evaluation | null = null
  let evaluationError: string | null = null
  if (run.status === 'evaluated') evaluation = run.evaluation as unknown as Evaluation
  else if (run.status === 'closed') {
    const { data, error } = await ctx.supabase.rpc('evaluate_performance_run', { p_run_id: runId })
    if (error) evaluationError = error.message
    else evaluation = data as unknown as Evaluation
  }
  const { data: certificate } = await ctx.supabase.from('performance_certificates')
    .select('id, number, status, content_hash, commissioning_signed_by, commissioning_signed_at, operations_signed_by, operations_signed_at, client_signed_by, client_signed_at, commissioning_company, operations_company, client_company, revoked_by, revoked_at, revoke_reason')
    .eq('run_id', runId).maybeSingle()
  const { data: action } = run.action_id
    ? await ctx.supabase.from('actions').select('id, number, status').eq('id', run.action_id).maybeSingle()
    : { data: null }

  const names: Record<string, string> = {}
  for (const m of members ?? []) {
    const p = m.profiles as unknown as { full_name: string | null } | null
    if (p?.full_name) names[m.user_id] = p.full_name
  }

  return (
    <RunConsole
      project={project}
      test={{ id: test.id, number: test.number, title: test.title }}
      run={{ ...run, status: run.status as PerfRunStatus, result: run.result as PerfResult | null }}
      evaluation={evaluation}
      evaluationError={evaluationError}
      action={action}
      certificate={certificate as Certificate | null}
      rev={{ rev: rev.rev, stabilization_min: rev.stabilization_min, formal_min: rev.formal_min, sample_interval_s: rev.sample_interval_s, outdated: test.current_revision_id !== rev.id }}
      variables={variables.map(v => ({ id: v.id, key: v.key, label: v.label, unit: v.unit, source: v.source as VariableSource }))}
      points={points.map(p => ({ ...p, value: p.value === null ? null : Number(p.value) }))}
      pointsTruncated={truncated}
      disturbances={(disturbances ?? []).map(d => ({ ...d, kind: d.kind as DisturbanceKind }))}
      names={names}
      userId={ctx.userId}
      role={ctx.role}
    />
  )
}
