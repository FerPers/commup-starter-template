import { dailyTabHref, startupTabHref } from '@/lib/navigation/hub-routes'
import Link from 'next/link'
import PrepareOffline, { OfflineReadyChip } from '@/components/offline/PrepareOffline'
import MyWorkBoard, { type BoardGroup } from './MyWorkBoard'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { canReleaseHold, signableCapacities, type HoldCapacity } from '@/lib/startup/catalog'
import { loadMyCapacitiesByProject } from '@/lib/capacities/server'
import { fallbackCapacities } from '@/lib/constants/capacities'
import { canSignCertificate, isPerformanceLead, type CertSigners } from '@/lib/performance/catalog'
import { getActiveMembership, getMyWorkCounts } from '@/lib/supabase/membership'
import { CATEGORY_CFG, ITR_STYLE, PUNCH_STYLE } from '@/components/dashboard/widgets/_shared'
import {
  badgeTotal, canSignCertificates, chipGroups, daysOverdue, dueState, parseCounts, seesPreservation, sortPunches, splitAssignments,
  type AssignmentRow, type DueState, type MyWorkCounts, type ReadinessQueue,
} from '@/lib/my-work/queues'
import { greetingName } from '@/lib/utils'
import type { OrgMemberRole } from '@/types/database'
import { fetchAllRowsFlagged } from '@/lib/list/fetch-all'
import { DEFAULT_TIMEZONE, latestPossibleToday } from '@/lib/time/zone'
import { projectTodayFn } from '@/lib/time/project-zones'
import { ink } from '@/lib/theme'

export const dynamic = 'force-dynamic'

/** Máximo de filas por cola en pantalla; el resto se ve en la lista del módulo. */
const QUEUE_LIMIT = 20

/** Etiqueta (chips/queues/empty) de cada contador. */
const CHIP_LABEL: Record<keyof MyWorkCounts, string> = {
  itrs_execute: 'execute', itrs_review: 'review', punches: 'punches', plan_items: 'plan', signatures: 'signatures',
  preservation_overdue: 'preservation', punches_verify: 'punchesVerify', punches_review: 'punchesReview', actions_mine: 'actions',
  actions_verify: 'actionsVerify', constraints_mine: 'constraints', handovers_to_receive: 'handovers', holds_to_release: 'holds',
  lineup_to_verify: 'lineup', milestones_to_witness: 'milestones', transfers_to_sign: 'transfers',
  performance_to_decide: 'performanceDecide', performance_to_sign: 'performanceSign',
  gates_to_approve: 'gatesApprove', gates_to_cosign: 'gatesCosign', gates_regressed: 'gatesRegressed',
  registers_to_authorize: 'registersAuthorize', registers_to_verify: 'registersVerify', daily_reports_to_issue: 'dailyReports',
  tq_answered: 'tqAnswered',
}

type ReadinessRow = { project_id: string; entity_id: string; system_id: string | null }
/** S22: cómo se muestra cada cola de readiness (orden = orden en la página). */
const READINESS_SECTIONS: { queue: ReadinessQueue; due: string; tone: Tone; stripe: string; href: (r: ReadinessRow) => string; more: (r?: ReadinessRow) => string }[] = [
  { queue: 'gates_to_cosign', due: 'cosign', tone: 'warning', stripe: 'var(--success-700)', href: r => `/projects/${r.project_id}/systems/${r.system_id}`, more: r => (r ? `/projects/${r.project_id}/readiness?state=signing` : '/dashboard') },
  { queue: 'gates_to_approve', due: 'approve', tone: 'success', stripe: 'var(--success-700)', href: r => `/projects/${r.project_id}/systems/${r.system_id}?gate=${r.entity_id}`, more: r => (r ? `/projects/${r.project_id}/readiness?state=ready` : '/dashboard') },
  { queue: 'gates_regressed', due: 'review', tone: 'danger', stripe: 'var(--danger-500)', href: r => `/projects/${r.project_id}/systems/${r.system_id}?gate=${r.entity_id}`, more: r => (r ? `/projects/${r.project_id}/readiness?state=regressed` : '/dashboard') },
  { queue: 'registers_to_authorize', due: 'authorize', tone: 'warning', stripe: 'var(--warning-700)', href: r => `/projects/${r.project_id}/registers/${r.entity_id}`, more: r => (r ? `/projects/${r.project_id}/registers` : '/projects') },
  { queue: 'registers_to_verify', due: 'verify', tone: 'info', stripe: 'var(--violet-600)', href: r => `/projects/${r.project_id}/registers/${r.entity_id}`, more: r => (r ? `/projects/${r.project_id}/registers` : '/projects') },
  { queue: 'daily_reports_to_issue', due: 'issue', tone: 'warning', stripe: 'var(--primary-500)', href: r => `/projects/${r.project_id}/daily/reports/${r.entity_id}`, more: r => (r ? `/projects/${r.project_id}/daily/reports` : '/projects') },
  { queue: 'tq_answered', due: 'close', tone: 'info', stripe: 'var(--primary-700)', href: r => `/projects/${r.project_id}/daily/tq/${r.entity_id}`, more: r => (r ? dailyTabHref(r.project_id, 'tqs') : '/projects') },
]

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

export default async function MyWorkPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
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
    supabase.from('projects').select('id, code, name, timezone').eq('org_id', orgId).order('code'),
  ])
  // N1: filtro de proyecto (?project=, no se recuerda). Con filtro, las consultas van solo a ese proyecto.
  const requested = (await searchParams).project
  const filterProject = requested && (projects ?? []).some(p => p.id === requested) ? requested : null
  const projectIds = filterProject ? [filterProject] : (projects ?? []).map(p => p.id)
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
  const [{ data: countsRaw }, { data: assignments }, { data: punches }, { data: planItems }, { data: certs }, { data: preservation }, { data: toVerify }, { data: toReview }, { data: myActions }, { data: actionsVerify }, { data: myConstraints }, { data: handovers }, { data: holds }, { data: lineupItems }, { data: pendingMilestones }, { data: pendingTransfers }, { data: perfToDecide }, { data: perfCerts }, { data: readinessRaw }] = await Promise.all([
    getMyWorkCounts(orgId).then(data => ({ data })),
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
    // S22 (D-04/H-02): colas de readiness, la misma función SQL que cuenta my_work_counts.
    supabase.rpc('my_readiness_items', { p_org_id: orgId }),
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
    // D-23: misma regla que my_work_counts (solo ejecuciones detenidas en el hold o paradas).
    return !!cap && ['at_hold', 'stopped'].includes(h.procedure_runs?.status ?? '') && canReleaseHold(capsOf(h.project_id), cap, userId, null)
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
  const dailyHref = (projectId: string | undefined, tab: 'actions' | 'constraints') => (projectId ? dailyTabHref(projectId, tab) : '/projects')

  const projectsInvolved = new Set<string>([
    ...queues.execute.map(r => r.itrs!.project_id),
    ...queues.review.map(r => r.itrs!.project_id),
    ...myPunches.map(p => p.project_id),
    ...plan.map(p => p.work_plans?.project_id ?? ''),
    ...(signer ? pendingCerts.map(c => c.project_id) : []),
    ...actionRows.map(a => a.project_id),
    ...constraintRows.map(c => c.project_id),
  ].filter(Boolean))
  // D-23: el mismo total que el badge del sidebar.
  const personalTotal = badgeTotal(counts, role)  // con filtro de proyecto se recalcula abajo con las filas
  type ReadinessItem = { queue: ReadinessQueue; project_id: string; entity_id: string; ref: string | null; title: string | null; system_id: string | null; system_code: string | null; since: string | null }
  const readiness = ((readinessRaw ?? []) as ReadinessItem[]).filter(r => projectSet.has(r.project_id))
  const projectCode = new Map((projects ?? []).map(p => [p.id, p.code]))
  const readinessOf = (q: ReadinessQueue) => readiness.filter(r => r.queue === q)
    .sort((a, b) => (a.since ?? '').localeCompare(b.since ?? ''))

  const firstName = greetingName(profile?.full_name, ctx.userEmail)
  const dateLocale = locale === 'en' ? 'en-US' : 'es-ES'
  const todayRaw = new Date().toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: headerTz })
  // Solo la primera letra: `textTransform: capitalize` daba «Jueves, 22 De Octubre».
  const todayLabel = todayRaw.charAt(0).toUpperCase() + todayRaw.slice(1)
  const roleLabel = t(`roles.${role}`)
  const fmt = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })

  const duePill = (date: string | null | undefined, projectId: string | null | undefined, opts?: { doneLabel?: string }) => {
    const state: DueState = dueState(date, todayOf(projectId ?? ''))
    if (!date || !state) return opts?.doneLabel ? <Pill tone="info">{opts.doneLabel}</Pill> : null
    if (state === 'overdue') return <Pill tone="danger">{t('due.overdue', { date: fmt(date) })}</Pill>
    if (state === 'today') return <Pill tone="warning">{t('due.today')}</Pill>
    return <Pill tone="neutral">{t('due.scheduled', { date: fmt(date) })}</Pill>
  }

  const catTag = (c: PunchRow['category']) => {
    const cat = CATEGORY_CFG[c]
    return <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: cat.bg, color: cat.color, border: `1px solid ${cat.border}` }}>{cat.label}</span>
  }
  const itrHref = (itr: NonNullable<AssignmentRow['itrs']>) => `/projects/${itr.project_id}/tags/${itr.tags?.id}/itrs/${itr.id}`
  const verifyPill = <Pill tone="info" style={{ background: 'var(--violet-50)', color: 'var(--violet-600)' }}>{t('due.verify')}</Pill>
  const readinessQueue = (sec: typeof READINESS_SECTIONS[number]) => {
    const rows = readinessOf(sec.queue)
    return {
      more: sec.more(rows[0]),
      rows: rows.map(r => (
        <Row key={`${r.entity_id}:${r.system_id ?? ''}`} href={sec.href(r)} stripe={sec.stripe}
          code={r.system_code ? `${r.system_code}${sec.queue.startsWith('gates_') && r.ref ? ` · ${r.ref}` : ''}` : (r.ref ?? '')}
          what={sec.queue.startsWith('gates_') ? '' : `${r.system_code && r.ref ? `${r.ref} · ` : ''}${r.title ?? ''}`}
          project={projectCode.get(r.project_id)}
          right={<Pill tone={sec.tone}>{t(`due.${sec.queue === 'gates_regressed' ? (r.title === 'regressed' ? 'regressed' : 'needsReview') : sec.due}`)}</Pill>} />
      )),
    }
  }

  /** N1: filas de cada cola (ya renderizadas aquí; el tablero cliente solo decide qué mostrar). */
  const QUEUES: Record<keyof MyWorkCounts, { rows: React.ReactNode[]; more: string }> = {
    itrs_execute: { more: '/itrs?assignee=me', rows: queues.execute.map(a => {
      const itr = a.itrs!
      const style = ITR_STYLE[itr.status] ?? ITR_STYLE.not_started
      return (
        <Row key={itr.id} href={itrHref(itr)} stripe={style.color} tag={<OfflineReadyChip url={itrHref(itr)} />}
          code={itr.itr_number} phase={itr.project_phases}
          what={itr.tags ? `${itr.tags.tag_number} — ${itr.tags.description}` : itr.itr_number}
          project={itr.projects?.code}
          right={itr.status === 'completed' ? <Pill tone="success">{t('due.signPending')}</Pill>
            : itr.status === 'rejected' ? <Pill tone="danger">{t('due.rejected')}</Pill>
            : itr.status === 'in_progress' ? <Pill tone="info">{t('due.inProgress', { pct: Math.round(itr.progress_pct) })}</Pill>
            : duePill(itr.scheduled_date, itr.project_id)} />
      )
    }) },
    itrs_review: { more: '/itrs?status=completed', rows: queues.review.map(a => {
      const itr = a.itrs!
      return (
        <Row key={itr.id} href={itrHref(itr)} stripe={ITR_STYLE.completed.color} tag={<OfflineReadyChip url={itrHref(itr)} />}
          code={itr.itr_number} phase={itr.project_phases}
          what={`${itr.tags ? `${itr.tags.tag_number} — ${itr.tags.description}` : ''}${itr.completed_date ? ` · ${t('completedOn', { date: fmt(itr.completed_date) })}` : ''}`}
          project={itr.projects?.code}
          right={<Pill tone="success">{a.role === 'client' ? t('due.sign') : t('due.readyToApprove')}</Pill>} />
      )
    }) },
    punches: { more: '/punch-list?assigned=me', rows: myPunches.map(p => {
      const pStyle = PUNCH_STYLE[p.status] ?? PUNCH_STYLE.open
      return (
        <Row key={p.id} href={`/projects/${p.project_id}/punches/${p.id}`} stripe={CATEGORY_CFG[p.category].color}
          code={p.punch_number} tag={catTag(p.category)}
          what={`${p.description}${p.tags?.tag_number ? ` · ${p.tags.tag_number}` : ''}`} project={p.projects?.code}
          right={p.target_date ? duePill(p.target_date, p.project_id) : <Pill tone={p.status === 'in_progress' ? 'info' : 'neutral'} style={{ background: pStyle.bg, color: pStyle.color }}>{t(`punchStatus.${p.status}`)}</Pill>} />
      )
    }) },
    punches_verify: { more: '/punch-list?status=in_progress', rows: verifyRows.map(p => (
      <Row key={p.id} href={`/projects/${p.project_id}/punches/${p.id}`} stripe="var(--violet-600)"
        code={p.punch_number} tag={catTag(p.category)}
        what={`${p.description}${p.tags?.tag_number ? ` · ${p.tags.tag_number}` : ''}`} project={p.projects?.code} right={verifyPill} />
    )) },
    punches_review: { more: '/punch-list', rows: reviewRows.map(p => (
      <Row key={p.id} href={`/projects/${p.project_id}/punches/${p.id}`} stripe={CATEGORY_CFG[p.category].color}
        code={p.punch_number} tag={catTag(p.category)}
        what={`${p.description}${p.tags?.tag_number ? ` · ${p.tags.tag_number}` : ''}`} project={p.projects?.code}
        right={<Pill tone="warning">{p.impact ? tGuide(`impact.${p.impact}`) : tGuide('noImpact')}</Pill>} />
    )) },
    actions_mine: { more: dailyHref(actionRows[0]?.project_id, 'actions'), rows: actionRows.map(a => (
      <Row key={a.id} href={`/projects/${a.project_id}/daily/action/${a.id}`} stripe={a.priority === 'critical' ? 'var(--danger-500)' : a.priority === 'high' ? 'var(--warning-600)' : 'var(--primary-500)'}
        code={a.number} what={a.title} project={a.projects?.code} right={duePill(a.due_date, a.project_id)} />
    )) },
    actions_verify: { more: dailyHref(actionVerifyRows[0]?.project_id, 'actions'), rows: actionVerifyRows.map(a => (
      <Row key={a.id} href={`/projects/${a.project_id}/daily/action/${a.id}`} stripe="var(--violet-600)" code={a.number} what={a.title} project={a.projects?.code} right={verifyPill} />
    )) },
    holds_to_release: { more: holdRows[0] ? `/projects/${holdRows[0].project_id}/startup` : '/projects', rows: holdRows.map(h => (
      <Row key={`${h.run_id}:${h.ord}`} href={`/projects/${h.project_id}/startup/runs/${h.run_id}`} stripe="var(--warning-700)"
        code={h.procedure_runs?.number ?? ''} what={`${h.ord}. ${h.procedure_steps?.action ?? ''}`} project={h.projects?.code}
        right={<Pill tone="warning">{t('due.release')}</Pill>} />
    )) },
    milestones_to_witness: { more: milestoneRows[0] ? `/projects/${milestoneRows[0].project_id}/startup/events` : '/projects', rows: milestoneRows.map(m => (
      <Row key={m.id} href={`/projects/${m.project_id}/startup/events/${m.id}`} stripe="var(--violet-600)"
        code={m.number} what={`${m.title}${m.systems?.code ? ` · ${m.systems.code}` : ''}`} project={m.projects?.code}
        right={<Pill tone="warning">{t('due.witness')}</Pill>} />
    )) },
    transfers_to_sign: { more: transferRows[0] ? `/projects/${transferRows[0].project_id}/startup/operations` : '/projects', rows: transferRows.map(x => (
      <Row key={x.id} href={`/projects/${x.project_id}/startup/transfers/${x.id}`} stripe="var(--success-700)"
        code={x.number} what={`${x.systems?.code ?? ''} → ${tStartup(`ops.stage.${x.to_stage}`)}${x.is_reversal ? ` (${tStartup('ops.reversal')})` : ''}`} project={x.projects?.code}
        right={<Pill tone="warning">{t('due.sign')}</Pill>} />
    )) },
    performance_to_decide: { more: perfDecideRows[0] ? `/projects/${perfDecideRows[0].project_id}/startup/performance` : '/projects', rows: perfDecideRows.map(x => (
      <Row key={x.id} href={`/projects/${x.project_id}/startup/performance/runs/${x.id}`} stripe="var(--warning-700)"
        code={x.number} what={x.performance_tests?.title ?? ''} project={x.projects?.code} right={<Pill tone="warning">{t('due.decide')}</Pill>} />
    )) },
    performance_to_sign: { more: perfSignRows[0] ? `/projects/${perfSignRows[0].project_id}/startup/performance` : '/projects', rows: perfSignRows.map(x => (
      <Row key={x.id} href={`/projects/${x.project_id}/startup/performance/runs/${x.run_id}`} stripe="var(--success-700)"
        code={x.number} what={x.systems?.code ?? ''} project={x.projects?.code} right={<Pill tone="warning">{t('due.sign')}</Pill>} />
    )) },
    lineup_to_verify: { more: lineupRows[0] ? startupTabHref(lineupRows[0].project_id, 'lineups') : '/projects', rows: lineupRows.map(i => (
      <Row key={i.id} href={`/projects/${i.project_id}/startup/lineups/${i.sheet_id}`} stripe="var(--primary-700)"
        code={i.lineup_sheets?.number ?? ''} what={i.tags?.tag_number ?? i.label ?? ''} project={i.projects?.code} right={<Pill tone="info">{t('due.verify')}</Pill>} />
    )) },
    handovers_to_receive: { more: handoverRows[0] ? `/projects/${handoverRows[0].project_id}/daily/handovers` : '/projects', rows: handoverRows.map(h => (
      <Row key={h.id} href={`/projects/${h.project_id}/daily/handovers/${h.id}`} stripe="var(--primary-700)"
        code={h.number} what={`${h.shift_date} · ${t(`shift.${h.shift_label}`)}`} project={h.projects?.code} right={<Pill tone="info">{t('due.receive')}</Pill>} />
    )) },
    constraints_mine: { more: dailyHref(constraintRows[0]?.project_id, 'constraints'), rows: constraintRows.map(c => (
      <Row key={c.id} href={`/projects/${c.project_id}/daily/constraint/${c.id}`} stripe={c.escalation_level >= 4 ? 'var(--danger-500)' : c.escalation_level >= 3 ? 'var(--warning-600)' : 'var(--primary-500)'}
        code={c.number}
        tag={<span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--gray-100)', color: 'var(--text-strong)' }}>{t('constraintLevel', { n: c.escalation_level })}</span>}
        what={`${c.title}${c.systems?.code ? ` · ${c.systems.code}` : ''}`} project={c.projects?.code}
        right={dueState(c.need_date, todayOf(c.project_id)) === 'overdue'
          ? <Pill tone="danger">{t('due.escalate', { days: daysOverdue(c.need_date, todayOf(c.project_id)) })}</Pill>
          : duePill(c.need_date, c.project_id)} />
    )) },
    plan_items: { more: '/work-plans', rows: plan.map(item => (
      <Row key={item.id} href={`/projects/${item.work_plans?.project_id}/work-plans`} stripe="var(--primary-500)"
        code={item.itrs?.itr_number ?? '—'} what={item.title ?? item.itrs?.tags?.tag_number ?? ''} project={item.work_plans?.projects?.code}
        right={duePill(item.planned_finish ?? item.work_plans?.plan_date, item.work_plans?.project_id)} />
    )) },
    signatures: { more: '/certificates', rows: pendingCerts.map(c => (
      <Row key={c.id} href={`/projects/${c.project_id}/certificates/${c.id}`} stripe="var(--accent-500)"
        code={c.certificate_number} what={`${c.title}${c.issued_date ? ` · ${t('issuedOn', { date: fmt(c.issued_date) })}` : ''}`}
        project={c.projects?.code} right={<Pill tone="info">{t('due.sign')}</Pill>} />
    )) },
    preservation_overdue: { more: '/preservation', rows: overduePres.map(p => (
      <Row key={p.id} href={`/projects/${p.project_id}/tags/${p.tags?.id}?tab=preservation`} stripe="var(--danger-500)"
        code={p.tags?.tag_number ?? '—'} what={`${p.preservation_procedures?.code ?? ''} ${p.preservation_procedures?.title ?? ''}`.trim()}
        project={p.projects?.code} right={<Pill tone="danger">{t('due.overdueDays', { days: daysOverdue(p.next_due_date, todayOf(p.project_id)) })}</Pill>} />
    )) },
    ...Object.fromEntries(READINESS_SECTIONS.map(sec => [sec.queue, readinessQueue(sec)])) as Record<ReadinessQueue, { rows: React.ReactNode[]; more: string }>,
  }
  // Sin filtro: contador SQL (todos los proyectos). Con filtro de proyecto: las filas cargadas de ese proyecto.
  const shown: MyWorkCounts = filterProject
    ? Object.fromEntries(Object.entries(QUEUES).map(([k, q]) => [k, q.rows.length])) as MyWorkCounts
    : counts
  const boardGroups: BoardGroup[] = chipGroups(shown, role).map(g => ({
    group: g.group,
    label: t(`groups.${g.group}`),
    queues: g.chips.map(({ key, n }) => ({
      key, label: t(`queues.${CHIP_LABEL[key]}`), total: n, capped: !!filterProject && n > QUEUE_LIMIT,
      rows: QUEUES[key].rows.slice(0, QUEUE_LIMIT), moreHref: QUEUES[key].more,
    })),
  }))

  return (
    <div style={{ padding: 28, maxWidth: 1320 }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-strong)', letterSpacing: '-0.5px', margin: 0 }}>
          {firstName ? t('hello', { name: firstName }) : t('title')}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', margin: '4px 0 0' }}>
          <span>{todayLabel}</span>
          {' · '}{roleLabel}{' · '}
          {t('summary', { count: filterProject ? badgeTotal(shown, role) : personalTotal, projects: projectsInvolved.size })}
        </p>
      </header>

      {/* S18 (C-09): descargar mis ITR pendientes para trabajar sin red */}
      <PrepareOffline urls={[...queues.execute, ...queues.review].map(a => a.itrs!).filter(i => i.tags?.id)
        .map(i => `/projects/${i.project_id}/tags/${i.tags!.id}/itrs/${i.id}`)} />

      <MyWorkBoard groups={boardGroups} projects={(projects ?? []).map(p => ({ id: p.id, code: p.code, name: p.name }))} currentProject={filterProject}
        labels={{ all: t('board.all'), upToDate: t('board.upToDate'), upToDateHere: t('board.upToDateHere'), noPending: t('board.noPending'), seeAll: t.raw('board.seeAllN') as string, project: t('board.project'), allProjects: t('board.allProjects') }} />
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

function Pill({ tone, children, style }: { tone: Tone; children: React.ReactNode; style?: React.CSSProperties }) {
  const c = TONE[tone]
  return <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: c.bg, color: c.fg, whiteSpace: 'nowrap', ...style }}>{children}</span>
}

function Row({ href, stripe, code, phase, tag, what, project, right }: {
  href: string; stripe: string; code: string
  phase?: { code: string; color: string } | null
  tag?: React.ReactNode
  what: string; project?: string | null; right?: React.ReactNode
}) {
  return (
    <Link href={href} style={{ display: 'block', textDecoration: 'none' }}>
      <div style={{ padding: '10px 14px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderLeft: `3px solid ${stripe}`, borderRadius: 'var(--radius-md)', display: 'flex', flexWrap: 'wrap', gap: '6px 12px', alignItems: 'center' }}>
        <div style={{ minWidth: 0, flex: '1 1 160px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
            {phase && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: `${phase.color}18`, color: ink(phase.color) }}>{phase.code}</span>}
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
