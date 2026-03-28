import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get org membership
  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/setup')

  const orgId = membership.org_id

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

  // Next steps checklist — dynamically based on what exists
  const nextSteps = [
    { done: true, icon: '◎', color: '#10b981', text: 'Organización configurada' },
    { done: activeProjects.length > 0, icon: '⬡', color: '#f59e0b', text: activeProjects.length > 0 ? `${activeProjects.length} proyecto(s) activo(s)` : 'Crea tu primer proyecto' },
    { done: false, icon: '▤', color: '#3b82f6', text: 'Define templates de ITR' },
    { done: false, icon: '◈', color: '#8b5cf6', text: 'Importa tags desde Excel' },
  ]

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
        {(phases ?? []).slice(0, 3).map(phase => (
          <KpiCard
            key={phase.id}
            label={phase.name}
            value="0%"
            color={phase.color}
            sub="0 / 0 ITRs"
          />
        ))}
        <KpiCard label="Punch List Abiertos" value="0" color="#ef4444" sub="Cat A: 0 · Cat B: 0" danger />
      </div>

      {/* Secondary row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '32px' }}>

        {/* Preservation */}
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>Preservación</h3>
          <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
            <PreservationBadge count={0} label="Mantenidos" color="#10b981" />
            <PreservationBadge count={0} label="Vencidos" color="#ef4444" />
            <PreservationBadge count={0} label="Por Vencer" color="#f59e0b" />
          </div>
          <div style={{ marginTop: '20px', padding: '24px', background: '#f8fafc', borderRadius: '10px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
            No hay planes de preservación activos
          </div>
        </div>

        {/* Alerts / Next steps */}
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>Próximos Pasos</h3>
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {nextSteps.map((step, i) => (
              <AlertItem key={i} icon={step.icon} color={step.color} text={step.text} done={step.done} />
            ))}
          </div>
        </div>
      </div>

      {/* Projects list */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={cardTitleStyle}>Proyectos Activos</h3>
          <a href="/projects" style={{
            padding: '8px 16px', background: '#3b82f6', color: 'white',
            borderRadius: '8px', fontSize: '13px', fontWeight: 500,
            textDecoration: 'none',
          }}>
            + Nuevo Proyecto
          </a>
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
          <div key={phase.id} style={{
            width: '28px', height: '28px', borderRadius: '50%',
            background: `${phase.color}20`, border: `2px solid ${phase.color}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', fontWeight: 700, color: phase.color,
            title: phase.name,
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

function KpiCard({ label, value, color, sub, danger = false }: {
  label: string; value: string; color: string; sub: string; danger?: boolean
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
        <div style={{ width: '0%', height: '100%', background: color, borderRadius: '3px' }} />
      </div>
    </div>
  )
}

function PreservationBadge({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div style={{
      flex: 1, textAlign: 'center', padding: '12px',
      background: `${color}10`, borderRadius: '10px',
      border: `1px solid ${color}30`,
    }}>
      <div style={{ fontSize: '24px', fontWeight: 700, color }}>{count}</div>
      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{label}</div>
    </div>
  )
}

function AlertItem({ icon, color, text, done }: { icon: string; color: string; text: string; done: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '12px', background: done ? `${color}08` : '#f8fafc', borderRadius: '8px',
      border: `1px solid ${done ? color + '30' : '#f1f5f9'}`,
    }}>
      <span style={{ color: done ? color : '#94a3b8', fontSize: '18px' }}>{icon}</span>
      <span style={{ fontSize: '14px', color: done ? '#0f172a' : '#94a3b8', textDecoration: done ? 'none' : 'none', fontWeight: done ? 500 : 400 }}>
        {done && <span style={{ marginRight: '6px', color }}>✓</span>}
        {text}
      </span>
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
