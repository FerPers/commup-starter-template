import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { AlertTriangle, FileSignature, FolderKanban } from 'lucide-react'
import { Card, EmptyState } from '@/components/ui'

// ── Shared config ─────────────────────────────────────────────────────

const ITR_STYLE: Record<string, { color: string; bg: string }> = {
  not_started: { color: 'var(--gray-500)',    bg: 'var(--gray-100)' },
  in_progress: { color: 'var(--primary-500)', bg: 'var(--primary-50)' },
  completed:   { color: 'var(--success-500)', bg: 'var(--success-50)' },
  approved:    { color: '#7c3aed',            bg: '#f5f3ff' },
  rejected:    { color: 'var(--danger-500)',  bg: 'var(--danger-50)' },
}

const CATEGORY_CFG = {
  A: { label: 'Cat A', color: 'var(--danger-500)',  bg: 'var(--danger-50)',  border: '#fecaca' },
  B: { label: 'Cat B', color: 'var(--warning-500)', bg: 'var(--warning-50)', border: '#fde68a' },
  C: { label: 'Cat C', color: 'var(--gray-500)',    bg: 'var(--gray-50)',    border: 'var(--border)' },
}

const PUNCH_STYLE: Record<string, { color: string; bg: string }> = {
  open:        { color: 'var(--danger-500)',  bg: 'var(--danger-50)' },
  in_progress: { color: 'var(--primary-500)', bg: 'var(--primary-50)' },
  closed:      { color: 'var(--success-500)', bg: 'var(--success-50)' },
  cancelled:   { color: 'var(--gray-500)',    bg: 'var(--gray-100)' },
}

// ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/setup')

  const { role, org_id: orgId } = membership

  const [t, locale] = await Promise.all([
    getTranslations('Dashboard'),
    getLocale(),
  ])
  const dateLocale = locale === 'en' ? 'en-US' : 'es-ES'

  const itrLabels: Record<string, string> = {
    not_started: t('itrStatus.not_started'),
    in_progress: t('itrStatus.in_progress'),
    completed:   t('itrStatus.completed'),
    approved:    t('itrStatus.approved'),
    rejected:    t('itrStatus.rejected'),
  }
  const punchLabels: Record<string, string> = {
    open:        t('punchStatus.open'),
    in_progress: t('punchStatus.in_progress'),
    closed:      t('punchStatus.closed'),
    cancelled:   t('punchStatus.cancelled'),
  }
  const itrLabel   = (s: string) => itrLabels[s]   ?? s
  const punchLabel = (s: string) => punchLabels[s]  ?? s

  // ── Inspector ──────────────────────────────────────────────────────
  if (role === 'inspector') {
    const [{ data: profile }, { data: myAssignments }, { data: myPunches }, { data: org }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
      supabase
        .from('itr_assignments')
        .select(`id, role, itrs(id, itr_number, status, progress_pct, scheduled_date, project_id, tags(id, tag_number, description), projects(id, name, code), project_phases(code, color, name))`)
        .eq('user_id', user.id),
      supabase
        .from('punches')
        .select(`id, punch_number, category, description, status, priority, target_date, project_id, projects(id, name, code), tags(tag_number)`)
        .eq('assigned_to', user.id)
        .in('status', ['open', 'in_progress'])
        .order('target_date', { ascending: true, nullsFirst: false }),
      supabase.from('organizations').select('name').eq('id', orgId).single(),
    ])

    const seenItrIds = new Set<string>()
    const activeItrs = (myAssignments ?? [])
      .filter(a => {
        const itr = a.itrs as any
        if (!itr || ['approved', 'rejected'].includes(itr.status)) return false
        if (seenItrIds.has(itr.id)) return false
        seenItrIds.add(itr.id)
        return true
      })
      .sort((a, b) => {
        const da = (a.itrs as any)?.scheduled_date ?? '9999'
        const db = (b.itrs as any)?.scheduled_date ?? '9999'
        return da.localeCompare(db)
      })

    const todayStr = new Date().toISOString().slice(0, 10)
    const firstName = profile?.full_name?.split(' ')[0] ?? 'Inspector'
    const todayLabel = new Date().toLocaleDateString(dateLocale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

    return (
      <div style={{ padding: 28, maxWidth: 860 }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px' }}>{t('hello', { name: firstName })}</h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-400)', margin: 0, textTransform: 'capitalize' }}>{todayLabel} · {org?.name ?? ''}</p>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
          <SummaryPill count={activeItrs.length} label={t('inspector.pillItrs')} color="var(--primary-500)" />
          <SummaryPill count={(myPunches ?? []).length} label={t('inspector.pillPunches')} color="var(--danger-500)" />
          <SummaryPill count={activeItrs.filter(a => (a.itrs as any)?.status === 'in_progress').length} label={t('inspector.pillProgress')} color="var(--success-500)" />
        </div>

        <TaskSection title={t('inspector.myItrs')} count={activeItrs.length} emptyText={t('inspector.myItrsEmpty')}>
          {activeItrs.map(a => {
            const itr = a.itrs as any
            const style = ITR_STYLE[itr.status] ?? ITR_STYLE.not_started
            const phase = itr.project_phases
            const overdue = itr.scheduled_date && itr.scheduled_date < todayStr && itr.status === 'not_started'
            return (
              <a key={itr.id} href={`/projects/${itr.project_id}/tags/${itr.tags?.id}/itrs/${itr.id}`} style={{ display: 'block', textDecoration: 'none' }}>
                <div style={{ padding: '14px 16px', background: 'var(--card-bg)', border: `1px solid ${overdue ? '#fecaca' : 'var(--border)'}`, borderLeft: `3px solid ${overdue ? 'var(--danger-500)' : style.color}`, borderRadius: 'var(--radius-md)', display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      {phase && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: `${phase.color}18`, color: phase.color }}>{phase.code}</span>}
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace' }}>{itr.itr_number}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray-400)', background: 'var(--gray-100)', padding: '1px 6px', borderRadius: 'var(--radius-sm)' }}>
                        {a.role === 'executor' ? t('inspector.executor') : a.role === 'supervisor' ? t('inspector.supervisor') : t('inspector.roleClient')}
                      </span>
                    </div>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-700)' }}>{itr.tags?.tag_number} — {itr.tags?.description}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-400)', marginTop: 3, display: 'flex', gap: 10 }}>
                      <span>{itr.projects?.code}</span>
                      {itr.scheduled_date && (
                        <span style={{ color: overdue ? 'var(--danger-500)' : 'var(--gray-400)', fontWeight: overdue ? 600 : 400 }}>
                          {t(overdue ? 'inspector.schedOverdue' : 'inspector.scheduled', { date: itr.scheduled_date })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: style.bg, color: style.color, whiteSpace: 'nowrap' }}>{itrLabel(itr.status)}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 60, height: 4, background: 'var(--gray-100)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${itr.progress_pct}%`, background: itr.progress_pct >= 100 ? 'var(--success-500)' : 'var(--primary-500)', borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--gray-400)' }}>{itr.progress_pct}%</span>
                    </div>
                  </div>
                </div>
              </a>
            )
          })}
        </TaskSection>

        <TaskSection title={t('inspector.myPunches')} count={(myPunches ?? []).length} emptyText={t('inspector.myPunchesEmpty')} style={{ marginTop: 20 }}>
          {(myPunches ?? []).map((p: any) => {
            const cat = CATEGORY_CFG[p.category as 'A' | 'B' | 'C']
            const pStyle = PUNCH_STYLE[p.status as keyof typeof PUNCH_STYLE] ?? PUNCH_STYLE.open
            const overdue = p.target_date && p.target_date < todayStr
            return (
              <a key={p.id} href={`/projects/${p.project_id}/punches`} style={{ display: 'block', textDecoration: 'none' }}>
                <div style={{ padding: '14px 16px', background: 'var(--card-bg)', border: `1px solid ${overdue ? '#fecaca' : 'var(--border)'}`, borderLeft: `3px solid ${cat.color}`, borderRadius: 'var(--radius-md)', display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: cat.bg, color: cat.color, border: `1px solid ${cat.border}` }}>{cat.label}</span>
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace' }}>{p.punch_number}</span>
                    </div>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-700)' }}>{p.description}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-400)', marginTop: 3 }}>{(p.projects as any)?.code} · {(p.tags as any)?.tag_number}</div>
                  </div>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: pStyle.bg, color: pStyle.color, whiteSpace: 'nowrap' }}>{punchLabel(p.status)}</span>
                </div>
              </a>
            )
          })}
        </TaskSection>
      </div>
    )
  }

  // ── Client ─────────────────────────────────────────────────────────
  if (role === 'client') {
    const [{ data: profile }, { data: org }, { data: projects }, { data: clientAssignments }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
      supabase.from('organizations').select('name').eq('id', orgId).single(),
      supabase.from('projects').select('id, name, code, status').eq('org_id', orgId).eq('status', 'active').order('created_at', { ascending: false }),
      supabase
        .from('itr_assignments')
        .select(`id, itrs(id, itr_number, status, project_id, tags(id, tag_number, description), projects(id, name, code), project_phases(code, color, name), itr_signatures(role))`)
        .eq('user_id', user.id)
        .eq('role', 'client'),
    ])

    const pendingSignature = (clientAssignments ?? []).filter(a => {
      const itr = a.itrs as any
      return itr && itr.status === 'completed' && !(itr.itr_signatures as any[]).some((s: any) => s.role === 'client')
    })

    const firstName = profile?.full_name?.split(' ')[0] ?? 'Cliente'
    const todayLabel = new Date().toLocaleDateString(dateLocale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

    return (
      <div style={{ padding: 28, maxWidth: 860 }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px' }}>{t('hello', { name: firstName })}</h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-400)', margin: 0, textTransform: 'capitalize' }}>{todayLabel} · {org?.name ?? ''}</p>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
          <SummaryPill count={(projects ?? []).length} label={t('clientView.pillProjects')} color="var(--primary-500)" />
          <SummaryPill count={pendingSignature.length} label={t('clientView.pillSignatures')} color={pendingSignature.length > 0 ? 'var(--warning-500)' : 'var(--success-500)'} />
        </div>

        {/* Pending signatures */}
        {pendingSignature.length > 0 && (
          <Card padding="md" style={{ marginBottom: 20, borderLeft: '3px solid var(--warning-500)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <FileSignature size={20} color="var(--warning-700)" aria-hidden="true" />
              <div>
                <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--text-strong)' }}>{t('clientView.signaturesTitle')}</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{t('clientView.signaturesDesc', { count: pendingSignature.length })}</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pendingSignature.map(a => {
                const itr = a.itrs as any
                const phase = itr.project_phases
                return (
                  <a key={itr.id} href={`/projects/${itr.project_id}/tags/${itr.tags?.id}/itrs/${itr.id}`} style={{ display: 'block', textDecoration: 'none' }}>
                    <div style={{ padding: '12px 14px', background: 'var(--warning-50)', border: '1px solid #fde68a', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 12 }}>
                      {phase && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: `${phase.color}18`, color: phase.color, whiteSpace: 'nowrap' }}>{phase.code}</span>}
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace' }}>{itr.itr_number}</span>
                      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', flex: 1 }}>{itr.tags?.tag_number} — {itr.tags?.description}</span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--primary-500)', fontWeight: 600 }}>{itr.projects?.code}</span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--warning-500)', fontWeight: 600 }}>{t('clientView.sign')}</span>
                    </div>
                  </a>
                )
              })}
            </div>
          </Card>
        )}

        {/* Active projects (read-only) */}
        <Card padding="md">
          <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-strong)', marginBottom: 16 }}>{t('clientView.projectsTitle')}</h3>
          {(projects ?? []).length === 0 ? (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-400)', textAlign: 'center', padding: '24px 0' }}>{t('clientView.noProjects')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(projects ?? []).map((p: any) => (
                <div key={p.id} style={{ padding: '14px 16px', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 'var(--radius-md)', background: 'var(--primary-50)', border: '1px solid var(--primary-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--primary-500)' }}>{p.code}</div>
                    <span style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-strong)' }}>{p.name}</span>
                  </div>
                  <a href={`/projects/${p.id}`} style={{ fontSize: 'var(--text-sm)', color: 'var(--primary-500)', textDecoration: 'none', fontWeight: 500 }}>Ver detalle →</a>
                </div>
              ))}
            </div>
          )}
        </Card>

        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-400)', marginTop: 20, textAlign: 'center' }}>
          {t.rich('clientView.viewItrs', {
            link: (chunks) => <a href="/itrs" style={{ color: 'var(--primary-500)', textDecoration: 'none' }}>{chunks}</a>
          })}
        </p>
      </div>
    )
  }

  // ── Shared org data (operational + strategic) ─────────────────────
  const canCreateProject = ['owner', 'admin', 'architect'].includes(role)

  const [{ data: org }, { data: projects }, { data: phases }, { data: disciplines }] = await Promise.all([
    supabase.from('organizations').select('name, plan').eq('id', orgId).single(),
    supabase.from('projects').select('id, name, code, location, client, start_date, end_date, status').eq('org_id', orgId).order('created_at', { ascending: false }),
    supabase.from('project_phases').select('id, name, code, color, order_index').eq('org_id', orgId).order('order_index'),
    supabase.from('disciplines').select('id, name, code, color').eq('org_id', orgId),
  ])

  const activeProjects = (projects ?? []).filter(p => p.status === 'active')
  const projectIds = (projects ?? []).map(p => p.id)

  const in7Days = new Date()
  in7Days.setDate(in7Days.getDate() + 7)
  const in7DaysStr = in7Days.toISOString().split('T')[0]

  const [{ data: orgItrs }, { data: orgPunches }, { data: orgPreservationDue }] = projectIds.length > 0
    ? await Promise.all([
        supabase.from('itrs').select('id, status, phase_id').in('project_id', projectIds),
        supabase.from('punches').select('id, category, status, assigned_to').in('project_id', projectIds),
        supabase.from('preservation_plans').select('id, next_due_date').in('project_id', projectIds).eq('status', 'active').lte('next_due_date', in7DaysStr),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]

  // ── Operational alerts (architect + leader only) ──────────────────
  let unassignedCatA: any[] = []
  if (['architect', 'leader'].includes(role) && projectIds.length > 0) {
    const { data } = await supabase
      .from('punches')
      .select('id, punch_number, description, project_id, projects(code, name)')
      .in('project_id', projectIds)
      .eq('category', 'A')
      .in('status', ['open', 'in_progress'])
      .is('assigned_to', null)
      .order('created_at', { ascending: true })
      .limit(8)
    unassignedCatA = data ?? []
  }

  // ── KPIs ──────────────────────────────────────────────────────────
  const kpiCards = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 32 }}>
      {(phases ?? []).slice(0, 3).map(phase => {
        const phaseItrs = (orgItrs ?? []).filter((i: any) => i.phase_id === phase.id)
        const total = phaseItrs.length
        const approved = phaseItrs.filter((i: any) => i.status === 'approved').length
        const pct = total > 0 ? Math.round((approved / total) * 100) : 0
        return <KpiCard key={phase.id} label={phase.name} value={`${pct}%`} color={phase.color} sub={`${approved} / ${total} ITRs`} progress={pct} />
      })}
      {(() => {
        const open = (orgPunches ?? []).filter((p: any) => p.status !== 'closed' && p.status !== 'cancelled')
        const catA = open.filter((p: any) => p.category === 'A').length
        const catB = open.filter((p: any) => p.category === 'B').length
        return <KpiCard label={t('kpi.punchesOpen')} value={String(open.length)} color="var(--danger-500)" sub={t('kpi.punchesOpenSub', { catA, catB })} danger />
      })()}
      {(() => {
        const due = orgPreservationDue ?? []
        const today = new Date().toISOString().split('T')[0]
        const overdue  = (due as any[]).filter(p => p.next_due_date < today).length
        const upcoming = (due as any[]).filter(p => p.next_due_date >= today).length
        return (
          <KpiCard
            label={t('kpi.preservation')}
            value={String(due.length)}
            color={overdue > 0 ? 'var(--warning-500)' : '#8b5cf6'}
            sub={overdue > 0 ? t('kpi.preservationOverdue', { overdue, upcoming }) : t('kpi.preservationUpcoming', { upcoming })}
            danger={overdue > 0}
          />
        )
      })()}
    </div>
  )

  // ── Projects section ──────────────────────────────────────────────
  const projectsSection = (
    <Card padding="md">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-strong)' }}>{t('projects.title')}</h3>
        {canCreateProject && (
          <a href="/setup?mode=project" style={{ padding: '8px 16px', background: 'var(--primary-500)', color: '#fff', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', fontWeight: 500, textDecoration: 'none' }}>
            {t('projects.newProject')}
          </a>
        )}
      </div>
      {activeProjects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban size={24} aria-hidden="true" />}
          title={t('projects.empty')}
          description={t('projects.emptyDesc')}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {activeProjects.map(project => (
            <ProjectRow
              key={project.id}
              project={project}
              phases={phases ?? []}
              noMetaText={t('projects.noMeta')}
              activeText={t('projects.active')}
            />
          ))}
        </div>
      )}
    </Card>
  )

  // ── Architect / Leader ─────────────────────────────────────────────
  if (role === 'architect' || role === 'leader') {
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    const firstName = (profile as any)?.full_name?.split(' ')[0] ?? role

    return (
      <div style={{ padding: 32 }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: '-0.5px' }}>{t('hello', { name: firstName })}</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 'var(--text-base)' }}>{org?.name ?? ''}</p>
        </div>

        {/* Operational alert panel */}
        {unassignedCatA.length > 0 && (
          <div role="alert" style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderLeft: '4px solid #f97316', borderRadius: 'var(--radius-lg)', padding: '20px 24px', marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertTriangle size={18} color="#9a3412" aria-hidden="true" />
                <div>
                  <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: '#9a3412' }}>{t('architect.catATitle')}</div>
                  <div style={{ fontSize: 'var(--text-sm)', color: '#c2410c' }}>{t('architect.catADesc', { count: unassignedCatA.length })}</div>
                </div>
              </div>
              <a href="/punch-list" style={{ fontSize: 'var(--text-sm)', color: '#ea580c', fontWeight: 600, textDecoration: 'none' }}>{t('architect.catAViewAll')}</a>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {unassignedCatA.slice(0, 5).map((p: any) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--card-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid #fed7aa' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#9a3412', background: 'var(--danger-50)', padding: '1px 6px', borderRadius: 'var(--radius-sm)', whiteSpace: 'nowrap' }}>Cat A</span>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--gray-700)', fontFamily: 'ui-monospace, monospace' }}>{p.punch_number}</span>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</span>
                  <span style={{ fontSize: 10, color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>{(p.projects as any)?.code}</span>
                </div>
              ))}
              {unassignedCatA.length > 5 && (
                <p style={{ fontSize: 'var(--text-xs)', color: '#c2410c', margin: '4px 0 0', paddingLeft: 4 }}>{t('architect.catAMore', { count: unassignedCatA.length - 5 })}</p>
              )}
            </div>
          </div>
        )}

        {kpiCards}
        {projectsSection}

        {(disciplines ?? []).length > 0 && (
          <Card padding="md" style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-strong)', marginBottom: 16 }}>{t('disciplines')}</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(disciplines ?? []).map(d => (
                <span key={d.id} style={{ padding: '4px 12px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--text-sm)', fontWeight: 500, background: `${d.color}18`, color: d.color, border: `1px solid ${d.color}40` }}>
                  {d.code} — {d.name}
                </span>
              ))}
            </div>
          </Card>
        )}
      </div>
    )
  }

  // ── Owner / Admin (strategic) ─────────────────────────────────────
  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: '-0.5px' }}>{t('title')}</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 'var(--text-base)' }}>{org?.name ?? t('subtitle')}</p>
      </div>
      {kpiCards}
      {projectsSection}
      {(disciplines ?? []).length > 0 && (
        <Card padding="md" style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-strong)', marginBottom: 16 }}>{t('disciplines')}</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(disciplines ?? []).map(d => (
              <span key={d.id} style={{ padding: '4px 12px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--text-sm)', fontWeight: 500, background: `${d.color}18`, color: d.color, border: `1px solid ${d.color}40` }}>
                {d.code} — {d.name}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────

function SummaryPill({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'var(--card-bg)', borderRadius: 'var(--radius-pill)', border: `1px solid ${color}30`, boxShadow: 'var(--shadow-sm)' }}>
      <span style={{ fontSize: 'var(--text-md)', fontWeight: 700, color }}>{count}</span>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{label}</span>
    </div>
  )
}

function TaskSection({ title, count, children, emptyText, style }: {
  title: string; count: number; children: React.ReactNode; emptyText: string; style?: React.CSSProperties
}) {
  return (
    <div style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden', ...style }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--gray-100)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-strong)' }}>{title}</span>
        {count > 0 && <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, background: 'var(--gray-100)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: 'var(--radius-pill)' }}>{count}</span>}
      </div>
      {count === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-400)', margin: 0 }}>{emptyText}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 16px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function KpiCard({ label, value, color, sub, danger = false, progress = 0 }: {
  label: string; value: string; color: string; sub: string; danger?: boolean; progress?: number
}) {
  return (
    <Card padding="md" style={{ borderTop: `3px solid ${color}` }}>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</p>
      <p style={{ fontSize: 36, fontWeight: 700, color: danger ? color : 'var(--text-strong)', margin: '8px 0 4px', letterSpacing: '-1px' }}>{value}</p>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-400)' }}>{sub}</p>
      <div style={{ marginTop: 12, height: 6, background: 'var(--gray-100)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${progress}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
    </Card>
  )
}

function ProjectRow({ project, phases, noMetaText, activeText }: {
  project: { id: string; name: string; code: string; location: string | null; client: string | null; start_date: string | null; end_date: string | null; status: string }
  phases: { id: string; name: string; code: string; color: string; order_index: number }[]
  noMetaText: string
  activeText: string
}) {
  return (
    <div style={{ padding: '16px 20px', background: 'var(--gray-50)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 42, height: 42, borderRadius: 'var(--radius-md)', background: 'var(--primary-50)', border: '1px solid var(--primary-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--primary-500)' }}>
          {project.code}
        </div>
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-strong)', fontSize: 'var(--text-base)' }}>{project.name}</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 2 }}>
            {[project.client, project.location].filter(Boolean).join(' · ') || noMetaText}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {phases.slice(0, 4).map(phase => (
          <div key={phase.id} title={phase.name} style={{ width: 28, height: 28, borderRadius: '50%', background: `${phase.color}20`, border: `2px solid ${phase.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-xs)', fontWeight: 700, color: phase.color }}>
            {phase.code}
          </div>
        ))}
        <span style={{ marginLeft: 8, padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--text-xs)', fontWeight: 600, background: 'var(--success-50)', color: 'var(--success-700)', border: '1px solid var(--success-500)' }}>
          {activeText}
        </span>
      </div>
    </div>
  )
}
