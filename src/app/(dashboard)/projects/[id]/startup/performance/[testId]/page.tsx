import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import type {
  CertificateStatus, ContentDraft, CriterionDraft, DerivedOp, PerfResult, PerfRunStatus, PerformanceSection, RevisionStatus, Statistic, TotalBasis, UncertaintyMode, VariableSource,
} from '@/lib/performance/catalog'
import { fetchAllRowsFlagged } from '@/lib/list/fetch-all'
import TestView from './TestView'
import { getTranslations } from 'next-intl/server'
import PartialNote from '@/components/ui/PartialNote'

// Ficha de una prueba de desempeño (fase 7, sesión 1): definición con revisiones (frontera, variables,
// criterios, pares de medidores) e intentos.
export default async function PerformanceTestPage({ params, searchParams }: {
  params: Promise<{ id: string; testId: string }>
  searchParams: Promise<{ rev?: string }>
}) {
  const { id, testId } = await params
  const sp = await searchParams
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()
  const { data: test } = await supabase.from('performance_tests').select('*').eq('id', testId).eq('project_id', id).maybeSingle()
  if (!test) notFound()

  // S09 (E-20): PostgREST corta en 1000 filas aunque se pida .limit(2000); el catálogo de señales se pagina.
  const [{ data: revisions }, { data: runs }, { data: systems }, signalsRes, { data: procedures }, { data: members }] = await Promise.all([
    supabase.from('performance_test_revisions').select('*').eq('test_id', testId).order('rev', { ascending: false }),
    supabase.from('performance_runs').select('id, number, attempt, status, revision_id, created_at, stabilization_started_at, formal_started_at, closed_at, early_close, aborted_at, result')
      .eq('test_id', testId).order('attempt', { ascending: false }),
    supabase.from('systems').select('id, code, name').eq('project_id', id).order('code'),
    fetchAllRowsFlagged(() => supabase.from('signals').select('id, signal_tag, eng_unit, tags!inner(project_id, subsystems(system_id))')
      .eq('tags.project_id', id).order('signal_tag')),
    supabase.from('procedures').select('id, number, title').eq('project_id', id).not('current_revision_id', 'is', null).order('number'),
    supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId),
  ])
  const signals = signalsRes.rows
  const revs = revisions ?? []
  const { data: liveCert } = await supabase.from('performance_certificates').select('id, number, status, run_id')
    .eq('test_id', testId).in('status', ['pending_signatures', 'accepted']).maybeSingle()
  // Revisión mostrada: ?rev=N, si no la abierta (borrador / en revisión), si no la vigente.
  const shown = revs.find(r => String(r.rev) === sp.rev) ?? revs.find(r => r.status === 'draft' || r.status === 'in_review')
    ?? revs.find(r => r.id === test.current_revision_id) ?? revs[0]

  const [{ data: rsys }, { data: vars }, { data: crit }, { data: pairs }] = await Promise.all([
    supabase.from('performance_revision_systems').select('system_id').eq('revision_id', shown.id),
    supabase.from('performance_variables').select('*').eq('revision_id', shown.id).order('ord'),
    supabase.from('performance_criteria').select('*').eq('revision_id', shown.id).order('ord'),
    supabase.from('performance_meter_pairs').select('*').eq('revision_id', shown.id).order('ord'),
  ])

  const names: Record<string, string> = {}
  for (const m of members ?? []) {
    const p = m.profiles as unknown as { full_name: string | null } | null
    if (p?.full_name) names[m.user_id] = p.full_name
  }
  const s = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v))
  const content: ContentDraft = {
    sections: (shown.sections ?? {}) as Partial<Record<PerformanceSection, string>>,
    settings: {
      stabilization_min: s(shown.stabilization_min), formal_min: s(shown.formal_min), sample_interval_s: s(shown.sample_interval_s),
      min_coverage_pct: s(shown.min_coverage_pct), procedure_id: shown.procedure_id ?? '',
    },
    system_ids: (rsys ?? []).map(r => r.system_id).filter(x => x !== test.primary_system_id),
    variables: (vars ?? []).map(v => ({
      key: v.key, label: v.label, unit: v.unit ?? '', source: v.source as VariableSource, signal_id: v.signal_id,
      op: (v.op ?? '/') as DerivedOp, operand_a: v.operand_a ?? '', operand_b: v.operand_b ?? '', max_step: s(v.max_step), manual_every_min: s(v.manual_every_min),
    })),
    criteria: (crit ?? []).map((c): CriterionDraft => ({
      variable_key: c.variable_key, label: c.label ?? '', statistic: c.statistic as Statistic, band_lo: s(c.band_lo), band_hi: s(c.band_hi),
      total_basis: (c.total_basis ?? 'h') as TotalBasis, operator: c.operator as CriterionDraft['operator'], target: s(c.target), target_hi: s(c.target_hi),
      uncertainty: s(c.uncertainty), uncertainty_mode: c.uncertainty_mode as UncertaintyMode,
    })),
    pairs: (pairs ?? []).map(p => ({ variable_a: p.variable_a, variable_b: p.variable_b, max_diff_pct: s(p.max_diff_pct) })),
  }

  const tl = await getTranslations('Common')
  return (
    <>
    {signalsRes.truncated && (
      <PartialNote>{tl('listPartial')}</PartialNote>
    )}
    <TestView
      key={`${shown.id}:${shown.status}`}
      project={project}
      test={{ id: test.id, number: test.number, title: test.title, primarySystemId: test.primary_system_id, currentRevisionId: test.current_revision_id, createdBy: test.created_by }}
      revisions={revs.map(r => ({
        id: r.id, rev: r.rev, status: r.status as RevisionStatus, changeReason: r.change_reason, returnedReason: r.returned_reason,
        createdBy: r.created_by, submittedBy: r.submitted_by, submittedAt: r.submitted_at, approvedBy: r.approved_by, approvedAt: r.approved_at, hash: r.content_hash,
      }))}
      shownId={shown.id}
      liveCertificate={liveCert ? { ...liveCert, status: liveCert.status as CertificateStatus } : null}
      content={content}
      runs={(runs ?? []).map(r => ({ ...r, status: r.status as PerfRunStatus, result: r.result as PerfResult | null, rev: revs.find(x => x.id === r.revision_id)?.rev ?? null }))}
      systems={systems ?? []}
      signals={signals.map(x => ({
        id: x.id, tag: x.signal_tag, unit: x.eng_unit,
        systemId: (x.tags as unknown as { subsystems: { system_id: string } | null } | null)?.subsystems?.system_id ?? null,
      }))}
      procedures={(procedures ?? []).map(p => ({ id: p.id, label: `${p.number} — ${p.title}` }))}
      names={names}
      userId={ctx.userId}
      role={ctx.role}
    />
    </>
  )
}
