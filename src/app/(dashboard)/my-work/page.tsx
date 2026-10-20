import Link from 'next/link'
import PrepareOffline, { OfflineReadyChip } from '@/components/offline/PrepareOffline'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { canReleaseHold, signableCapacities, type HoldCapacity } from '@/lib/startup/catalog'
import { loadMyCapacitiesByProject } from '@/lib/capacities/server'
import { fallbackCapacities } from '@/lib/constants/capacities'
import { canSignCertificate, isPerformanceLead, type CertSigners } from '@/lib/performance/catalog'
import { getActiveMembership } from '@/lib/supabase/membership'
import { CATEGORY_CFG, ITR_STYLE, PUNCH_STYLE } from '@/components/dashboard/widgets/_shared'
import {
  canSignCertificates, daysOverdue, dueState, parseCounts, seesPreservation, sortPunches, splitAssignments,
  type AssignmentRow, type DueState,
} from '@/lib/my-work/queues'
import { greetingName } from '@/lib/utils'
import type { OrgMemberRole } from '@/types/database'
import { fetchAllRowsFlagged } from '@/lib/list/fetch-all'
import { DEFAULT_TIMEZONE, latestPossibleToday } from '@/lib/time/zone'
import { projectTodayFn } from '@/lib/time/project-zones'

export const dynamic = 'force-dynamic'

/** Máximo de filas por cola en pantalla; el resto se ve en la lista del módulo. */
const QUEUE_LIMIT = 20

type PunchRow = {
  id: string; punch_number: string; category: 'A' | 'B' | 'C'; description: string; status: string
  target_date: string | null; project_id: string
  projects: { code: string } | null; tags: { tag_number: string } | null
}
type PlanItemRow = {
  id: string; title: string | null; status: string; planned_finish: string | null
  work_plans: { plan_date: string; project_id: string; projects: { code: string } | null } | null
  itrs: { itr_number: string; tags: { tag_number: string } | null } | null
}
type CertRow = {
  id: string; certificate_number: string; title: string; issued_date: string | null; project_id: string
  projects: { code: string } | null; certificate_signatures: { role: string }[]
}
type PreservationRow = {
  id: string; next_due_date: string; project_id: string
  tags: { id: string; tag_number: string; description: string } | null
  preservation_procedures: { code: string; title: string } | null
  projects: { code: string } | null
}

export default async function MyWorkPage() {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const { supabase, userId, orgId } = ctx
  const role = ctx.role as OrgMemberRole
  const signer = canSignCertificates(role)
  const oversight = seesPreservation(role)

  const [t, tGuide, tStartup, locale, { data: profile }, { data: projects }] = await Promise.all([
    getTranslations('MyWork'),
    getTranslations('PunchGuide'),
    getTranslations('Startup'),
    getLocale(),
    supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
    supabase.from('projects').select('id, code, timezone').eq('org_id', orgId),
  ])
  const projectIds = (projects ?? []).map(p => p.id)
  const projectSet = new Set(projectIds)
  // S10 (G-13/D-05): «hoy» de cada proyecto (projects.timezone); el servidor corre en UTC. La BD filtra con la
  // cota UTC+14 y aquí se aplica el día de cada proyecto.
  const zones = new Map((projects ?? []).map(p => [p.id, p.timezone ?? DEFAULT_TIMEZONE]))
  const todayOf = projectTodayFn(zones)
  const bound = latestPossibleToday()
  const headerTz = projects?.[0]?.timezone ?? DEFAULT_TIMEZONE

  const none = Promise.resolve({ data: null })
  const punchSel = 'id, punch_number, category, description, status, target_date, project_id, projects(code), tags(tag_number)'
  const actionSel = 'id, number, title, priority, due_date, project_id, projects(code)'
  const [{ data: countsRaw }, { data: assignments }, { data: punches }, { data: planItems }, { data: certs }, { data: preservation }, { data: toVerify }, { data: toReview }, { data: myActions }, { data: actionsVerify }, { data: myConstraints }, { data: handovers }, { data: holds }, { data: lineupItems }, { data: pendingMilestones }, { data: pendingTransfers }, { data: perfToDecide }, { data: perfCerts }] = await Promise.all([
    supabase.rpc('my_work_counts', { p_org_id: orgId }),
    // S09 (B-07): solo ITR no aprobados de los proyectos de la org, paginado (antes: TODAS mis asignaciones,
    // cortadas en 1000 → podían faltar las pendientes mientras el badge SQL contaba bien).
    projectIds.length === 0 ? Promise.resolve({ data: [] }) : fetchAllRowsFlagged(() => supabase
      .from('itr_assignments')
      .select('role, itrs!inner(id, itr_number, status, progress_pct, scheduled_date, completed_date, project_id, required_signatures, tags(id, tag_number, description), projects(code), project_phases(code, color), itr_signatures(role, user_id))')
      .eq('user_id', userId)
      .neq('itrs.status', 'approved')
      .in('itrs.project_id', projectIds), { maxRows: 10_000 }).then(r => ({ data: r.rows })),
    projectIds.length === 0 ? none : supabase
      .from('punches')
      .select('id, punch_number, category, description, status, target_date, project_id, projects(code), tags(tag_number)')
      .eq('assigned_to', userId)
      .in('status', ['open', 'in_progress'])
      .is('resolved_at', null)
      .in('project_id', projectIds)
      .limit(200),
    projectIds.length === 0 ? none : supabase
      .from('work_plan_items')
      .select('id, title, status, planned_finish, work_plans!inner(plan_date, status, project_id, projects(code)), itrs(itr_number, tags(tag_number))')
      .eq('assigned_to', userId)
      .in('status', ['not_started', 'in_progress'])
      .in('work_plans.status', ['published', 'in_progress'])
      .lte('work_plans.plan_date', bound)
      .in('work_plans.project_id', projectIds)
      .limit(QUEUE_LIMIT + 1),
    !signer || projectIds.length === 0 ? none : supabase
      .from('certificates')
      .select('id, certificate_number, title, issued_date, project_id, projects(code), certificate_signatures(role)')
      .eq('status', 'issued')
      .in('project_id', projectIds)
      .order('issued_date', { ascending: true })
      .limit(200),
    !oversight || projectIds.length === 0 ? none : supabase
      .from('preservation_plans')
      .select('id, next_due_date, project_id, tags(id, tag_number, description), preservation_procedures(code, title), projects(code)')
      .eq('status', 'active')
      .lt('next_due_date', bound)
      .in('project_id', projectIds)
      .order('next_due_date', { ascending: true })
      .limit(QUEUE_LIMIT + 1),
    // Fase 4: resueltos por otros, por verificar en campo. S06 (C-44): los que levanté yo, o todos si superviso
    // (igual que my_work_counts.punches_verify).
    // bounded: .limit(QUEUE_LIMIT + 1) al final de la cadena
    projectIds.length === 0 ? none : (oversight ? supabase.from('punches').select(`${punchSel}, resolved_at`) : supabase.from('punches').select(`${punchSel}, resolved_at`).eq('raised_by', userId))
      .eq('status', 'in_progress')
      .not('resolved_at', 'is', null)
      .neq('resolved_by', userId)
      .in('project_id', projectIds)
      .order('resolved_at', { ascending: true })
      .limit(QUEUE_LIMIT + 1),
    // Fase 4: categoría sin revisar (solo supervisores), levantados por otros.
    !oversight || projectIds.length === 0 ? none : supabase
      .from('punches')
      .select(`${punchSel}, impact`)
      .in('status', ['open', 'in_progress'])
      .is('category_reviewed_at', null)
      .neq('raised_by', userId)
      .in('project_id', projectIds)
      .order('created_at', { ascending: true })
      .limit(QUEUE_LIMIT + 1),
    // Fase 5: mis acciones abiertas, acciones hechas por otros por verificar y mis restricciones.
    projectIds.length === 0 ? none : supabase
      .from('actions')
      .select(actionSel)
      .eq('owner_id', userId)
      .in('status', ['open', 'in_progress'])
      .in('project_id', projectIds)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(QUEUE_LIMIT + 1),
    role === 'client' || projectIds.length === 0 ? none : supabase
      .from('actions')
      .select(`${actionSel}, done_at`)
      .eq('status', 'done')
      .neq('done_by', userId)
      .in('project_id', projectIds)
      .order('done_at', { ascending: true })
      .limit(QUEUE_LIMIT + 1),
    projectIds.length === 0 ? none : supabase
      .from('project_constraints')
      .select('id, number, title, escalation_level, need_date, project_id, projects(code), systems(code)')
      .eq('owner_id', userId)
      .eq('status', 'open')
      .in('project_id', projectIds)
      .order('need_date', { ascending: true })
      .limit(QUEUE_LIMIT + 1),
    // Fase 5 (sesión 3): relevos entregados por otros, por recibir.
    role === 'client' || projectIds.length === 0 ? none : supabase
      .from('shift_handovers')
      .select('id, number, shift_date, shift_label, handed_at, project_id, projects(code)')
      .eq('status', 'handed_over')
      .neq('handed_by', userId)
      .in('project_id', projectIds)
      .order('handed_at', { ascending: true })
      .limit(QUEUE_LIMIT + 1),
    // Fase 6: hold points detenidos (la RPC decide si mi rol puede liberarlos) y filas críticas por verificar.
    projectIds.length === 0 ? none : supabase
      .from('procedure_run_steps')
      .select('run_id, ord, done_by, project_id, procedure_steps(action, hold_capacity), procedure_runs(number, status), projects(code)')
      .eq('status', 'at_hold')
      .neq('done_by', userId)
      .in('project_id', projectIds)
      .limit(QUEUE_LIMIT + 1),
    projectIds.length === 0 ? none : supabase
      .from('lineup_items')
      .select('id, label, sheet_id, project_id, tags(tag_number), lineup_sheets(number, status), projects(code)')
      .eq('is_critical', true)
      .not('set_at', 'is', null)
      .is('verified_at', null)
      .neq('set_by', userId)
      .in('project_id', projectIds)
      .limit(QUEUE_LIMIT + 1),
    // Fase 6 (sesión 2): hitos de arranque por atestiguar (se filtra por capacidad abajo).
    projectIds.length === 0 ? none : supabase
      .from('startup_events')
      .select('id, number, title, milestone, witness_capacity, occurred_at, project_id, projects(code), systems(code)')
      .eq('status', 'pending_witness')
      .neq('recorded_by', userId)
      .in('project_id', projectIds)
      .order('occurred_at', { ascending: true })
      .limit(QUEUE_LIMIT + 1),
    // Fase 6 (sesión 3): traspasos de propiedad por firmar (se filtra por rol y firmas abajo).
    projectIds.length === 0 ? none : supabase
      .from('ownership_transfers')
      .select('id, number, to_stage, is_reversal, commissioning_signed_by, operations_signed_by, project_id, projects(code), systems(code)')
      .eq('status', 'pending_signatures')
      .in('project_id', projectIds)
      .order('requested_at', { ascending: true })
      .limit(50),
    // Fase 7: intentos de prueba de desempeño cerrados sin resultado (solo líderes+) y PTC por firmar.
    projectIds.length === 0 || !isPerformanceLead(role) ? none : supabase
      .from('performance_runs')
      .select('id, number, closed_at, early_close, project_id, projects!performance_runs_project_id_fkey(code), performance_tests!performance_runs_test_id_fkey(title)')
      .eq('status', 'closed')
      .in('project_id', projectIds)
      .order('closed_at', { ascending: true })
      .limit(QUEUE_LIMIT + 1),
    projectIds.length === 0 ? none : supabase
      .from('performance_certificates')
      .select('id, number, run_id, status, commissioning_signed_by, operations_signed_by, client_signed_by, project_id, projects(code), systems(code)')
      .eq('status', 'pending_signatures')
      .in('project_id', projectIds)
      .order('created_at', { ascending: true })
      .limit(50),
  ])

  const counts = parseCounts(countsRaw)
  const queues = splitAssignments((assignments ?? []) as unknown as AssignmentRow[], projectSet, userId)
  const myPunches = sortPunches((punches ?? []) as unknown as PunchRow[])
  const plan = ((planItems ?? []) as unknown as PlanItemRow[])
    .filter(i => !i.work_plans || i.work_plans.plan_date <= todayOf(i.work_plans.project_id))
  const pendingCerts = ((certs ?? []) as unknown as CertRow[]).filter(c => !c.certificate_signatures.some(s => s.role === 'completion'))
  const overduePres = ((preservation ?? []) as unknown as PreservationRow[]).filter(p => p.next_due_date < todayOf(p.project_id))
  const verifyRows = (toVerify ?? []) as unknown as PunchRow[]
  const reviewRows = (toReview ?? []) as unknown as (PunchRow & { impact: string | null })[]
  type ActionQueueRow = { id: string; number: string; title: string; priority: string; due_date: string | null; project_id: string; projects: { code: string } | null }
  const actionRows = (myActions ?? []) as unknown as ActionQueueRow[]
  const actionVerifyRows = (actionsVerify ?? []) as unknown as ActionQueueRow[]
  const constraintRows = (myConstraints ?? []) as unknown as {
    id: string; number: string; title: string; escalation_level: number; need_date: string; project_id: string
    projects: { code: string } | null; systems: { code: string } | null
  }[]
  const handoverRows = (handovers ?? []) as unknown as {
    id: string; number: string; shift_date: string; shift_label: string; handed_at: string; project_id: string; projects: { code: string } | null
  }[]
  // S14 (D14): quién libera, atestigua o firma depende de la capacidad en cada proyecto (designado o respaldo).
  const capsByProject = await loadMyCapacitiesByProject(supabase, [
    ...((holds ?? []) as { project_id: string }[]), ...((pendingMilestones ?? []) as { project_id: string }[]),
    ...((pendingTransfers ?? []) as { project_id: string }[]), ...((perfCerts ?? []) as { project_id: string }[]),
  ].map(r => r.project_id))
  const capsOf = (projectId: string) => capsByProject.get(projectId) ?? fallbackCapacities('')
  const holdRows = ((holds ?? []) as unknown as {
    run_id: string; ord: number; project_id: string; procedure_steps: { action: string; hold_capacity: string } | null
    procedure_runs: { number: string; status: string } | null; projects: { code: string } | null
  }[]).filter(h => {
    const cap = h.procedure_steps?.hold_capacity as HoldCapacity | undefined
    return !!cap && canReleaseHold(capsOf(h.project_id), cap, userId, null)
  })
  const lineupRows = ((lineupItems ?? []) as unknown as {
    id: string; label: string | null; sheet_id: string; project_id: string; tags: { tag_number: string } | null
    lineup_sheets: { number: string; status: string } | null; projects: { code: string } | null
  }[]).filter(i => i.lineup_sheets && ['issued', 'in_progress'].includes(i.lineup_sheets.status))
  const milestoneRows = ((pendingMilestones ?? []) as unknown as {
    id: string; number: string; title: string; witness_capacity: string; project_id: string; projects: { code: string } | null; systems: { code: string } | null
  }[]).filter(m => canReleaseHold(capsOf(m.project_id), m.witness_capacity as HoldCapacity, userId, null))
  const transferRows = ((pendingTransfers ?? []) as unknown as {
    id: string; number: string; to_stage: string; is_reversal: boolean; commissioning_signed_by: string | null; operations_signed_by: string | null
    project_id: string; projects: { code: string } | null; systems: { code: string } | null
  }[]).filter(x => signableCapacities(capsOf(x.project_id), userId, x).length > 0)
  const perfDecideRows = (perfToDecide ?? []) as unknown as {
    id: string; number: string; early_close: boolean; project_id: string; projects: { code: string } | null; performance_tests: { title: string } | null
  }[]
  const perfSignRows = ((perfCerts ?? []) as unknown as (CertSigners & {
    id: string; number: string; run_id: string; project_id: string; projects: { code: string } | null; systems: { code: string } | null
  })[]).filter(c => canSignCertificate(c, 'operations', capsOf(c.project_id), userId) || canSignCertificate(c, 'client', capsOf(c.project_id), userId))
  const dailyHref = (projectId: string | undefined, tab: string) => (projectId ? `/projects/${projectId}/daily?tab=${tab}` : '/projects')

  const projectsInvolved = new Set<string>([
    ...queues.execute.map(r => r.itrs!.project_id),
    ...queues.review.map(r => r.itrs!.project_id),
    ...myPunches.map(p => p.project_id),
    ...plan.map(p => p.work_plans?.project_id ?? ''),
    ...(signer ? pendingCerts.map(c => c.project_id) : []),
    ...actionRows.map(a => a.project_id),
    ...constraintRows.map(c => c.project_id),
  ].filter(Boolean))
  const personalTotal = counts.itrs_execute + counts.itrs_review + counts.punches + counts.plan_items + (signer ? counts.signatures : 0)
    + counts.actions_mine + counts.constraints_mine + (role !== 'client' ? counts.handovers_to_receive : 0) + counts.holds_to_release + counts.milestones_to_witness + counts.transfers_to_sign
    + counts.performance_to_decide + counts.performance_to_sign

  const firstName = greetingName(profile?.full_name, ctx.userEmail)
  const dateLocale = locale === 'en' ? 'en-US' : 'es-ES'
  const todayLabel = new Date().toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: headerTz })
  const roleLabel = t(`roles.${role}`)
  const fmt = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })

  const duePill = (date: string | null | undefined, projectId: string | null | undefined, opts?: { doneLabel?: string }) => {
    const state: DueState = dueState(date, todayOf(projectId ?? ''))
    if (!date || !state) return opts?.doneLabel ? <Pill tone="info">{opts.doneLabel}</Pill> : null
    if (state === 'overdue') return <Pill tone="danger">{t('due.overdue', { date: fmt(date) })}</Pill>
    if (state === 'today') return <Pill tone="warning">{t('due.today')}</Pill>
    return <Pill tone="neutral">{t('due.scheduled', { date: fmt(date) })}</Pill>
  }

  return (
    <div style={{ padding: 28, maxWidth: 980 }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-strong)', letterSpacing: '-0.5px', margin: 0 }}>
          {firstName ? t('hello', { name: firstName }) : t('title')}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', margin: '4px 0 0' }}>
          <span style={{ textTransform: 'capitalize' }}>{todayLabel}</span>
          {' · '}{roleLabel}{' · '}
          {t('summary', { count: personalTotal, projects: projectsInvolved.size })}
        </p>
      </header>

      {/* Contadores */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
        <Chip n={counts.itrs_execute} label={t('chips.execute')} tone={counts.itrs_execute > 0 ? 'danger' : 'neutral'} />
        <Chip n={counts.itrs_review} label={t('chips.review')} tone={counts.itrs_review > 0 ? 'info' : 'neutral'} />
        <Chip n={counts.punches} label={t('chips.punches')} tone={counts.punches > 0 ? 'warning' : 'neutral'} />
        <Chip n={counts.plan_items} label={t('chips.plan')} tone="neutral" />
        {signer && <Chip n={counts.signatures} label={t('chips.signatures')} tone={counts.signatures > 0 ? 'info' : 'neutral'} />}
        {oversight && <Chip n={counts.preservation_overdue} label={t('chips.preservation')} tone={counts.preservation_overdue > 0 ? 'danger' : 'neutral'} />}
        <Chip n={counts.punches_verify} label={t('chips.punchesVerify')} tone={counts.punches_verify > 0 ? 'info' : 'neutral'} />
        {oversight && <Chip n={counts.punches_review} label={t('chips.punchesReview')} tone={counts.punches_review > 0 ? 'warning' : 'neutral'} />}
        <Chip n={counts.actions_mine} label={t('chips.actions')} tone={counts.actions_mine > 0 ? 'warning' : 'neutral'} />
        {role !== 'client' && <Chip n={counts.actions_verify} label={t('chips.actionsVerify')} tone={counts.actions_verify > 0 ? 'info' : 'neutral'} />}
        <Chip n={counts.constraints_mine} label={t('chips.constraints')} tone={counts.constraints_mine > 0 ? 'danger' : 'neutral'} />
        {role !== 'client' && <Chip n={counts.handovers_to_receive} label={t('chips.handovers')} tone={counts.handovers_to_receive > 0 ? 'info' : 'neutral'} />}
        {counts.holds_to_release > 0 && <Chip n={counts.holds_to_release} label={t('chips.holds')} tone="warning" />}
        {counts.lineup_to_verify > 0 && <Chip n={counts.lineup_to_verify} label={t('chips.lineup')} tone="info" />}
        {counts.milestones_to_witness > 0 && <Chip n={counts.milestones_to_witness} label={t('chips.milestones')} tone="warning" />}
        {counts.transfers_to_sign > 0 && <Chip n={counts.transfers_to_sign} label={t('chips.transfers')} tone="warning" />}
        {counts.performance_to_decide > 0 && <Chip n={counts.performance_to_decide} label={t('chips.performanceDecide')} tone="warning" />}
        {counts.performance_to_sign > 0 && <Chip n={counts.performance_to_sign} label={t('chips.performanceSign')} tone="warning" />}
      </div>

      {/* S18 (C-09): descargar mis ITR pendientes para trabajar sin red */}
      <PrepareOffline urls={[...queues.execute, ...queues.review].map(a => a.itrs!).filter(i => i.tags?.id)
        .map(i => `/projects/${i.project_id}/tags/${i.tags!.id}/itrs/${i.id}`)} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* ITRs por ejecutar */}
        <Queue title={t('queues.execute')} count={queues.execute.length} total={counts.itrs_execute} emptyText={t('empty.execute')} moreHref="/itrs" moreLabel={t('viewAll', { count: counts.itrs_execute })} limit={QUEUE_LIMIT}>
          {queues.execute.slice(0, QUEUE_LIMIT).map(a => {
            const itr = a.itrs!
            const style = ITR_STYLE[itr.status] ?? ITR_STYLE.not_started
            return (
              <Row key={itr.id} href={`/projects/${itr.project_id}/tags/${itr.tags?.id}/itrs/${itr.id}`} stripe={style.color}
                tag={<OfflineReadyChip url={`/projects/${itr.project_id}/tags/${itr.tags?.id}/itrs/${itr.id}`} />}
                code={itr.itr_number}
                phase={itr.project_phases}
                what={itr.tags ? `${itr.tags.tag_number} — ${itr.tags.description}` : itr.itr_number}
                project={itr.projects?.code}
                right={itr.status === 'completed' ? <Pill tone="success">{t('due.signPending')}</Pill>
                  : itr.status === 'rejected' ? <Pill tone="danger">{t('due.rejected')}</Pill>
                  : itr.status === 'in_progress' ? <Pill tone="info">{t('due.inProgress', { pct: Math.round(itr.progress_pct) })}</Pill>
                  : duePill(itr.scheduled_date, itr.project_id)}
              />
            )
          })}
        </Queue>

        {/* ITRs por revisar / firmar */}
        <Queue title={t('queues.review')} count={queues.review.length} total={counts.itrs_review} emptyText={t('empty.review')} moreHref="/itrs?status=completed" moreLabel={t('viewAll', { count: counts.itrs_review })} limit={QUEUE_LIMIT}>
          {queues.review.slice(0, QUEUE_LIMIT).map(a => {
            const itr = a.itrs!
            return (
              <Row key={itr.id} href={`/projects/${itr.project_id}/tags/${itr.tags?.id}/itrs/${itr.id}`} stripe={ITR_STYLE.completed.color}
                tag={<OfflineReadyChip url={`/projects/${itr.project_id}/tags/${itr.tags?.id}/itrs/${itr.id}`} />}
                code={itr.itr_number}
                phase={itr.project_phases}
                what={`${itr.tags ? `${itr.tags.tag_number} — ${itr.tags.description}` : ''}${itr.completed_date ? ` · ${t('completedOn', { date: fmt(itr.completed_date) })}` : ''}`}
                project={itr.projects?.code}
                right={<Pill tone="success">{a.role === 'client' ? t('due.sign') : t('due.readyToApprove')}</Pill>}
              />
            )
          })}
        </Queue>

        {/* Punches asignados */}
        <Queue title={t('queues.punches')} count={myPunches.length} total={counts.punches} emptyText={t('empty.punches')} moreHref="/punch-list" moreLabel={t('viewAll', { count: counts.punches })} limit={QUEUE_LIMIT}>
          {myPunches.slice(0, QUEUE_LIMIT).map(p => {
            const cat = CATEGORY_CFG[p.category]
            const pStyle = PUNCH_STYLE[p.status] ?? PUNCH_STYLE.open
            return (
              <Row key={p.id} href={`/projects/${p.project_id}/punches`} stripe={cat.color}
                code={p.punch_number}
                tag={<span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: cat.bg, color: cat.color, border: `1px solid ${cat.border}` }}>{cat.label}</span>}
                what={`${p.description}${p.tags?.tag_number ? ` · ${p.tags.tag_number}` : ''}`}
                project={p.projects?.code}
                right={p.target_date ? duePill(p.target_date, p.project_id) : <Pill tone={p.status === 'in_progress' ? 'info' : 'neutral'} style={{ background: pStyle.bg, color: pStyle.color }}>{t(`punchStatus.${p.status}`)}</Pill>}
              />
            )
          })}
        </Queue>

        {/* Punch por verificar en campo (fase 4) */}
        <Queue title={t('queues.punchesVerify')} count={Math.min(verifyRows.length, QUEUE_LIMIT)} total={counts.punches_verify} emptyText={t('empty.punchesVerify')} moreHref="/punch-list?status=in_progress" moreLabel={t('viewAll', { count: counts.punches_verify })} limit={QUEUE_LIMIT}>
          {verifyRows.slice(0, QUEUE_LIMIT).map(p => {
            const cat = CATEGORY_CFG[p.category]
            return (
              <Row key={p.id} href={`/projects/${p.project_id}/punches?q=${encodeURIComponent(p.punch_number)}`} stripe="#7c3aed"
                code={p.punch_number}
                tag={<span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: cat.bg, color: cat.color, border: `1px solid ${cat.border}` }}>{cat.label}</span>}
                what={`${p.description}${p.tags?.tag_number ? ` · ${p.tags.tag_number}` : ''}`}
                project={p.projects?.code}
                right={<Pill tone="info" style={{ background: '#f5f3ff', color: '#7c3aed' }}>{t('due.verify')}</Pill>}
              />
            )
          })}
        </Queue>

        {/* Categoría por revisar (supervisores, fase 4) */}
        {oversight && (
          <Queue title={t('queues.punchesReview')} count={Math.min(reviewRows.length, QUEUE_LIMIT)} total={counts.punches_review} emptyText={t('empty.punchesReview')} moreHref="/punch-list" moreLabel={t('viewAll', { count: counts.punches_review })} limit={QUEUE_LIMIT}>
            {reviewRows.slice(0, QUEUE_LIMIT).map(p => {
              const cat = CATEGORY_CFG[p.category]
              return (
                <Row key={p.id} href={`/projects/${p.project_id}/punches?q=${encodeURIComponent(p.punch_number)}`} stripe={cat.color}
                  code={p.punch_number}
                  tag={<span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: cat.bg, color: cat.color, border: `1px solid ${cat.border}` }}>{cat.label}</span>}
                  what={`${p.description}${p.tags?.tag_number ? ` · ${p.tags.tag_number}` : ''}`}
                  project={p.projects?.code}
                  right={<Pill tone="warning">{p.impact ? tGuide(`impact.${p.impact}`) : tGuide('noImpact')}</Pill>}
                />
              )
            })}
          </Queue>
        )}

        {/* Mis acciones (fase 5) */}
        <Queue title={t('queues.actions')} count={Math.min(actionRows.length, QUEUE_LIMIT)} total={counts.actions_mine} emptyText={t('empty.actions')} moreHref={dailyHref(actionRows[0]?.project_id, 'actions')} moreLabel={t('viewAll', { count: counts.actions_mine })} limit={QUEUE_LIMIT}>
          {actionRows.slice(0, QUEUE_LIMIT).map(a => (
            <Row key={a.id} href={`/projects/${a.project_id}/daily/action/${a.id}`} stripe={a.priority === 'critical' ? 'var(--danger-500)' : a.priority === 'high' ? 'var(--warning-600)' : 'var(--primary-500)'}
              code={a.number} what={a.title} project={a.projects?.code} right={duePill(a.due_date, a.project_id)} />
          ))}
        </Queue>

        {/* Acciones por verificar (fase 5): hechas por otros */}
        {role !== 'client' && (
          <Queue title={t('queues.actionsVerify')} count={Math.min(actionVerifyRows.length, QUEUE_LIMIT)} total={counts.actions_verify} emptyText={t('empty.actionsVerify')} moreHref={dailyHref(actionVerifyRows[0]?.project_id, 'actions')} moreLabel={t('viewAll', { count: counts.actions_verify })} limit={QUEUE_LIMIT}>
            {actionVerifyRows.slice(0, QUEUE_LIMIT).map(a => (
              <Row key={a.id} href={`/projects/${a.project_id}/daily/action/${a.id}`} stripe="#7c3aed"
                code={a.number} what={a.title} project={a.projects?.code}
                right={<Pill tone="info" style={{ background: '#f5f3ff', color: '#7c3aed' }}>{t('due.verify')}</Pill>} />
            ))}
          </Queue>
        )}

        {/* Hold points por liberar (fase 6) */}
        {counts.holds_to_release > 0 && (
          <Queue title={t('queues.holds')} count={Math.min(holdRows.length, QUEUE_LIMIT)} total={counts.holds_to_release} emptyText={t('empty.holds')} moreHref={holdRows[0] ? `/projects/${holdRows[0].project_id}/startup` : '/projects'} moreLabel={t('viewAll', { count: counts.holds_to_release })} limit={QUEUE_LIMIT}>
            {holdRows.slice(0, QUEUE_LIMIT).map(h => (
              <Row key={`${h.run_id}:${h.ord}`} href={`/projects/${h.project_id}/startup/runs/${h.run_id}`} stripe="#b45309"
                code={h.procedure_runs?.number ?? ''} what={`${h.ord}. ${h.procedure_steps?.action ?? ''}`} project={h.projects?.code}
                right={<Pill tone="warning">{t('due.release')}</Pill>} />
            ))}
          </Queue>
        )}

        {/* Hitos de arranque por atestiguar (fase 6, sesión 2) */}
        {counts.milestones_to_witness > 0 && (
          <Queue title={t('queues.milestones')} count={Math.min(milestoneRows.length, QUEUE_LIMIT)} total={counts.milestones_to_witness} emptyText={t('empty.milestones')} moreHref={milestoneRows[0] ? `/projects/${milestoneRows[0].project_id}/startup/events` : '/projects'} moreLabel={t('viewAll', { count: counts.milestones_to_witness })} limit={QUEUE_LIMIT}>
            {milestoneRows.slice(0, QUEUE_LIMIT).map(m => (
              <Row key={m.id} href={`/projects/${m.project_id}/startup/events/${m.id}`} stripe="#7c3aed"
                code={m.number} what={`${m.title}${m.systems?.code ? ` · ${m.systems.code}` : ''}`} project={m.projects?.code}
                right={<Pill tone="warning">{t('due.witness')}</Pill>} />
            ))}
          </Queue>
        )}

        {/* Traspasos de propiedad por firmar (fase 6, sesión 3) */}
        {counts.transfers_to_sign > 0 && (
          <Queue title={t('queues.transfers')} count={Math.min(transferRows.length, QUEUE_LIMIT)} total={counts.transfers_to_sign} emptyText={t('empty.transfers')} moreHref={transferRows[0] ? `/projects/${transferRows[0].project_id}/startup/operations` : '/projects'} moreLabel={t('viewAll', { count: counts.transfers_to_sign })} limit={QUEUE_LIMIT}>
            {transferRows.slice(0, QUEUE_LIMIT).map(x => (
              <Row key={x.id} href={`/projects/${x.project_id}/startup/transfers/${x.id}`} stripe="#047857"
                code={x.number} what={`${x.systems?.code ?? ''} → ${tStartup(`ops.stage.${x.to_stage}`)}${x.is_reversal ? ` (${tStartup('ops.reversal')})` : ''}`} project={x.projects?.code}
                right={<Pill tone="warning">{t('due.sign')}</Pill>} />
            ))}
          </Queue>
        )}

        {/* Pruebas de desempeño: resultados por registrar y PTC por firmar (fase 7) */}
        {counts.performance_to_decide > 0 && (
          <Queue title={t('queues.performanceDecide')} count={Math.min(perfDecideRows.length, QUEUE_LIMIT)} total={counts.performance_to_decide} emptyText={t('empty.performanceDecide')} moreHref={perfDecideRows[0] ? `/projects/${perfDecideRows[0].project_id}/startup/performance` : '/projects'} moreLabel={t('viewAll', { count: counts.performance_to_decide })} limit={QUEUE_LIMIT}>
            {perfDecideRows.slice(0, QUEUE_LIMIT).map(x => (
              <Row key={x.id} href={`/projects/${x.project_id}/startup/performance/runs/${x.id}`} stripe="#b45309"
                code={x.number} what={x.performance_tests?.title ?? ''} project={x.projects?.code}
                right={<Pill tone="warning">{t('due.decide')}</Pill>} />
            ))}
          </Queue>
        )}
        {counts.performance_to_sign > 0 && (
          <Queue title={t('queues.performanceSign')} count={Math.min(perfSignRows.length, QUEUE_LIMIT)} total={counts.performance_to_sign} emptyText={t('empty.performanceSign')} moreHref={perfSignRows[0] ? `/projects/${perfSignRows[0].project_id}/startup/performance` : '/projects'} moreLabel={t('viewAll', { count: counts.performance_to_sign })} limit={QUEUE_LIMIT}>
            {perfSignRows.slice(0, QUEUE_LIMIT).map(x => (
              <Row key={x.id} href={`/projects/${x.project_id}/startup/performance/runs/${x.run_id}`} stripe="#047857"
                code={x.number} what={x.systems?.code ?? ''} project={x.projects?.code}
                right={<Pill tone="warning">{t('due.sign')}</Pill>} />
            ))}
          </Queue>
        )}

        {/* Filas críticas de line-up por verificar (fase 6) */}
        {counts.lineup_to_verify > 0 && (
          <Queue title={t('queues.lineup')} count={Math.min(lineupRows.length, QUEUE_LIMIT)} total={counts.lineup_to_verify} emptyText={t('empty.lineup')} moreHref={lineupRows[0] ? `/projects/${lineupRows[0].project_id}/startup?tab=lineups` : '/projects'} moreLabel={t('viewAll', { count: counts.lineup_to_verify })} limit={QUEUE_LIMIT}>
            {lineupRows.slice(0, QUEUE_LIMIT).map(i => (
              <Row key={i.id} href={`/projects/${i.project_id}/startup/lineups/${i.sheet_id}`} stripe="#1d4ed8"
                code={i.lineup_sheets?.number ?? ''} what={i.tags?.tag_number ?? i.label ?? ''} project={i.projects?.code}
                right={<Pill tone="info">{t('due.verify')}</Pill>} />
            ))}
          </Queue>
        )}

        {/* Relevos de turno por recibir (fase 5, sesión 3) */}
        {role !== 'client' && (
          <Queue title={t('queues.handovers')} count={Math.min(handoverRows.length, QUEUE_LIMIT)} total={counts.handovers_to_receive} emptyText={t('empty.handovers')} moreHref={handoverRows[0] ? `/projects/${handoverRows[0].project_id}/daily/handovers` : '/projects'} moreLabel={t('viewAll', { count: counts.handovers_to_receive })} limit={QUEUE_LIMIT}>
            {handoverRows.slice(0, QUEUE_LIMIT).map(h => (
              <Row key={h.id} href={`/projects/${h.project_id}/daily/handovers/${h.id}`} stripe="#1d4ed8"
                code={h.number} what={`${h.shift_date} · ${t(`shift.${h.shift_label}`)}`} project={h.projects?.code}
                right={<Pill tone="info">{t('due.receive')}</Pill>} />
            ))}
          </Queue>
        )}

        {/* Mis restricciones (fase 5): vencidas → sugerir escalar */}
        <Queue title={t('queues.constraints')} count={Math.min(constraintRows.length, QUEUE_LIMIT)} total={counts.constraints_mine} emptyText={t('empty.constraints')} moreHref={dailyHref(constraintRows[0]?.project_id, 'constraints')} moreLabel={t('viewAll', { count: counts.constraints_mine })} limit={QUEUE_LIMIT}>
          {constraintRows.slice(0, QUEUE_LIMIT).map(c => (
            <Row key={c.id} href={`/projects/${c.project_id}/daily/constraint/${c.id}`} stripe={c.escalation_level >= 4 ? 'var(--danger-500)' : c.escalation_level >= 3 ? 'var(--warning-600)' : 'var(--primary-500)'}
              code={c.number}
              tag={<span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--gray-100)', color: 'var(--text-strong)' }}>{t('constraintLevel', { n: c.escalation_level })}</span>}
              what={`${c.title}${c.systems?.code ? ` · ${c.systems.code}` : ''}`}
              project={c.projects?.code}
              right={dueState(c.need_date, todayOf(c.project_id)) === 'overdue'
                ? <Pill tone="danger">{t('due.escalate', { days: daysOverdue(c.need_date, todayOf(c.project_id)) })}</Pill>
                : duePill(c.need_date, c.project_id)} />
          ))}
        </Queue>

        {/* Plan de trabajo */}
        <Queue title={t('queues.plan')} count={Math.min(plan.length, QUEUE_LIMIT)} total={counts.plan_items} emptyText={t('empty.plan')} moreHref="/work-plans" moreLabel={t('viewAll', { count: counts.plan_items })} limit={QUEUE_LIMIT}>
          {plan.slice(0, QUEUE_LIMIT).map(item => (
            <Row key={item.id} href={`/projects/${item.work_plans?.project_id}/work-plans`} stripe="var(--primary-500)"
              code={item.itrs?.itr_number ?? '—'}
              what={item.title ?? item.itrs?.tags?.tag_number ?? ''}
              project={item.work_plans?.projects?.code}
              right={duePill(item.planned_finish ?? item.work_plans?.plan_date, item.work_plans?.project_id)}
            />
          ))}
        </Queue>

        {/* Firmas de certificados (solo firmantes) */}
        {signer && (
          <Queue title={t('queues.signatures')} count={Math.min(pendingCerts.length, QUEUE_LIMIT)} total={counts.signatures} emptyText={t('empty.signatures')} moreHref="/certificates" moreLabel={t('viewAll', { count: counts.signatures })} limit={QUEUE_LIMIT}>
            {pendingCerts.slice(0, QUEUE_LIMIT).map(c => (
              <Row key={c.id} href={`/projects/${c.project_id}/certificates/${c.id}`} stripe="var(--accent-500)"
                code={c.certificate_number}
                what={`${c.title}${c.issued_date ? ` · ${t('issuedOn', { date: fmt(c.issued_date) })}` : ''}`}
                project={c.projects?.code}
                right={<Pill tone="info">{t('due.sign')}</Pill>}
              />
            ))}
          </Queue>
        )}

        {/* Preservación vencida (leader+) */}
        {oversight && (
          <Queue title={t('queues.preservation')} count={Math.min(overduePres.length, QUEUE_LIMIT)} total={counts.preservation_overdue} emptyText={t('empty.preservation')} moreHref="/preservation" moreLabel={t('viewAll', { count: counts.preservation_overdue })} limit={QUEUE_LIMIT}>
            {overduePres.slice(0, QUEUE_LIMIT).map(p => (
              <Row key={p.id} href={`/projects/${p.project_id}/tags/${p.tags?.id}`} stripe="var(--danger-500)"
                code={p.tags?.tag_number ?? '—'}
                what={`${p.preservation_procedures?.code ?? ''} ${p.preservation_procedures?.title ?? ''}`.trim()}
                project={p.projects?.code}
                right={<Pill tone="danger">{t('due.overdueDays', { days: daysOverdue(p.next_due_date, todayOf(p.project_id)) })}</Pill>}
              />
            ))}
          </Queue>
        )}
      </div>
    </div>
  )
}

/* ── Piezas de presentación (mismo lenguaje visual que los widgets del Dashboard) ── */

type Tone = 'danger' | 'warning' | 'info' | 'success' | 'neutral'
const TONE: Record<Tone, { bg: string; fg: string }> = {
  danger:  { bg: 'var(--danger-50)',  fg: 'var(--danger-500)' },
  warning: { bg: 'var(--warning-50)', fg: 'var(--warning-600)' },
  info:    { bg: 'var(--primary-50)', fg: 'var(--primary-500)' },
  success: { bg: 'var(--success-50)', fg: 'var(--success-500)' },
  neutral: { bg: 'var(--gray-100)',   fg: 'var(--gray-500)' },
}

function Chip({ n, label, tone }: { n: number; label: string; tone: Tone }) {
  const c = TONE[tone]
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 'var(--radius-md)', background: 'var(--card-bg)', border: `1px solid ${n > 0 ? c.fg + '55' : 'var(--border)'}` }}>
      <span style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: n > 0 ? c.fg : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{n}</span>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{label}</span>
    </div>
  )
}

function Pill({ tone, children, style }: { tone: Tone; children: React.ReactNode; style?: React.CSSProperties }) {
  const c = TONE[tone]
  return <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: c.bg, color: c.fg, whiteSpace: 'nowrap', ...style }}>{children}</span>
}

function Queue({ title, count, total, emptyText, moreHref, moreLabel, limit, children }: {
  title: string; count: number; total: number; emptyText: string; moreHref: string; moreLabel: string; limit: number; children: React.ReactNode
}) {
  return (
    <section style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--gray-100)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-strong)', margin: 0 }}>{title}</h2>
        {total > 0 && <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, background: 'var(--gray-100)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: 'var(--radius-pill)', fontVariantNumeric: 'tabular-nums' }}>{total}</span>}
      </div>
      {count === 0 ? (
        <p style={{ padding: '22px 18px', textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--gray-400)', margin: 0 }}>{emptyText}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px' }}>{children}</div>
      )}
      {total > limit && (
        <Link href={moreHref} style={{ display: 'block', padding: '9px 18px', borderTop: '1px solid var(--gray-100)', fontSize: 'var(--text-sm)', color: 'var(--primary-500)', fontWeight: 600, textDecoration: 'none' }}>
          {moreLabel}
        </Link>
      )}
    </section>
  )
}

function Row({ href, stripe, code, phase, tag, what, project, right }: {
  href: string; stripe: string; code: string
  phase?: { code: string; color: string } | null
  tag?: React.ReactNode
  what: string; project?: string | null; right?: React.ReactNode
}) {
  return (
    <Link href={href} style={{ display: 'block', textDecoration: 'none' }}>
      <div style={{ padding: '10px 14px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderLeft: `3px solid ${stripe}`, borderRadius: 'var(--radius-md)', display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
            {phase && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: `${phase.color}18`, color: phase.color }}>{phase.code}</span>}
            {tag}
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace' }}>{code}</span>
            {project && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent-700)', background: 'var(--accent-50)', padding: '1px 6px', borderRadius: 'var(--radius-sm)', fontFamily: 'ui-monospace, monospace' }}>{project}</span>}
          </div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-700)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{what}</div>
        </div>
        {right}
      </div>
    </Link>
  )
}
