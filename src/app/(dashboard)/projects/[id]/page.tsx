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

  const [{ data: project }, { data: phases }, { data: disciplines }, { count: tagCount }, { data: itrCounts }, { data: punchCounts }, { data: certCounts }] = await Promise.all([
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
    supabase
      .from('itrs')
      .select('id, status, phase_id')
      .eq('project_id', id),
    supabase
      .from('punches')
      .select('id, category, status')
      .eq('project_id', id),
    supabase
      .from('certificates')
      .select('id, status')
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
        {(phases ?? []).map(phase => {
          const phaseItrs = (itrCounts ?? []).filter(i => i.phase_id === phase.id)
          const total = phaseItrs.length
          const approved = phaseItrs.filter(i => i.status === 'approved').length
          const pct = total > 0 ? Math.round((approved / total) * 100) : 0
          return (
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
            <p style={{ fontSize: '32px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-1px' }}>{pct}%</p>
            <p style={{ fontSize: '11px', color: '#94a3b8', margin: '0 0 8px' }}>{approved} / {total} ITRs</p>
            <div style={{ height: '5px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: phase.color, borderRadius: '3px' }} />
            </div>
          </div>
          )
        })}
        {(() => {
          const openPunches = (punchCounts ?? []).filter(p => p.status !== 'closed' && p.status !== 'cancelled')
          const catA = openPunches.filter(p => p.category === 'A').length
          const catB = openPunches.filter(p => p.category === 'B').length
          return (
            <div style={{
              background: 'white', borderRadius: '12px', padding: '18px 20px',
              border: '1px solid #e2e8f0', borderTop: '3px solid #ef4444',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
              <p style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, margin: '0 0 10px' }}>Punch List Abiertos</p>
              <p style={{ fontSize: '32px', fontWeight: 700, color: '#ef4444', margin: '0 0 4px', letterSpacing: '-1px' }}>{openPunches.length}</p>
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>Cat A: {catA} · Cat B: {catB}</p>
            </div>
          )
        })()}
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

            {/* Documentos P&ID */}
            <div style={{ padding: '14px 16px', background: '#f8fafc', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: '#0f172a' }}>Documentos P&ID</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>PDFs de planos de proceso para caminatas de verificación</div>
              </div>
              <a href={`/projects/${project.id}/pid-documents`} style={{ padding: '6px 14px', background: 'white', border: '1px solid #e2e8f0', color: '#475569', borderRadius: '7px', fontSize: '12px', fontWeight: 500, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
                Gestionar →
              </a>
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

      {/* Certificates badge */}
      {(() => {
        const issued = (certCounts ?? []).filter(c => c.status === 'issued').length
        return (
          <div style={{ marginBottom: '16px' }}>
            <a href={`/projects/${project.id}/certificates`} style={{ textDecoration: 'none' }}>
              <div style={{
                background: issued > 0 ? '#ecfdf5' : 'white',
                border: `1px solid ${issued > 0 ? '#a7f3d0' : '#e2e8f0'}`,
                borderRadius: '12px', padding: '14px 20px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                transition: 'box-shadow 0.15s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '20px' }}>◎</span>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>Certificados de Completación</div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '1px' }}>
                      {issued > 0 ? `${issued} certificado${issued > 1 ? 's' : ''} emitido${issued > 1 ? 's' : ''}` : 'Ver elegibilidad por subsistema'}
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: '13px', color: '#3b82f6', fontWeight: 500 }}>Ver →</span>
              </div>
            </a>
          </div>
        )
      })()}

      {/* KPIs card */}
      <div style={{ marginBottom: '16px' }}>
        <a href={`/projects/${project.id}/kpis`} style={{ textDecoration: 'none' }}>
          <div style={{
            background: 'white', border: '1px solid #e2e8f0',
            borderRadius: '12px', padding: '14px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '20px' }}>▲</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>KPIs & S-curve</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '1px' }}>
                  Avance por subsistema, curva S planificado vs real, export Excel
                </div>
              </div>
            </div>
            <span style={{ fontSize: '13px', color: '#3b82f6', fontWeight: 500 }}>Ver →</span>
          </div>
        </a>
      </div>

      {/* ITRs + Punch List */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>

        {/* ITR card — real */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={sectionTitle}>ITRs</h3>
            <a href={`/projects/${project.id}/itrs`} style={{ fontSize: '12px', color: '#3b82f6', textDecoration: 'none', fontWeight: 500 }}>
              Ver todos →
            </a>
          </div>
          {(itrCounts ?? []).length === 0 ? (
            <div style={{ padding: '24px', background: '#f8fafc', borderRadius: '10px', textAlign: 'center' }}>
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
                Sin ITRs asignados. Abre un tag y asigna un template.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {[
                { key: 'not_started', label: 'Sin iniciar', color: '#64748b', bg: '#f1f5f9' },
                { key: 'in_progress',  label: 'En progreso', color: '#3b82f6', bg: '#eff6ff' },
                { key: 'completed',    label: 'Completados',  color: '#10b981', bg: '#ecfdf5' },
                { key: 'approved',     label: 'Aprobados',    color: '#7c3aed', bg: '#f5f3ff' },
              ].map(s => {
                const cnt = (itrCounts ?? []).filter(i => i.status === s.key).length
                return cnt > 0 ? (
                  <div key={s.key} style={{ padding: '10px 14px', background: s.bg, borderRadius: '8px', textAlign: 'center', minWidth: '70px' }}>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: s.color }}>{cnt}</div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>{s.label}</div>
                  </div>
                ) : null
              })}
            </div>
          )}
        </div>

        {/* Punch List card — real */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={sectionTitle}>Punch List</h3>
            <a href={`/projects/${project.id}/punches`} style={{ fontSize: '12px', color: '#3b82f6', textDecoration: 'none', fontWeight: 500 }}>
              Ver todos →
            </a>
          </div>
          {(punchCounts ?? []).length === 0 ? (
            <div style={{ padding: '24px', background: '#f8fafc', borderRadius: '10px', textAlign: 'center' }}>
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
                Sin punches registrados. Se crean desde la ejecución de ITRs.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {[
                { key: 'A', label: 'Cat A', color: '#ef4444', bg: '#fee2e2' },
                { key: 'B', label: 'Cat B', color: '#f59e0b', bg: '#fffbeb' },
                { key: 'C', label: 'Cat C', color: '#64748b', bg: '#f8fafc' },
              ].map(s => {
                const open = (punchCounts ?? []).filter(p => p.category === s.key && p.status !== 'closed' && p.status !== 'cancelled').length
                const closed = (punchCounts ?? []).filter(p => p.category === s.key && (p.status === 'closed' || p.status === 'cancelled')).length
                return (
                  <div key={s.key} style={{ padding: '10px 14px', background: s.bg, borderRadius: '8px', textAlign: 'center', minWidth: '70px' }}>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: s.color }}>{open}</div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>{s.label} abiertos</div>
                    {closed > 0 && <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>{closed} cerrados</div>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
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
