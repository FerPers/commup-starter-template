'use client'

const PROJECT_STATUS_CFG: Record<string, { label: string; color: string }> = {
  planning:  { label: 'Planificación', color: '#6366f1' },
  active:    { label: 'Activo',        color: '#10b981' },
  on_hold:   { label: 'En pausa',      color: '#f59e0b' },
  completed: { label: 'Completado',    color: '#3b82f6' },
  cancelled: { label: 'Cancelado',     color: '#94a3b8' },
}

type ProjectKpi = {
  id: string
  name: string
  code: string
  status: string
  start_date: string | null
  end_date: string | null
  totalItrs: number
  approvedItrs: number
  inProgressItrs: number
  completionPct: number
  openCatA: number
  openCatB: number
  issuedCerts: number
  totalCerts: number
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '11px', color: '#64748b' }}>Avance ITRs</span>
        <span style={{ fontSize: '12px', fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '3px', transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

export default function KpiGlobal({ projectKpis }: { projectKpis: ProjectKpi[] }) {
  const totalItrs      = projectKpis.reduce((s, p) => s + p.totalItrs, 0)
  const totalApproved  = projectKpis.reduce((s, p) => s + p.approvedItrs, 0)
  const totalCatA      = projectKpis.reduce((s, p) => s + p.openCatA, 0)
  const totalCatB      = projectKpis.reduce((s, p) => s + p.openCatB, 0)
  const totalCerts     = projectKpis.reduce((s, p) => s + p.issuedCerts, 0)
  const globalPct      = totalItrs > 0 ? Math.round((totalApproved / totalItrs) * 100) : 0

  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>KPIs</h1>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Resumen de todos los proyectos de la organización</p>
      </div>

      {/* Org-level summary bar */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px 24px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
              Avance global organización
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '36px', fontWeight: 800, color: '#0f172a' }}>{globalPct}%</span>
              <span style={{ fontSize: '13px', color: '#64748b' }}>{totalApproved} / {totalItrs} ITRs aprobados</span>
            </div>
            <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${globalPct}%`, background: globalPct >= 80 ? '#10b981' : globalPct >= 50 ? '#3b82f6' : '#f59e0b', borderRadius: '4px', transition: 'width 0.4s ease' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#ef4444' }}>{totalCatA}</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Punches Cat A</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#f59e0b' }}>{totalCatB}</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Punches Cat B</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#10b981' }}>{totalCerts}</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Certificados emitidos</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#3b82f6' }}>{projectKpis.filter(p => p.status === 'active').length}</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Proyectos activos</div>
            </div>
          </div>
        </div>
      </div>

      {/* Project cards */}
      {projectKpis.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <p style={{ fontSize: '14px', color: '#94a3b8' }}>No hay proyectos en la organización.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {projectKpis.map(p => {
            const stCfg  = PROJECT_STATUS_CFG[p.status] ?? PROJECT_STATUS_CFG.planning
            const barColor = p.completionPct >= 80 ? '#10b981' : p.completionPct >= 50 ? '#3b82f6' : '#f59e0b'

            return (
              <div
                key={p.id}
                style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}
              >
                {/* Card header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#3b82f615', border: '1px solid #3b82f625', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#3b82f6', flexShrink: 0 }}>
                      {p.code.slice(0, 6)}
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{p.name}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>
                        {[p.start_date?.slice(0, 7), p.end_date?.slice(0, 7)].filter(Boolean).join(' → ') || 'Sin fechas'}
                      </div>
                    </div>
                  </div>
                  <span style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, background: `${stCfg.color}18`, color: stCfg.color, border: `1px solid ${stCfg.color}30`, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {stCfg.label}
                  </span>
                </div>

                {/* Progress bar */}
                <ProgressBar pct={p.completionPct} color={barColor} />

                {/* Stats row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                  <div style={{ textAlign: 'center', padding: '10px 4px', background: '#f8fafc', borderRadius: '8px' }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>{p.totalItrs}</div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '1px' }}>Total ITRs</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '10px 4px', background: '#f0fdf4', borderRadius: '8px' }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#10b981' }}>{p.approvedItrs}</div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '1px' }}>Aprobados</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '10px 4px', background: p.openCatA > 0 ? '#fee2e2' : '#f8fafc', borderRadius: '8px' }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: p.openCatA > 0 ? '#ef4444' : '#64748b' }}>{p.openCatA}</div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '1px' }}>Cat A</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '10px 4px', background: p.openCatB > 0 ? '#fffbeb' : '#f8fafc', borderRadius: '8px' }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: p.openCatB > 0 ? '#f59e0b' : '#64748b' }}>{p.openCatB}</div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '1px' }}>Cat B</div>
                  </div>
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px', borderTop: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    {p.issuedCerts} cert. emitidos
                    {p.totalCerts > 0 && ` de ${p.totalCerts}`}
                  </span>
                  <a
                    href={`/projects/${p.id}/kpis`}
                    style={{ fontSize: '11px', color: '#3b82f6', textDecoration: 'none', fontWeight: 500 }}
                  >
                    Ver detalle →
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
