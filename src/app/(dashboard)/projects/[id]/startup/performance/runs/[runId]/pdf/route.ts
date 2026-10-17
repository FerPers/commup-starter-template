import { getLocale, getTranslations } from 'next-intl/server'
import { getActiveMembership } from '@/lib/supabase/membership'
import { renderPerformancePdf } from '@/lib/pdf/performance-report'
import type { Evaluation } from '@/lib/performance/catalog'

export const dynamic = 'force-dynamic'

/** Reporte de 14 secciones de un intento cerrado o evaluado (fase 7, sesión 2b). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await params
  const ctx = await getActiveMembership()
  if (!ctx) return new Response('Unauthorized', { status: 401 })
  const db = ctx.supabase

  const [{ data: project }, { data: org }, locale, t] = await Promise.all([
    db.from('projects').select('id, code').eq('id', id).eq('org_id', ctx.orgId).maybeSingle(),
    db.from('organizations').select('name').eq('id', ctx.orgId).single(),
    getLocale(),
    getTranslations('Startup'),
  ])
  if (!project) return new Response('Not found', { status: 404 })
  const { data: run } = await db.from('performance_runs').select('*').eq('id', runId).eq('project_id', id).maybeSingle()
  if (!run || !['closed', 'evaluated'].includes(run.status)) return new Response('Not found', { status: 404 })

  let evaluation = run.evaluation as unknown as Evaluation | null
  if (!evaluation) {
    const { data, error } = await db.rpc('evaluate_performance_run', { p_run_id: runId })
    if (error) return new Response(error.message, { status: 400 })
    evaluation = data as unknown as Evaluation
  }

  const [{ data: test }, { data: rev }, { data: vars }, { data: rsys }, { data: dist }, { data: cert }, { data: action }] = await Promise.all([
    db.from('performance_tests').select('number, title, systems!performance_tests_primary_system_id_fkey(code, name)').eq('id', run.test_id).single(),
    db.from('performance_test_revisions').select('*, procedures(number, title)').eq('id', run.revision_id).single(),
    db.from('performance_variables').select('id, key, label, unit, source, op, operand_a, operand_b, manual_every_min, signals(signal_tag)').eq('revision_id', run.revision_id).order('ord'),
    db.from('performance_revision_systems').select('systems(code)').eq('revision_id', run.revision_id),
    db.from('performance_disturbances').select('*').eq('run_id', runId).order('started_at'),
    db.from('performance_certificates').select('*').eq('run_id', runId).maybeSingle(),
    run.action_id ? db.from('actions').select('number, title').eq('id', run.action_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  if (!test || !rev) return new Response('Not found', { status: 404 })

  // Series del periodo formal desde los datos congelados (PostgREST corta en 1000 filas: se pagina).
  const plotted = (vars ?? []).filter(v => v.source !== 'derived')
  const rows: { variable_id: string; bucket: string; avg_val: number | null }[] = []
  if (run.formal_started_at) {
    for (let from = 0; from < 30000; from += 1000) {
      const { data } = await db.from('performance_run_data').select('variable_id, bucket, avg_val').eq('run_id', runId)
        .gte('bucket', run.formal_started_at.slice(0, 16)).order('bucket').range(from, from + 999)
      rows.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
  }

  const people = [rev.approved_by, run.result_by, cert?.commissioning_signed_by, cert?.operations_signed_by, cert?.client_signed_by, ...(dist ?? []).map(d => d.excluded_by)]
    .filter((x): x is string => !!x)
  const { data: profiles } = people.length ? await db.from('profiles').select('id, full_name').in('id', people) : { data: [] }
  const name = (u: string | null | undefined) => (u ? (profiles ?? []).find(p => p.id === u)?.full_name ?? null : null)
  const sys = test.systems as unknown as { code: string; name: string } | null
  const proc = rev.procedures as unknown as { number: string; title: string } | null

  const bytes = await renderPerformancePdf({
    lang: locale === 'en' ? 'en' : 'es',
    orgName: org?.name ?? 'CommUp',
    projectCode: project.code,
    test: { number: test.number, title: test.title },
    run: {
      number: run.number, status: run.status, stabilizationAt: run.stabilization_started_at, formalAt: run.formal_started_at, formalNote: run.formal_start_note,
      closedAt: run.closed_at, earlyClose: run.early_close, earlyReason: run.early_close_reason, evaluationHash: run.evaluation_hash,
      resultBy: name(run.result_by), resultAt: run.result_at,
    },
    revision: {
      rev: rev.rev, hash: rev.content_hash, stabilizationMin: rev.stabilization_min, formalMin: rev.formal_min, sampleIntervalS: rev.sample_interval_s,
      minCoveragePct: Number(rev.min_coverage_pct), approvedBy: name(rev.approved_by), approvedAt: rev.approved_at,
    },
    sections: (rev.sections ?? {}) as Record<string, string>,
    primarySystem: sys ? `${sys.code} — ${sys.name}` : '—',
    systems: (rsys ?? []).map(s => (s.systems as unknown as { code: string } | null)?.code).filter((x): x is string => !!x).sort(),
    procedure: proc ? `${proc.number} — ${proc.title}` : null,
    variables: (vars ?? []).map(v => ({
      key: v.key, label: v.label, source: v.source, unit: v.unit, every: v.source === 'manual' ? v.manual_every_min : null,
      ref: v.source === 'signal' ? (v.signals as unknown as { signal_tag: string } | null)?.signal_tag ?? '' : v.source === 'derived' ? `${v.operand_a} ${v.op} ${v.operand_b}` : '',
    })),
    evaluation,
    disturbances: (dist ?? []).map(d => ({ start: d.started_at, end: d.ended_at, kind: d.kind, description: d.description, excluded: d.excluded, reason: d.exclusion_reason, by: name(d.excluded_by) })),
    series: plotted.map(v => ({
      key: v.key, unit: v.unit,
      points: rows.filter(p => p.variable_id === v.id && p.avg_val !== null).map(p => ({ t: Date.parse(p.bucket), v: Number(p.avg_val) })),
    })),
    action: action ? `${action.number} — ${action.title}` : null,
    certificate: cert ? {
      number: cert.number, status: cert.status, hash: cert.content_hash,
      signatures: (['commissioning', 'operations', 'client'] as const).map(c => ({ capacity: c, name: name(cert[`${c}_signed_by`]), at: cert[`${c}_signed_at`] })),
    } : null,
    labels: {
      result: r => t(`perf.result.${r}`), outcome: o => t(`perf.outcome.${o}`), reason: r => t(`perf.reason.${r}`), source: s => t(`perf.source.${s}`),
      distKind: k => t(`perf.distKind.${k}`), certStatus: s => t(`perf.certStatus.${s}`), capacity: c => t(`perf.cert.cap.${c}`),
    },
  })
  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${project.code}-${run.number.replace('/', '-')}.pdf"`,
      'Cache-Control': 'private, no-cache',
    },
  })
}
