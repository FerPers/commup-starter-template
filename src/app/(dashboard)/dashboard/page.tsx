import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get org membership + role
  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/setup')

  const orgId = membership.org_id
  const canCreateProject = ['owner', 'admin', 'architect'].includes(membership.role)

  // Fetch org, projects, phases, disciplines in parallel
  const [
    { data: org },
    { data: projects },
    { data: phases },
    { data: disciplines },
  ] = await Promise.all([
    supabase.from('organizations').select('name, plan').eq('id', orgId).single(),
    supabase.from('projects').select('id, name, code, location, client, start_date, end_date, status').eq('org_id', orgId).order('created_at', { ascending: false }),
    supabase.from('project_phases').select('id, name, code, color, order_index').eq('org_id', orgId).order('order_index'),
    supabase.from('disciplines').select('id, name, code, color').eq('org_id', orgId),
  ])

  const activeProjects = (projects ?? []).filter(p => p.status === 'active')
  const projectIds = (projects ?? []).map(p => p.id)

  // Fetch ITRs + punches + preservation plans expiring within 7 days
  const in7Days = new Date()
  in7Days.setDate(in7Days.getDate() + 7)
  const in7DaysStr = in7Days.toISOString().split('T')[0]

  const [{ data: orgItrs }, { data: orgPunches }, { data: orgPreservationDue }] = projectIds.length > 0
    ? await Promise.all([
        supabase.from('itrs').select('id, status, phase_id').in('project_id', projectIds),
        supabase.from('punches').select('id, category, status').in('project_id', projectIds),
        supabase
          .from('preservation_plans')
          .select('id, next_due_date')
          .in('project_id', projectIds)
          .eq('status', 'active')
          .lte('next_due_date', in7DaysStr),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]

  return (
    <div style={{ padding: '32px' }}>

      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px' }}>
          Dashboard
        </h1>
        <p style={{ color: '#64748b', marginTop: '4px', fontSize: '15px' }}>
          {org?.name ?? 'Resumen general del estado de completamiento'}
        </p>
      </div>

      {/* KPI Cards — phase-based */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px', marginBottom: '32px',
      }}>
        {(phases ?? []).slice(0, 3).map(phase => {
          const phaseItrs = (orgItrs ?? []).filter(i => i.phase_id === phase.id)
          const total = phaseItrs.length
          const approved = phaseItrs.filter(i => i.status === 'approved').length
          const pct = total > 0 ? Math.round((approved / total) * 100) : 0
          return (
            <KpiCard
              key={phase.id}
              label={phase.name}
              value={`${pct}%`}
              color={phase.color}
              sub={`${approved} / ${total} ITRs`}
              progress={pct}
            />
          )
        })}
        {(() => {
          const open = (orgPunches ?? []).filter(p => p.status !== 'closed' && p.status !== 'cancelled')
          const catA = open.filter(p => p.category === 'A').length
          const catB = open.filter(p => p.category === 'B').length
          return (
            <KpiCard
              label="Punch List Abiertos"
              value={String(open.length)}
              color="#ef4444"
              sub={`Cat A: ${catA} · Cat B: ${catB}`}
              danger
            />
          )
        })()}
        {(() => {
          const due = orgPreservationDue ?? []
          const today = new Date().toISOString().split('T')[0]
          const overdue  = due.filter(p => p.next_due_date < today).length
          const upcoming = due.filter(p => p.next_due_date >= today).length
          return (
            <KpiCard
              label="Preservación — próx. 7 días"
              value={String(due.length)}
              color={overdue > 0 ? '#f59e0b' : '#8b5cf6'}
              sub={overdue > 0 ? `${overdue} vencido(s) · ${upcoming} por vencer` : `${upcoming} por vencer`}
              danger={overdue > 0}
            />
          )
        })()}
      </div>


      {/* Projects list */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={cardTitleStyle}>Proyectos Activos</h3>
          {canCreateProject && (
            <a href="/setup?mode=project" style={{
              padding: '8px 16px', background: '#3b82f6', color: 'white',
              borderRadius: '8px', fontSize: '13px', fontWeight: 500,
              textDecoration: 'none',
            }}>
              + Nuevo Proyecto
            </a>
          )}
        </div>

        {activeProjects.length === 0 ? (
          <div style={{
            padding: '48px', textAlign: 'center',
            background: '#f8fafc', borderRadius: '12px',
            border: '2px dashed #e2e8f0',
          }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>⬡</div>
            <p style={{ color: '#475569', fontWeight: 500, marginBottom: '6px' }}>No hay proyectos todavía</p>
            <p style={{ color: '#94a3b8', fontSize: '14px' }}>
              Crea tu primer proyecto para comenzar a gestionar el completamiento
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {activeProjects.map(project => (
              <ProjectRow key={project.id} project={project} phases={phases ?? []} />
            ))}
          </div>
        )}
      </div>

      {/* Disciplines summary */}
      {(disciplines ?? []).length > 0 && (
        <div style={{ ...cardStyle, marginTop: '16px' }}>
          <h3 style={{ ...cardTitleStyle, marginBottom: '16px' }}>Disciplinas del Proyecto</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {(disciplines ?? []).map(d => (
              <span key={d.id} style={{
                padding: '4px 12px', borderRadius: '999px', fontSize: '13px', fontWeight: 500,
                background: `${d.color}18`, color: d.color, border: `1px solid ${d.color}40`,
              }}>
                {d.code} — {d.name}
              </span>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────

function ProjectRow({ project, phases }: {
  project: { id: string; name: string; code: string; location: string | null; client: string | null; start_date: string | null; end_date: string | null; status: string }
  phases: { id: string; name: string; code: string; color: string; order_index: number }[]
}) {
  return (
    <div style={{
      padding: '16px 20px', background: '#f8fafc', borderRadius: '12px',
      border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', gap: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{
          width: '42px', height: '42px', borderRadius: '10px',
          background: '#3b82f620', border: '1px solid #3b82f630',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '13px', fontWeight: 700, color: '#3b82f6',
        }}>
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
          <div key={phase.id} title={phase.name} style={{
            width: '28px', height: '28px', borderRadius: '50%',
            background: `${phase.color}20`, border: `2px solid ${phase.color}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', fontWeight: 700, color: phase.color,
          }}>
            {phase.code}
          </div>
        ))}
        <span style={{
          marginLeft: '8px', padding: '3px 10px', borderRadius: '999px',
          fontSize: '11px', fontWeight: 600,
          background: '#10b98120', color: '#10b981',
          border: '1px solid #10b98130',
        }}>
          Activo
        </span>
      </div>
    </div>
  )
}

function KpiCard({ label, value, color, sub, danger = false, progress = 0 }: {
  label: string; value: string; color: string; sub: string; danger?: boolean; progress?: number
}) {
  return (
    <div style={{ ...cardStyle, borderTop: `3px solid ${color}` }}>
      <p style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>{label}</p>
      <p style={{
        fontSize: '36px', fontWeight: 700, color: danger ? color : '#0f172a',
        margin: '8px 0 4px', letterSpacing: '-1px',
      }}>
        {value}
      </p>
      <p style={{ fontSize: '12px', color: '#94a3b8' }}>{sub}</p>
      <div style={{ marginTop: '12px', height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${progress}%`, height: '100%', background: color, borderRadius: '3px' }} />
      </div>
    </div>
  )
}


// ── Shared styles ─────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: '14px',
  padding: '24px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
}

const cardTitleStyle: React.CSSProperties = {
  fontSize: '15px',
  fontWeight: 600,
  color: '#0f172a',
}
