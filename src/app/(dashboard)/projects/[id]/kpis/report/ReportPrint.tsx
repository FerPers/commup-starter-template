'use client'

import { useEffect } from 'react'
import type { SubsystemKpi } from '@/app/actions/kpi-snapshots'

type PhaseKpi = {
  id: string
  code: string
  name: string
  color: string
  total: number
  approved: number
  pct: number
}

interface Props {
  projectId: string
  projectName: string
  projectCode: string
  projectClient: string | null
  projectLocation: string | null
  startDate: string | null
  endDate: string | null
  orgName: string
  reportDate: string
  snapshotDate: string
  snapshotNum: number
  overallPct: number
  totalItrs: number
  totalApproved: number
  openCatA: number
  openCatB: number
  phaseKpis: PhaseKpi[]
  subsystemKpis: SubsystemKpi[]
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('es-CO', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

function TrafficLight({ pct, catA }: { pct: number; catA: number }) {
  const color = catA > 0 ? '#ef4444' : pct === 100 ? '#10b981' : pct > 0 ? '#f59e0b' : '#ef4444'
  const label = catA > 0 ? 'BLOQ' : pct === 100 ? '100%' : pct > 0 ? `${pct}%` : '0%'
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: '4px',
      background: color, color: 'white', fontSize: '10px', fontWeight: 700,
      fontFamily: 'monospace', letterSpacing: '0.03em',
    }}>
      {label}
    </span>
  )
}

export default function ReportPrint({
  projectId, projectName, projectCode, projectClient, projectLocation,
  startDate, endDate, orgName, reportDate, snapshotDate, snapshotNum,
  overallPct, totalItrs, totalApproved, openCatA, openCatB,
  phaseKpis, subsystemKpis,
}: Props) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 600)
    return () => clearTimeout(t)
  }, [])

  const printStyles = `
    @media print {
      .no-print { display: none !important; }
      body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page-break { page-break-before: always; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
    @media screen {
      body { background: #f1f5f9; }
      .report-wrapper { max-width: 860px; margin: 0 auto; padding: 24px; }
    }
  `

  const borderColor = '#d1d5db'
  const headerBg = '#0f172a'

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: printStyles }} />

      {/* Screen-only toolbar */}
      <div className="no-print" style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: '#0f172a', padding: '10px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
      }}>
        <span style={{ color: 'white', fontSize: '14px', fontWeight: 600 }}>
          Reporte de Progreso — {projectCode}
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => window.print()}
            style={{
              padding: '7px 18px', background: '#3b82f6', color: 'white',
              border: 'none', borderRadius: '7px', fontSize: '13px',
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            Imprimir / Guardar PDF
          </button>
          <a
            href={`/projects/${projectId}/kpis`}
            style={{
              padding: '7px 14px', background: 'rgba(255,255,255,0.1)', color: '#94a3b8',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', fontSize: '13px',
              textDecoration: 'none', fontWeight: 500,
            }}
          >
            ← Volver a KPIs
          </a>
        </div>
      </div>

      {/* Report body */}
      <div className="report-wrapper" style={{ paddingTop: '64px' }}>
        <div style={{
          background: 'white',
          border: `1px solid ${borderColor}`,
          borderRadius: '4px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          overflow: 'hidden',
        }}>

          {/* ── Header ── */}
          <div style={{ background: headerBg, padding: '28px 32px', color: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Reporte de Progreso de Completamiento
                </div>
                <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 4px', color: 'white', letterSpacing: '-0.3px' }}>
                  {projectName}
                </h1>
                <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                  {[projectClient, projectLocation].filter(Boolean).join(' · ') || orgName}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '28px', fontWeight: 800, color: overallPct === 100 ? '#34d399' : '#60a5fa', letterSpacing: '-1px' }}>
                  {overallPct}%
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Avance global</div>
              </div>
            </div>

            {/* Meta strip */}
            <div style={{
              display: 'flex', gap: '0', marginTop: '20px',
              background: 'rgba(255,255,255,0.06)', borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden',
            }}>
              {[
                { label: 'Código', value: projectCode },
                { label: 'Inicio', value: formatDate(startDate) },
                { label: 'Objetivo', value: formatDate(endDate) },
                { label: 'Snapshot', value: `#${snapshotNum} · ${snapshotDate}` },
                { label: 'Fecha reporte', value: reportDate },
              ].map((item, i, arr) => (
                <div key={item.label} style={{
                  flex: 1, padding: '10px 14px',
                  borderRight: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                }}>
                  <div style={{ fontSize: '9px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '3px' }}>{item.label}</div>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: '#e2e8f0' }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: '28px 32px' }}>

            {/* ── Resumen ejecutivo ── */}
            <section style={{ marginBottom: '28px' }}>
              <h2 style={sectionTitle}>Resumen Ejecutivo</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '12px' }}>
                {[
                  { label: 'Total ITRs', value: String(totalItrs), color: '#3b82f6' },
                  { label: 'Aprobados', value: String(totalApproved), color: '#10b981' },
                  { label: 'Punch A abiertos', value: String(openCatA), color: openCatA > 0 ? '#ef4444' : '#10b981' },
                  { label: 'Punch B abiertos', value: String(openCatB), color: openCatB > 0 ? '#f59e0b' : '#10b981' },
                ].map(c => (
                  <div key={c.label} style={{
                    padding: '14px 16px', border: `1px solid ${borderColor}`, borderRadius: '6px',
                    borderLeft: `3px solid ${c.color}`, textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: c.color }}>{c.value}</div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{c.label}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── KPI por Fase ── */}
            <section style={{ marginBottom: '28px' }}>
              <h2 style={sectionTitle}>KPI por Fase</h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Fase', 'Nombre', 'Total ITRs', 'Aprobados', 'Pendientes', '% Completado'].map(h => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {phaseKpis.map((phase, i) => (
                    <tr key={phase.id} style={{ background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ ...td, fontWeight: 700 }}>
                        <span style={{ padding: '2px 8px', borderRadius: '4px', background: `${phase.color}18`, color: phase.color, fontSize: '11px', fontWeight: 700 }}>
                          {phase.code}
                        </span>
                      </td>
                      <td style={td}>{phase.name}</td>
                      <td style={{ ...td, textAlign: 'center' }}>{phase.total}</td>
                      <td style={{ ...td, textAlign: 'center', color: '#10b981', fontWeight: 600 }}>{phase.approved}</td>
                      <td style={{ ...td, textAlign: 'center', color: phase.total - phase.approved > 0 ? '#f59e0b' : '#94a3b8' }}>
                        {phase.total - phase.approved}
                      </td>
                      <td style={{ ...td, minWidth: '140px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ flex: 1, height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${phase.pct}%`, height: '100%', background: phase.color, borderRadius: '3px' }} />
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: 600, minWidth: '32px', textAlign: 'right', color: '#0f172a' }}>
                            {phase.pct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {/* Total row */}
                  <tr style={{ background: '#f8fafc', borderTop: `2px solid ${borderColor}` }}>
                    <td colSpan={2} style={{ ...td, fontWeight: 700, color: '#0f172a' }}>TOTAL</td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700 }}>{totalItrs}</td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: '#10b981' }}>{totalApproved}</td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: '#f59e0b' }}>{totalItrs - totalApproved}</td>
                    <td style={{ ...td, fontWeight: 700 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${overallPct}%`, height: '100%', background: '#3b82f6', borderRadius: '3px' }} />
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 700, minWidth: '32px', textAlign: 'right', color: '#0f172a' }}>
                          {overallPct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            {/* ── Completamiento por Subsistema ── */}
            {subsystemKpis.length > 0 && (
              <section style={{ marginBottom: '28px' }}>
                <h2 style={sectionTitle}>Completamiento por Subsistema</h2>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {['Sistema', 'Subsistema', 'ITRs', 'Aprobados', '% Avance', 'Punch A', 'Punch B', 'Estado'].map(h => (
                        <th key={h} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {subsystemKpis.map((ss, i) => (
                      <tr key={ss.id} style={{ background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                        <td style={{ ...td, color: '#475569', fontWeight: 500 }}>{ss.systemCode}</td>
                        <td style={td}>
                          <div style={{ fontWeight: 500, color: '#0f172a' }}>{ss.code}</div>
                          <div style={{ fontSize: '10px', color: '#94a3b8' }}>{ss.name}</div>
                        </td>
                        <td style={{ ...td, textAlign: 'center' }}>{ss.totalItrs}</td>
                        <td style={{ ...td, textAlign: 'center', color: '#10b981', fontWeight: 500 }}>{ss.approvedItrs}</td>
                        <td style={{ ...td, minWidth: '100px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ flex: 1, height: '5px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{
                                width: `${ss.completionPct}%`, height: '100%', borderRadius: '3px',
                                background: ss.completionPct === 100 ? '#10b981' : ss.completionPct > 0 ? '#3b82f6' : '#e2e8f0',
                              }} />
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: 600, minWidth: '28px', textAlign: 'right', color: '#0f172a' }}>
                              {ss.completionPct}%
                            </span>
                          </div>
                        </td>
                        <td style={{ ...td, textAlign: 'center', color: ss.openCatA > 0 ? '#ef4444' : '#94a3b8', fontWeight: ss.openCatA > 0 ? 700 : 400 }}>
                          {ss.openCatA > 0 ? ss.openCatA : '—'}
                        </td>
                        <td style={{ ...td, textAlign: 'center', color: ss.openCatB > 0 ? '#f59e0b' : '#94a3b8', fontWeight: ss.openCatB > 0 ? 700 : 400 }}>
                          {ss.openCatB > 0 ? ss.openCatB : '—'}
                        </td>
                        <td style={{ ...td, textAlign: 'center' }}>
                          <TrafficLight pct={ss.completionPct} catA={ss.openCatA} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* ── Firmas ── */}
            <section style={{ marginTop: '36px' }}>
              <h2 style={sectionTitle}>Firmas y Aprobaciones</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginTop: '16px' }}>
                {['Project Manager', 'Inspector / QC', 'Cliente'].map(role => (
                  <div key={role} style={{ borderTop: `2px solid ${borderColor}`, paddingTop: '12px' }}>
                    <div style={{ height: '48px' }} />
                    <div style={{ borderTop: `1px solid ${borderColor}`, paddingTop: '6px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>{role}</div>
                      <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Nombre / Firma</div>
                    </div>
                    <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${borderColor}`, paddingTop: '6px' }}>
                      <div style={{ fontSize: '10px', color: '#94a3b8' }}>Fecha</div>
                      <div style={{ fontSize: '10px', color: '#94a3b8' }}>____/____/________</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Footer */}
            <div style={{
              marginTop: '32px', paddingTop: '16px',
              borderTop: `1px solid ${borderColor}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                Generado por CommUp · {reportDate}
              </span>
              <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                {projectCode} · Snapshot #{snapshotNum}
              </span>
            </div>

          </div>
        </div>
      </div>
    </>
  )
}

// ── Shared table styles ────────────────────────────────────────────────────

const sectionTitle: React.CSSProperties = {
  fontSize: '12px', fontWeight: 700, color: '#64748b',
  textTransform: 'uppercase', letterSpacing: '0.08em',
  margin: 0, paddingBottom: '8px', borderBottom: '2px solid #f1f5f9',
}

const th: React.CSSProperties = {
  padding: '8px 10px', fontSize: '10px', fontWeight: 700,
  color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em',
  textAlign: 'left', border: '1px solid #e2e8f0',
}

const td: React.CSSProperties = {
  padding: '8px 10px', fontSize: '12px', color: '#374151',
  border: '1px solid #f1f5f9', verticalAlign: 'middle',
}
