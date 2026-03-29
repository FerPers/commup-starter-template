import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

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

  const canEdit = ['owner', 'admin', 'architect'].includes(membership.role)

  const [{ data: project }, { data: phases }, { data: disciplines }, { count: tagCount }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, code, location, client, start_date, end_date, status, created_at')
      .eq('id', id)
      .eq('org_id', membership.org_id)
      .single(),
    supabase
      .from('project_phases')
      .select('id, code, name, color, order_index, certificate_name')
      .eq('org_id', membership.org_id)
      .order('order_index'),
    supabase
      .from('disciplines')
      .select('id, code, name, color')
      .eq('org_id', membership.org_id),
    supabase
      .from('tags')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', id),
  ])

  if (!project) notFound()

  function formatDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  const statusColor = project.status === 'active' ? '#10b981' : '#94a3b8'
  const statusLabel = project.status === 'active' ? 'Activo' : 'Inactivo'

  return (
    <div style={{ padding: '32px' }}>

      {/* Back + Header */}
      <div style={{ marginBottom: '28px' }}>
        <a href="/projects" style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          fontSize: '13px', color: '#64748b', textDecoration: 'none', marginBottom: '16px',
        }}>
          ← Proyectos
        </a>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '14px',
              background: '#3b82f615', border: '1px solid #3b82f625',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12px', fontWeight: 700, color: '#3b82f6', flexShrink: 0,
            }}>
              {project.code.slice(0, 6)}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px', margin: 0 }}>
                  {project.name}
                </h1>
                <span style={{
                  padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
                  background: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}30`,
                }}>
                  {statusLabel}
                </span>
              </div>
              <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0' }}>
                {[project.client, project.location].filter(Boolean).join(' · ') || 'Sin cliente / ubicación'}
              </p>
            </div>
          </div>

          {canEdit && (
            <button style={{
              padding: '9px 18px', background: 'white', border: '1px solid #e2e8f0',
              borderRadius: '8px', fontSize: '13px', color: '#475569', cursor: 'pointer',
            }}>
              Editar proyecto
            </button>
          )}
        </div>
      </div>

      {/* Info strip */}
      <div style={{
        display: 'flex', gap: '0', background: 'white', borderRadius: '12px',
        border: '1px solid #e2e8f0', marginBottom: '24px', overflow: 'hidden',
      }}>
        {[
          { label: 'Código', value: project.code },
          { label: 'Cliente', value: project.client || '—' },
          { label: 'Ubicación', value: project.location || '—' },
          { label: 'Inicio', value: formatDate(project.start_date) },
          { label: 'Objetivo', value: formatDate(project.end_date) },
        ].map((item, i, arr) => (
          <div key={item.label} style={{
            flex: 1, padding: '14px 20px',
            borderRight: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none',
          }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
              {item.label}
            </div>
            <div style={{ fontSize: '13px', fontWeight: 500, color: '#0f172a' }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Phase KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        {(phases ?? []).map(phase => (
          <div key={phase.id} style={{
            background: 'white', borderRadius: '12px', padding: '18px 20px',
            border: '1px solid #e2e8f0', borderTop: `3px solid ${phase.color}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div>
                <p style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, margin: 0 }}>{phase.name}</p>
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>Certificado: {phase.certificate_name}</p>
              </div>
              <span style={{
                padding: '2px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 700,
                background: `${phase.color}18`, color: phase.color,
              }}>
                {phase.code}
              </span>
            </div>
            <p style={{ fontSize: '32px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-1px' }}>0%</p>
            <p style={{ fontSize: '11px', color: '#94a3b8', margin: '0 0 8px' }}>0 / 0 ITRs</p>
            <div style={{ height: '5px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: '0%', height: '100%', background: phase.color, borderRadius: '3px' }} />
            </div>
          </div>
        ))}
        <div style={{
          background: 'white', borderRadius: '12px', padding: '18px 20px',
          border: '1px solid #e2e8f0', borderTop: '3px solid #ef4444',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <p style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, margin: '0 0 10px' }}>Punch List Abiertos</p>
          <p style={{ fontSize: '32px', fontWeight: 700, color: '#ef4444', margin: '0 0 4px', letterSpacing: '-1px' }}>0</p>
          <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>Cat A: 0 · Cat B: 0</p>
        </div>
      </div>

      {/* Disciplines + Coming soon modules */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* Disciplines */}
        <div style={cardStyle}>
          <h3 style={sectionTitle}>Disciplinas</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
            {(disciplines ?? []).map(d => (
              <span key={d.id} style={{
                padding: '5px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 500,
                background: `${d.color}15`, color: d.color, border: `1px solid ${d.color}30`,
              }}>
                {d.code} — {d.name}
              </span>
            ))}
          </div>
        </div>

        {/* Tags + Signals — import links */}
        <div style={cardStyle}>
          <h3 style={sectionTitle}>Tags / Equipos y Señales</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px' }}>

            {/* Tags de Equipos */}
            <div style={{ padding: '14px 16px', background: '#f8fafc', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: '#0f172a' }}>Tags de Equipos</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                  {tagCount && tagCount > 0
                    ? <span style={{ color: '#3b82f6', fontWeight: 500 }}>{tagCount} tags importados</span>
                    : 'Mecánicos, eléctricos, tuberías… (Fase A)'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                {(tagCount ?? 0) > 0 && (
                  <a href={`/projects/${project.id}/tags`} style={{ padding: '6px 14px', background: 'white', border: '1px solid #e2e8f0', color: '#475569', borderRadius: '7px', fontSize: '12px', fontWeight: 500, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    Ver tags →
                  </a>
                )}
                {canEdit && (
                  <a href={`/projects/${project.id}/import`} style={{ padding: '6px 14px', background: '#3b82f6', color: 'white', borderRadius: '7px', fontSize: '12px', fontWeight: 500, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    {(tagCount ?? 0) > 0 ? 'Importar más' : 'Importar'}
                  </a>
                )}
              </div>
            </div>

            {/* Lista de Señales I&C */}
            <div style={{ padding: '14px 16px', background: '#f8fafc', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: '#0f172a' }}>Lista de Señales I&C</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>AI/AO/DI/DO con rango, alarmas, P&IDs (Fases B/C)</div>
              </div>
              {canEdit && (
                <a href={`/projects/${project.id}/import-signals`} style={{ padding: '6px 14px', background: '#10b981', color: 'white', borderRadius: '7px', fontSize: '12px', fontWeight: 500, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                  Importar
                </a>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* ITRs + Punch List — coming soon */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
        <ComingSoon title="ITRs" icon="✓" description="Define y ejecuta Inspection & Test Records por tag y disciplina." />
        <ComingSoon title="Punch List" icon="⚑" description="Registra y gestiona observaciones por fase con bloqueo de certificados." />
      </div>

    </div>
  )
}

function ComingSoon({ title, icon, description }: { title: string; icon: string; description: string }) {
  return (
    <div style={cardStyle}>
      <h3 style={sectionTitle}>{title}</h3>
      <div style={{ marginTop: '16px', padding: '24px', background: '#f8fafc', borderRadius: '10px', textAlign: 'center' }}>
        <div style={{ fontSize: '28px', marginBottom: '8px', opacity: 0.4 }}>{icon}</div>
        <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>{description}</p>
      </div>
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  background: 'white', borderRadius: '14px', padding: '20px 22px',
  border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
}
const sectionTitle: React.CSSProperties = {
  fontSize: '14px', fontWeight: 600, color: '#0f172a', margin: 0,
}
