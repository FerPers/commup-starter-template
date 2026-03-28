import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Redirect to setup wizard if user has no organization yet
  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/setup')

  return (
    <div style={{ padding: '32px' }}>

      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px' }}>
          Dashboard
        </h1>
        <p style={{ color: '#64748b', marginTop: '4px', fontSize: '15px' }}>
          Resumen general del estado de completamiento
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px', marginBottom: '32px',
      }}>
        <KpiCard label="Completamiento Mecánico" value="0%" color="#3b82f6" sub="0 / 0 ITRs" />
        <KpiCard label="Pre-Comisionamiento" value="0%" color="#f59e0b" sub="0 / 0 ITRs" />
        <KpiCard label="Comisionamiento" value="0%" color="#10b981" sub="0 / 0 ITRs" />
        <KpiCard label="Punch List Abiertos" value="0" color="#ef4444" sub="Cat A: 0 · Cat B: 0" danger />
      </div>

      {/* Secondary row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '32px' }}>

        {/* Preservation Status */}
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

        {/* Alerts */}
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>Alertas y Tareas Pendientes</h3>
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <AlertItem icon="◎" color="#3b82f6" text="Configura tu primera organización" />
            <AlertItem icon="⬡" color="#f59e0b" text="Crea tu primer proyecto" />
            <AlertItem icon="▤" color="#10b981" text="Define templates de ITR" />
            <AlertItem icon="◈" color="#8b5cf6" text="Importa tags desde Excel" />
          </div>
        </div>
      </div>

      {/* Empty state for projects */}
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
      </div>

    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────

function KpiCard({ label, value, color, sub, danger = false }: {
  label: string; value: string; color: string; sub: string; danger?: boolean
}) {
  return (
    <div style={{
      ...cardStyle,
      borderTop: `3px solid ${color}`,
    }}>
      <p style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>{label}</p>
      <p style={{
        fontSize: '36px', fontWeight: 700, color: danger ? color : '#0f172a',
        margin: '8px 0 4px', letterSpacing: '-1px',
      }}>
        {value}
      </p>
      <p style={{ fontSize: '12px', color: '#94a3b8' }}>{sub}</p>
      <div style={{
        marginTop: '12px', height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden',
      }}>
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

function AlertItem({ icon, color, text }: { icon: string; color: string; text: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '12px', background: '#f8fafc', borderRadius: '8px',
      border: '1px solid #f1f5f9',
    }}>
      <span style={{ color, fontSize: '18px' }}>{icon}</span>
      <span style={{ fontSize: '14px', color: '#475569' }}>{text}</span>
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
