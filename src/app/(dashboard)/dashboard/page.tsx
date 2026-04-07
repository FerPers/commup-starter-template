import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// ── Shared config ─────────────────────────────────────────────────────

const ITR_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  not_started: { label: 'Sin iniciar', color: '#64748b', bg: '#f1f5f9' },
  in_progress:  { label: 'En progreso', color: '#3b82f6', bg: '#eff6ff' },
  completed:    { label: 'Completado',  color: '#10b981', bg: '#ecfdf5' },
  approved:     { label: 'Aprobado',    color: '#7c3aed', bg: '#f5f3ff' },
  rejected:     { label: 'Rechazado',   color: '#ef4444', bg: '#fee2e2' },
}

const CATEGORY_CFG = {
  A: { label: 'Cat A', color: '#ef4444', bg: '#fee2e2', border: '#fecaca' },
  B: { label: 'Cat B', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
  C: { label: 'Cat C', color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
}

const PUNCH_STATUS = {
  open:        { label: 'Abierto',    color: '#ef4444', bg: '#fee2e2' },
  in_progress: { label: 'En proceso', color: '#3b82f6', bg: '#eff6ff' },
  closed:      { label: 'Cerrado',    color: '#10b981', bg: '#ecfdf5' },
  cancelled:   { label: 'Cancelado',  color: '#64748b', bg: '#f1f5f9' },
}

const cardStyle: React.CSSProperties = {
  background: 'white', borderRadius: '14px', padding: '24px',
  border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
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
    const todayLabel = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

    return (
      <div style={{ padding: '28px', maxWidth: '860px' }}>
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Hola, {firstName}</h1>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0, textTransform: 'capitalize' }}>{todayLabel} · {org?.name ?? ''}</p>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '28px', flexWrap: 'wrap' }}>
          <SummaryPill count={activeItrs.length} label="ITRs pendientes" color="#3b82f6" />
          <SummaryPill count={(myPunches ?? []).length} label="Punches asignados" color="#ef4444" />
          <SummaryPill count={activeItrs.filter(a => (a.itrs as any)?.status === 'in_progress').length} label="En progreso" color="#10b981" />
        </div>

        <TaskSection title="Mis ITRs asignadas" count={activeItrs.length} emptyText="No tienes ITRs pendientes de ejecución.">
          {activeItrs.map(a => {
            const itr = a.itrs as any
            const st = ITR_STATUS[itr.status] ?? ITR_STATUS.not_started
            const phase = itr.project_phases
            const overdue = itr.scheduled_date && itr.scheduled_date < todayStr && itr.status === 'not_started'
            return (
              <a key={itr.id} href={`/projects/${itr.project_id}/tags/${itr.tags?.id}/itrs/${itr.id}`} style={{ display: 'block', textDecoration: 'none' }}>
                <div style={{ padding: '14px 16px', background: 'white', border: `1px solid ${overdue ? '#fecaca' : '#e2e8f0'}`, borderLeft: `3px solid ${overdue ? '#ef4444' : st.color}`, borderRadius: '10px', display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      {phase && <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: `${phase.color}18`, color: phase.color }}>{phase.code}</span>}
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', fontFamily: 'ui-monospace, monospace' }}>{itr.itr_number}</span>
                      <span style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px' }}>
                        {a.role === 'executor' ? 'Ejecutor' : a.role === 'supervisor' ? 'Supervisor' : 'Cliente'}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#374151' }}>{itr.tags?.tag_number} — {itr.tags?.description}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px', display: 'flex', gap: '10px' }}>
                      <span>{itr.projects?.code}</span>
                      {itr.scheduled_date && <span style={{ color: overdue ? '#ef4444' : '#94a3b8', fontWeight: overdue ? 600 : 400 }}>{overdue ? '⚠ ' : ''}Programado: {itr.scheduled_date}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: st.bg, color: st.color, whiteSpace: 'nowrap' }}>{st.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '60px', height: '4px', background: '#f1f5f9', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${itr.progress_pct}%`, background: itr.progress_pct >= 100 ? '#10b981' : '#3b82f6', borderRadius: '2px' }} />
                      </div>
                      <span style={{ fontSize: '10px', color: '#94a3b8' }}>{itr.progress_pct}%</span>
                    </div>
                  </div>
                </div>
              </a>
            )
          })}
        </TaskSection>

        <TaskSection title="Mis Punches asignados" count={(myPunches ?? []).length} emptyText="No tienes punches asignados." style={{ marginTop: '20px' }}>
          {(myPunches ?? []).map((p: any) => {
            const cat = CATEGORY_CFG[p.category as 'A' | 'B' | 'C']
            const st  = PUNCH_STATUS[p.status as keyof typeof PUNCH_STATUS]
            const overdue = p.target_date && p.target_date < todayStr
            return (
              <a key={p.id} href={`/projects/${p.project_id}/punches`} style={{ display: 'block', textDecoration: 'none' }}>
                <div style={{ padding: '14px 16px', background: 'white', border: `1px solid ${overdue ? '#fecaca' : '#e2e8f0'}`, borderLeft: `3px solid ${cat.color}`, borderRadius: '10px', display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: cat.bg, color: cat.color, border: `1px solid ${cat.border}` }}>{cat.label}</span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', fontFamily: 'ui-monospace, monospace' }}>{p.punch_number}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '440px' }}>{p.description}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px', display: 'flex', gap: '10px' }}>
                      <span>{p.projects?.code}</span>
                      {p.tags?.tag_number && <span>{p.tags.tag_number}</span>}
                      {p.target_date && <span style={{ color: overdue ? '#ef4444' : '#94a3b8', fontWeight: overdue ? 600 : 400 }}>{overdue ? '⚠ Vencido: ' : 'Límite: '}{p.target_date}</span>}
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: st.bg, color: st.color, whiteSpace: 'nowrap' }}>{st.label}</span>
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
    const todayLabel = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

    return (
      <div style={{ padding: '28px', maxWidth: '860px' }}>
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Hola, {firstName}</h1>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0, textTransform: 'capitalize' }}>{todayLabel} · {org?.name ?? ''}</p>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '28px', flexWrap: 'wrap' }}>
          <SummaryPill count={(projects ?? []).length} label="Proyectos activos" color="#3b82f6" />
          <SummaryPill count={pendingSignature.length} label="Pendientes de tu firma" color={pendingSignature.length > 0 ? '#f59e0b' : '#10b981'} />
        </div>

        {/* Pending signatures */}
        {pendingSignature.length > 0 && (
          <div style={{ ...cardStyle, marginBottom: '20px', borderLeft: '3px solid #f59e0b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontSize: '20px' }}>✍</span>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>Pendientes de tu firma</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{pendingSignature.length} ITR{pendingSignature.length !== 1 ? 's' : ''} completado{pendingSignature.length !== 1 ? 's' : ''} esperan tu firma como Cliente</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {pendingSignature.map(a => {
                const itr = a.itrs as any
                const phase = itr.project_phases
                return (
                  <a key={itr.id} href={`/projects/${itr.project_id}/tags/${itr.tags?.id}/itrs/${itr.id}`} style={{ display: 'block', textDecoration: 'none' }}>
                    <div style={{ padding: '12px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {phase && <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: `${phase.color}18`, color: phase.color, whiteSpace: 'nowrap' }}>{phase.code}</span>}
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', fontFamily: 'ui-monospace, monospace' }}>{itr.itr_number}</span>
                      <span style={{ fontSize: '12px', color: '#64748b', flex: 1 }}>{itr.tags?.tag_number} — {itr.tags?.description}</span>
                      <span style={{ fontSize: '11px', color: '#3b82f6', fontWeight: 600 }}>{itr.projects?.code}</span>
                      <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600 }}>Firmar →</span>
                    </div>
                  </a>
                )
              })}
            </div>
          </div>
        )}

        {/* Active projects (read-only) */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', marginBottom: '16px' }}>Proyectos activos</h3>
          {(projects ?? []).length === 0 ? (
            <p style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', padding: '24px 0' }}>Sin proyectos activos.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(projects ?? []).map((p: any) => (
                <div key={p.id} style={{ padding: '14px 16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: '#3b82f620', border: '1px solid #3b82f630', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#3b82f6' }}>{p.code}</div>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>{p.name}</span>
                  </div>
                  <a href={`/projects/${p.id}`} style={{ fontSize: '12px', color: '#3b82f6', textDecoration: 'none', fontWeight: 500 }}>Ver detalle →</a>
                </div>
              ))}
            </div>
          )}
        </div>

        <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '20px', textAlign: 'center' }}>
          Accede a <a href="/itrs" style={{ color: '#3b82f6', textDecoration: 'none' }}>ITRs</a> para ver el estado detallado de cada inspección.
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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '32px' }}>
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
        return <KpiCard label="Punch List Abiertos" value={String(open.length)} color="#ef4444" sub={`Cat A: ${catA} · Cat B: ${catB}`} danger />
      })()}
      {(() => {
        const due = orgPreservationDue ?? []
        const today = new Date().toISOString().split('T')[0]
        const overdue  = (due as any[]).filter(p => p.next_due_date < today).length
        const upcoming = (due as any[]).filter(p => p.next_due_date >= today).length
        return <KpiCard label="Preservación — próx. 7 días" value={String(due.length)} color={overdue > 0 ? '#f59e0b' : '#8b5cf6'} sub={overdue > 0 ? `${overdue} vencido(s) · ${upcoming} por vencer` : `${upcoming} por vencer`} danger={overdue > 0} />
      })()}
    </div>
  )

  // ── Projects section ──────────────────────────────────────────────
  const projectsSection = (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>Proyectos Activos</h3>
        {canCreateProject && (
          <a href="/setup?mode=project" style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', borderRadius: '8px', fontSize: '13px', fontWeight: 500, textDecoration: 'none' }}>
            + Nuevo Proyecto
          </a>
        )}
      </div>
      {activeProjects.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', border: '2px dashed #e2e8f0' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>⬡</div>
          <p style={{ color: '#475569', fontWeight: 500, marginBottom: '6px' }}>No hay proyectos todavía</p>
          <p style={{ color: '#94a3b8', fontSize: '14px' }}>Crea tu primer proyecto para comenzar a gestionar el completamiento</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {activeProjects.map(project => (
            <ProjectRow key={project.id} project={project} phases={phases ?? []} />
          ))}
        </div>
      )}
    </div>
  )

  // ── Architect / Leader ─────────────────────────────────────────────
  if (role === 'architect' || role === 'leader') {
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    const firstName = (profile as any)?.full_name?.split(' ')[0] ?? role

    return (
      <div style={{ padding: '32px' }}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px' }}>Hola, {firstName}</h1>
          <p style={{ color: '#64748b', marginTop: '4px', fontSize: '15px' }}>{org?.name ?? ''}</p>
        </div>

        {/* Operational alert panel */}
        {unassignedCatA.length > 0 && (
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderLeft: '4px solid #f97316', borderRadius: '12px', padding: '20px 24px', marginBottom: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '18px' }}>⚠</span>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#9a3412' }}>Punches Cat A sin asignar</div>
                  <div style={{ fontSize: '12px', color: '#c2410c' }}>{unassignedCatA.length} punch{unassignedCatA.length !== 1 ? 'es' : ''} bloqueante{unassignedCatA.length !== 1 ? 's' : ''} sin responsable</div>
                </div>
              </div>
              <a href="/punch-list" style={{ fontSize: '12px', color: '#ea580c', fontWeight: 600, textDecoration: 'none' }}>Ver todos →</a>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {unassignedCatA.slice(0, 5).map((p: any) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'white', borderRadius: '7px', border: '1px solid #fed7aa' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#9a3412', background: '#fee2e2', padding: '1px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>Cat A</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#374151', fontFamily: 'ui-monospace, monospace' }}>{p.punch_number}</span>
                  <span style={{ fontSize: '12px', color: '#64748b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</span>
                  <span style={{ fontSize: '10px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{(p.projects as any)?.code}</span>
                </div>
              ))}
              {unassignedCatA.length > 5 && (
                <p style={{ fontSize: '11px', color: '#c2410c', margin: '4px 0 0', paddingLeft: '4px' }}>+ {unassignedCatA.length - 5} más</p>
              )}
            </div>
          </div>
        )}

        {kpiCards}
        {projectsSection}

        {(disciplines ?? []).length > 0 && (
          <div style={{ ...cardStyle, marginTop: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', marginBottom: '16px' }}>Disciplinas del Proyecto</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {(disciplines ?? []).map(d => (
                <span key={d.id} style={{ padding: '4px 12px', borderRadius: '999px', fontSize: '13px', fontWeight: 500, background: `${d.color}18`, color: d.color, border: `1px solid ${d.color}40` }}>
                  {d.code} — {d.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Owner / Admin (strategic) ─────────────────────────────────────
  return (
    <div style={{ padding: '32px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px' }}>Dashboard</h1>
        <p style={{ color: '#64748b', marginTop: '4px', fontSize: '15px' }}>{org?.name ?? 'Resumen general del estado de completamiento'}</p>
      </div>
      {kpiCards}
      {projectsSection}
      {(disciplines ?? []).length > 0 && (
        <div style={{ ...cardStyle, marginTop: '16px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', marginBottom: '16px' }}>Disciplinas del Proyecto</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {(disciplines ?? []).map(d => (
              <span key={d.id} style={{ padding: '4px 12px', borderRadius: '999px', fontSize: '13px', fontWeight: 500, background: `${d.color}18`, color: d.color, border: `1px solid ${d.color}40` }}>
                {d.code} — {d.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────

function SummaryPill({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', background: 'white', borderRadius: '999px', border: `1px solid ${color}30`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <span style={{ fontSize: '18px', fontWeight: 700, color }}>{count}</span>
      <span style={{ fontSize: '12px', color: '#64748b' }}>{label}</span>
    </div>
  )
}

function TaskSection({ title, count, children, emptyText, style }: {
  title: string; count: number; children: React.ReactNode; emptyText: string; style?: React.CSSProperties
}) {
  return (
    <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden', ...style }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>{title}</span>
        {count > 0 && <span style={{ fontSize: '11px', fontWeight: 700, background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: '999px' }}>{count}</span>}
      </div>
      {count === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>{emptyText}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 16px' }}>
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
    <div style={{ ...cardStyle, borderTop: `3px solid ${color}` }}>
      <p style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>{label}</p>
      <p style={{ fontSize: '36px', fontWeight: 700, color: danger ? color : '#0f172a', margin: '8px 0 4px', letterSpacing: '-1px' }}>{value}</p>
      <p style={{ fontSize: '12px', color: '#94a3b8' }}>{sub}</p>
      <div style={{ marginTop: '12px', height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${progress}%`, height: '100%', background: color, borderRadius: '3px' }} />
      </div>
    </div>
  )
}

function ProjectRow({ project, phases }: {
  project: { id: string; name: string; code: string; location: string | null; client: string | null; start_date: string | null; end_date: string | null; status: string }
  phases: { id: string; name: string; code: string; color: string; order_index: number }[]
}) {
  return (
    <div style={{ padding: '16px 20px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#3b82f620', border: '1px solid #3b82f630', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#3b82f6' }}>
          {project.code}
        </div>
        <div>
          <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '15px' }}>{project.name}</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
            {[project.client, project.location].filter(Boolean).join(' · ') || 'Sin cliente / ubicación'}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        {phases.slice(0, 4).map(phase => (
          <div key={phase.id} title={phase.name} style={{ width: '28px', height: '28px', borderRadius: '50%', background: `${phase.color}20`, border: `2px solid ${phase.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: phase.color }}>
            {phase.code}
          </div>
        ))}
        <span style={{ marginLeft: '8px', padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, background: '#10b98120', color: '#10b981', border: '1px solid #10b98130' }}>
          Activo
        </span>
      </div>
    </div>
  )
}