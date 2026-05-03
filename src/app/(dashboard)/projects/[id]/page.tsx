import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import { Boxes, Award, TrendingUp } from 'lucide-react'
import { Card } from '@/components/ui'
import ProjectHeader from './ProjectHeader'

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const canEdit = ['owner', 'admin', 'architect'].includes(membership.role)
  const canDelete = membership.role === 'owner'

  const [
    { data: project },
    { data: phases },
    { data: disciplines },
    { count: tagCount },
    { data: itrCounts },
    { data: punchCounts },
    { data: certCounts },
    { count: signalCount },
    { count: loopCount },
    { count: interlockCount },
  ] = await Promise.all([
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
    supabase
      .from('signals')
      .select('id', { count: 'exact', head: true })
      .eq('tags.project_id', id),
    supabase
      .from('loops')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', id),
    supabase
      .from('interlocks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', id),
  ])

  if (!project) notFound()

  function formatDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  return (
    <div style={{ padding: 32 }}>

      <ProjectHeader project={project} canEdit={canEdit} canDelete={canDelete} />

      {/* Info strip */}
      <div style={{
        display: 'flex', gap: 0, background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)', marginBottom: 24, overflow: 'hidden',
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
            borderRight: i < arr.length - 1 ? '1px solid var(--gray-100)' : 'none',
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              {item.label}
            </div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-strong)' }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Digital Twin — hero entry */}
      <a
        href={`/projects/${project.id}/twin`}
        style={{ textDecoration: 'none', display: 'block', marginBottom: 24 }}
      >
        <div style={{
          background: 'linear-gradient(135deg, var(--gray-900) 0%, var(--primary-900) 60%, var(--primary-600) 100%)',
          borderRadius: 'var(--radius-lg)', padding: '22px 26px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 20, color: '#fff',
          boxShadow: '0 4px 14px rgba(37,99,235,0.25)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, minWidth: 0 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 'var(--radius-lg)',
              background: 'rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Boxes size={26} color="#fff" aria-hidden="true" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, letterSpacing: '-0.2px' }}>
                Digital Twin · Vista 360°
              </div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-300)', marginTop: 3 }}>
                Semáforo en tiempo real por tag — ITRs, punches, certs, preservation y P&ID
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success-500)', boxShadow: '0 0 8px var(--success-500)' }} />
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warning-500)' }} />
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger-500)' }} />
            <span style={{
              marginLeft: 10, padding: '7px 14px',
              background: 'rgba(255,255,255,0.15)', borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)', fontWeight: 600, whiteSpace: 'nowrap',
            }}>
              Abrir Twin →
            </span>
          </div>
        </div>
      </a>

      {/* Phase KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
        {(phases ?? []).map(phase => {
          const phaseItrs = (itrCounts ?? []).filter(i => i.phase_id === phase.id)
          const total = phaseItrs.length
          const approved = phaseItrs.filter(i => i.status === 'approved').length
          const pct = total > 0 ? Math.round((approved / total) * 100) : 0
          return (
          <Card key={phase.id} padding="md" style={{ borderTop: `3px solid ${phase.color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontWeight: 500, margin: 0 }}>{phase.name}</p>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-400)', margin: '2px 0 0' }}>Certificado: {phase.certificate_name}</p>
              </div>
              <span style={{
                padding: '2px 8px', borderRadius: 'var(--radius-pill)', fontSize: 10, fontWeight: 700,
                background: `${phase.color}18`, color: phase.color,
              }}>
                {phase.code}
              </span>
            </div>
            <p style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px', letterSpacing: '-1px' }}>{pct}%</p>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-400)', margin: '0 0 8px' }}>{approved} / {total} ITRs</p>
            <div style={{ height: 5, background: 'var(--gray-100)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: phase.color, borderRadius: 3 }} />
            </div>
          </Card>
          )
        })}
        {(() => {
          const openPunches = (punchCounts ?? []).filter(p => p.status !== 'closed' && p.status !== 'cancelled')
          const catA = openPunches.filter(p => p.category === 'A').length
          const catB = openPunches.filter(p => p.category === 'B').length
          return (
            <Card padding="md" style={{ borderTop: '3px solid var(--danger-500)' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontWeight: 500, margin: '0 0 10px' }}>Punch List Abiertos</p>
              <p style={{ fontSize: 32, fontWeight: 700, color: 'var(--danger-500)', margin: '0 0 4px', letterSpacing: '-1px' }}>{openPunches.length}</p>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-400)', margin: 0 }}>Cat A: {catA} · Cat B: {catB}</p>
            </Card>
          )
        })()}
      </div>

      {/* Disciplines + Coming soon modules */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Disciplines */}
        <Card padding="md">
          <h3 style={sectionTitle}>Disciplinas</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {(disciplines ?? []).map(d => (
              <span key={d.id} style={{
                padding: '5px 12px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--text-sm)', fontWeight: 500,
                background: `${d.color}15`, color: d.color, border: `1px solid ${d.color}30`,
              }}>
                {d.code} — {d.name}
              </span>
            ))}
          </div>
        </Card>

        {/* Tags + Signals — import links */}
        <Card padding="md">
          <h3 style={sectionTitle}>Tags / Equipos y Señales</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>

            {/* Tags de Equipos */}
            <ResourceRow
              title="Tags de Equipos"
              detail={tagCount && tagCount > 0
                ? <span style={{ color: 'var(--primary-500)', fontWeight: 500 }}>{tagCount} tags importados</span>
                : 'Mecánicos, eléctricos, tuberías… (Fase A)'}
              actions={
                <>
                  {(tagCount ?? 0) > 0 && (
                    <ResourceLink href={`/projects/${project.id}/tags`}>Ver tags →</ResourceLink>
                  )}
                  {canEdit && (
                    <ResourcePrimary href={`/projects/${project.id}/import`}>
                      {(tagCount ?? 0) > 0 ? 'Importar más' : 'Importar'}
                    </ResourcePrimary>
                  )}
                </>
              }
            />

            {/* Documentos P&ID */}
            <ResourceRow
              title="Documentos P&ID"
              detail="PDFs de planos de proceso para caminatas de verificación"
              actions={<ResourceLink href={`/projects/${project.id}/pid-documents`}>Gestionar →</ResourceLink>}
            />

            {/* Lista de Señales I&C */}
            <ResourceRow
              title="Lista de Señales I&C"
              detail={(signalCount ?? 0) > 0
                ? <span style={{ color: 'var(--success-500)', fontWeight: 500 }}>{signalCount} señales importadas</span>
                : 'AI/AO/DI/DO con rango, alarmas, P&IDs (Fases B/C)'}
              actions={
                <>
                  {(signalCount ?? 0) > 0 && (
                    <ResourceLink href={`/projects/${project.id}/signals`}>Ver señales →</ResourceLink>
                  )}
                  {canEdit && (
                    <ResourcePrimary href={`/projects/${project.id}/import-signals`} color="var(--success-500)">
                      {(signalCount ?? 0) > 0 ? 'Importar más' : 'Importar'}
                    </ResourcePrimary>
                  )}
                </>
              }
            />

            {/* Loops */}
            <ResourceRow
              title="Loops de Control"
              detail={(loopCount ?? 0) > 0
                ? <span style={{ color: '#8b5cf6', fontWeight: 500 }}>{loopCount} loops</span>
                : 'Lazos de control agrupados por subsistema'}
              actions={<ResourceLink href={`/projects/${project.id}/loops`}>Ver →</ResourceLink>}
            />

            {/* Interlocks */}
            <ResourceRow
              title="Interlocks / SIS"
              detail={(interlockCount ?? 0) > 0
                ? <span style={{ color: 'var(--danger-500)', fontWeight: 500 }}>{interlockCount} interlocks</span>
                : 'Causa → efecto, set point y acción de seguridad'}
              actions={<ResourceLink href={`/projects/${project.id}/interlocks`}>Ver →</ResourceLink>}
            />

          </div>
        </Card>
      </div>

      {/* Certificates badge */}
      {(() => {
        const issued = (certCounts ?? []).filter(c => c.status === 'issued').length
        return (
          <div style={{ marginTop: 16, marginBottom: 16 }}>
            <a href={`/projects/${project.id}/certificates`} style={{ textDecoration: 'none' }}>
              <div style={{
                background: issued > 0 ? 'var(--success-50)' : 'var(--card-bg)',
                border: `1px solid ${issued > 0 ? '#a7f3d0' : 'var(--border)'}`,
                borderRadius: 'var(--radius-lg)', padding: '14px 20px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                transition: 'box-shadow 0.15s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Award size={20} color="var(--success-700)" aria-hidden="true" />
                  <div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-strong)' }}>Certificados de Completación</div>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 1 }}>
                      {issued > 0 ? `${issued} certificado${issued > 1 ? 's' : ''} emitido${issued > 1 ? 's' : ''}` : 'Ver elegibilidad por subsistema'}
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--primary-500)', fontWeight: 500 }}>Ver →</span>
              </div>
            </a>
          </div>
        )
      })()}

      {/* KPIs card */}
      <div style={{ marginBottom: 16 }}>
        <a href={`/projects/${project.id}/kpis`} style={{ textDecoration: 'none' }}>
          <div style={{
            background: 'var(--card-bg)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', padding: '14px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <TrendingUp size={20} color="var(--primary-500)" aria-hidden="true" />
              <div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-strong)' }}>KPIs & S-curve</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 1 }}>
                  Avance por subsistema, curva S planificado vs real, export Excel
                </div>
              </div>
            </div>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--primary-500)', fontWeight: 500 }}>Ver →</span>
          </div>
        </a>
      </div>

      {/* ITRs + Punch List */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>

        {/* ITR card — real */}
        <Card padding="md">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={sectionTitle}>ITRs</h3>
            <a href={`/projects/${project.id}/itrs`} style={{ fontSize: 'var(--text-sm)', color: 'var(--primary-500)', textDecoration: 'none', fontWeight: 500 }}>
              Ver todos →
            </a>
          </div>
          {(itrCounts ?? []).length === 0 ? (
            <div style={{ padding: 24, background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-400)', margin: 0 }}>
                Sin ITRs asignados. Abre un tag y asigna un template.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[
                { key: 'not_started', label: 'Sin iniciar', color: 'var(--gray-500)',    bg: 'var(--gray-100)' },
                { key: 'in_progress', label: 'En progreso', color: 'var(--primary-500)', bg: 'var(--primary-50)' },
                { key: 'completed',   label: 'Completados', color: 'var(--success-500)', bg: 'var(--success-50)' },
                { key: 'approved',    label: 'Aprobados',   color: '#7c3aed',            bg: '#f5f3ff' },
              ].map(s => {
                const cnt = (itrCounts ?? []).filter(i => i.status === s.key).length
                return cnt > 0 ? (
                  <div key={s.key} style={{ padding: '10px 14px', background: s.bg, borderRadius: 'var(--radius-md)', textAlign: 'center', minWidth: 70 }}>
                    <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: s.color }}>{cnt}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
                  </div>
                ) : null
              })}
            </div>
          )}
        </Card>

        {/* Punch List card — real */}
        <Card padding="md">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={sectionTitle}>Punch List</h3>
            <a href={`/projects/${project.id}/punches`} style={{ fontSize: 'var(--text-sm)', color: 'var(--primary-500)', textDecoration: 'none', fontWeight: 500 }}>
              Ver todos →
            </a>
          </div>
          {(punchCounts ?? []).length === 0 ? (
            <div style={{ padding: 24, background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-400)', margin: 0 }}>
                Sin punches registrados. Se crean desde la ejecución de ITRs.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[
                { key: 'A', label: 'Cat A', color: 'var(--danger-500)',  bg: 'var(--danger-50)' },
                { key: 'B', label: 'Cat B', color: 'var(--warning-500)', bg: 'var(--warning-50)' },
                { key: 'C', label: 'Cat C', color: 'var(--gray-500)',    bg: 'var(--gray-50)' },
              ].map(s => {
                const open = (punchCounts ?? []).filter(p => p.category === s.key && p.status !== 'closed' && p.status !== 'cancelled').length
                const closed = (punchCounts ?? []).filter(p => p.category === s.key && (p.status === 'closed' || p.status === 'cancelled')).length
                return (
                  <div key={s.key} style={{ padding: '10px 14px', background: s.bg, borderRadius: 'var(--radius-md)', textAlign: 'center', minWidth: 70 }}>
                    <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: s.color }}>{open}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{s.label} abiertos</div>
                    {closed > 0 && <div style={{ fontSize: 10, color: 'var(--gray-400)', marginTop: 1 }}>{closed} cerrados</div>}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

    </div>
  )
}

const sectionTitle: React.CSSProperties = {
  fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-strong)', margin: 0,
}

function ResourceRow({ title, detail, actions }: { title: string; detail: React.ReactNode; actions: React.ReactNode }) {
  return (
    <div style={{ padding: '14px 16px', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-strong)' }}>{title}</div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-400)', marginTop: 2 }}>{detail}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}</div>
    </div>
  )
}

function ResourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} style={{
      padding: '6px 14px', background: 'var(--card-bg)', border: '1px solid var(--border)',
      color: 'var(--gray-600)', borderRadius: 'var(--radius-sm)',
      fontSize: 'var(--text-sm)', fontWeight: 500,
      textDecoration: 'none', whiteSpace: 'nowrap',
    }}>{children}</a>
  )
}

function ResourcePrimary({ href, children, color = 'var(--primary-500)' }: { href: string; children: React.ReactNode; color?: string }) {
  return (
    <a href={href} style={{
      padding: '6px 14px', background: color, color: '#fff',
      borderRadius: 'var(--radius-sm)',
      fontSize: 'var(--text-sm)', fontWeight: 500,
      textDecoration: 'none', whiteSpace: 'nowrap',
    }}>{children}</a>
  )
}
