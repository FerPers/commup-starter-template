import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { getActiveMembership } from '@/lib/supabase/membership'
import { CATEGORY_CFG, ITR_STYLE, PUNCH_STYLE } from '@/components/dashboard/widgets/_shared'
import {
  canSignCertificates, daysOverdue, dueState, parseCounts, seesPreservation, sortPunches, splitAssignments,
  type AssignmentRow, type DueState,
} from '@/lib/my-work/queues'
import { greetingName } from '@/lib/utils'
import type { OrgMemberRole } from '@/types/database'

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

  const [t, locale, { data: profile }, { data: projects }] = await Promise.all([
    getTranslations('MyWork'),
    getLocale(),
    supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
    supabase.from('projects').select('id, code').eq('org_id', orgId),
  ])
  const projectIds = (projects ?? []).map(p => p.id)
  const projectSet = new Set(projectIds)
  const today = new Date().toISOString().slice(0, 10)

  const none = Promise.resolve({ data: null })
  const [{ data: countsRaw }, { data: assignments }, { data: punches }, { data: planItems }, { data: certs }, { data: preservation }] = await Promise.all([
    supabase.rpc('my_work_counts', { p_org_id: orgId }),
    supabase
      .from('itr_assignments')
      .select('role, itrs(id, itr_number, status, progress_pct, scheduled_date, completed_date, project_id, tags(id, tag_number, description), projects(code), project_phases(code, color), itr_signatures(role))')
      .eq('user_id', userId),
    projectIds.length === 0 ? none : supabase
      .from('punches')
      .select('id, punch_number, category, description, status, target_date, project_id, projects(code), tags(tag_number)')
      .eq('assigned_to', userId)
      .in('status', ['open', 'in_progress'])
      .in('project_id', projectIds)
      .limit(200),
    projectIds.length === 0 ? none : supabase
      .from('work_plan_items')
      .select('id, title, status, planned_finish, work_plans!inner(plan_date, status, project_id, projects(code)), itrs(itr_number, tags(tag_number))')
      .eq('assigned_to', userId)
      .in('status', ['not_started', 'in_progress'])
      .in('work_plans.status', ['published', 'in_progress'])
      .lte('work_plans.plan_date', today)
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
      .lt('next_due_date', today)
      .in('project_id', projectIds)
      .order('next_due_date', { ascending: true })
      .limit(QUEUE_LIMIT + 1),
  ])

  const counts = parseCounts(countsRaw)
  const queues = splitAssignments((assignments ?? []) as unknown as AssignmentRow[], projectSet)
  const myPunches = sortPunches((punches ?? []) as unknown as PunchRow[])
  const plan = (planItems ?? []) as unknown as PlanItemRow[]
  const pendingCerts = ((certs ?? []) as unknown as CertRow[]).filter(c => !c.certificate_signatures.some(s => s.role === 'completion'))
  const overduePres = (preservation ?? []) as unknown as PreservationRow[]

  const projectsInvolved = new Set<string>([
    ...queues.execute.map(r => r.itrs!.project_id),
    ...queues.review.map(r => r.itrs!.project_id),
    ...myPunches.map(p => p.project_id),
    ...plan.map(p => p.work_plans?.project_id ?? ''),
    ...(signer ? pendingCerts.map(c => c.project_id) : []),
  ].filter(Boolean))
  const personalTotal = counts.itrs_execute + counts.itrs_review + counts.punches + counts.plan_items + (signer ? counts.signatures : 0)

  const firstName = greetingName(profile?.full_name, ctx.userEmail)
  const dateLocale = locale === 'en' ? 'en-US' : 'es-ES'
  const todayLabel = new Date().toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' })
  const roleLabel = t(`roles.${role}`)
  const fmt = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })

  const duePill = (date: string | null | undefined, opts?: { doneLabel?: string }) => {
    const state: DueState = dueState(date, today)
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
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* ITRs por ejecutar */}
        <Queue title={t('queues.execute')} count={queues.execute.length} total={counts.itrs_execute} emptyText={t('empty.execute')} moreHref="/itrs" moreLabel={t('viewAll', { count: counts.itrs_execute })} limit={QUEUE_LIMIT}>
          {queues.execute.slice(0, QUEUE_LIMIT).map(a => {
            const itr = a.itrs!
            const style = ITR_STYLE[itr.status] ?? ITR_STYLE.not_started
            return (
              <Row key={itr.id} href={`/projects/${itr.project_id}/tags/${itr.tags?.id}/itrs/${itr.id}`} stripe={style.color}
                code={itr.itr_number}
                phase={itr.project_phases}
                what={itr.tags ? `${itr.tags.tag_number} — ${itr.tags.description}` : itr.itr_number}
                project={itr.projects?.code}
                right={itr.status === 'in_progress'
                  ? <Pill tone="info">{t('due.inProgress', { pct: Math.round(itr.progress_pct) })}</Pill>
                  : duePill(itr.scheduled_date)}
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
                right={p.target_date ? duePill(p.target_date) : <Pill tone={p.status === 'in_progress' ? 'info' : 'neutral'} style={{ background: pStyle.bg, color: pStyle.color }}>{t(`punchStatus.${p.status}`)}</Pill>}
              />
            )
          })}
        </Queue>

        {/* Plan de trabajo */}
        <Queue title={t('queues.plan')} count={Math.min(plan.length, QUEUE_LIMIT)} total={counts.plan_items} emptyText={t('empty.plan')} moreHref="/work-plans" moreLabel={t('viewAll', { count: counts.plan_items })} limit={QUEUE_LIMIT}>
          {plan.slice(0, QUEUE_LIMIT).map(item => (
            <Row key={item.id} href={`/projects/${item.work_plans?.project_id}/work-plans`} stripe="var(--primary-500)"
              code={item.itrs?.itr_number ?? '—'}
              what={item.title ?? item.itrs?.tags?.tag_number ?? ''}
              project={item.work_plans?.projects?.code}
              right={duePill(item.planned_finish ?? item.work_plans?.plan_date)}
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
                right={<Pill tone="danger">{t('due.overdueDays', { days: daysOverdue(p.next_due_date, today) })}</Pill>}
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
