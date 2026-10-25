import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Card, Table, THead, TBody, TR, TH, TD, TableWrapper } from '@/components/ui'
import { gateCellStyle, type MatrixGate } from '@/lib/readiness/gates'
import { TONE_STYLE, gateState } from '@/lib/states'
import { ROW_STATES, blockerCount, filterMatrix, nextGate, parseMatrixFilters, readinessSummary, rowState, type RowState } from '@/lib/readiness/matrix'
import { loadMatrix, type MatrixData } from '@/lib/readiness/matrix-server'
import ReadinessFilters from './ReadinessFilters'

// Estado del hold point por sistema (fase 1): aprobado / listo / no listo / regresión.
// ⛓ = bloqueado por un sistema del que depende (fase 2).
function GateBadge({ gate, label, title, href, blocked }: { gate: MatrixGate; label: string; title: string; href: string; blocked?: boolean }) {
  const st = gateCellStyle(gate)
  return (
    <Link href={href} title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none',
      padding: '3px 9px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--text-xs)', fontWeight: 600,
      background: st.bg, color: st.fg, border: `1.5px ${st.borderStyle} ${st.border}`,
    }}>
      <span style={{ fontSize: 12 }} aria-hidden="true">{st.icon}</span>
      {label}
      {blocked && <span aria-hidden="true" style={{ fontSize: 12 }}>⛓</span>}
    </Link>
  )
}

function Bar({ pct }: { pct: number }) {
  const color = pct >= 100
    ? 'var(--success-500)'
    : pct >= 70 ? 'var(--primary-500)'
    : pct >= 30 ? 'var(--warning-500)'
    : 'var(--danger-500)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--gray-100)', borderRadius: 'var(--radius-pill)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-strong)', minWidth: 42, textAlign: 'right' }}>
        {pct.toFixed(1)}%
      </span>
    </div>
  )
}

// A08/A47: el color del siguiente gate = tono del contrato (listo y por firmar esperan a otra persona, en violeta).
const STATE_TONE: Record<RowState, string> = {
  regressed: TONE_STYLE.bad.fg, blocked: TONE_STYLE.bad.fg, nodata: TONE_STYLE.nodata.fg, working: TONE_STYLE.work.fg,
  signing: TONE_STYLE.wait.fg, ready: TONE_STYLE.wait.fg, done: TONE_STYLE.ok.fg,
}

export default async function ReadinessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const orgId = ctx.orgId
  const [{ id: projectId }, params0] = await Promise.all([params, searchParams])

  const [t, tg, ts, { data: project }] = await Promise.all([
    getTranslations('ControlTower'),
    getTranslations('Gates'),
    getTranslations('States'),
    supabase.from('projects').select('id, code, name').eq('id', projectId).eq('org_id', orgId).maybeSingle(),
  ])
  if (!project) notFound()

  // N2a: readiness vive dentro del proyecto; los filtros van en la URL y se aplican al cambiarlos.
  const filters = parseMatrixFilters(params0)
  const data: MatrixData = await loadMatrix(supabase, projectId, orgId)
  const rows = data.rows
  const shown = filterMatrix(rows, filters, {
    commitment: (s, g) => data.commitments.get(`${s}:${g}`) ?? null,
    changedIds: data.changedIds,
    today: data.today,
  })

  // D-18: dos números canónicos — avance físico ponderado (ITR aprobados × peso de gate) y readiness (gates
  // aprobados vigentes / total), con la misma definición que KPIs.
  const weightedVals = [...data.weighted.values()]
  const weightedItrs = weightedVals.reduce((sum, w) => sum + w.itrs, 0)
  const projectWeighted = weightedItrs > 0 ? weightedVals.reduce((sum, w) => sum + w.pct * w.itrs, 0) / weightedItrs : 0
  const readiness = readinessSummary(rows.map(r => r.gates))
  const punchTotals = [...data.punches.values()].reduce((acc, p) => ({ a: acc.a + p.a, b: acc.b + p.b }), { a: 0, b: 0 })

  // Por gate: sistemas aprobados y, aparte, los que ya están listos para aprobar o esperan firmas.
  const gateDefs = rows[0]?.gates ?? []
  const byGate = gateDefs.map(g => {
    const statuses = rows.map(r => r.gates.find(x => x.gate_id === g.gate_id)?.status)
    return {
      code: g.code,
      approved: statuses.filter(st => st === 'approved' || st === 'approved_with_conditions').length,
      toApprove: statuses.filter(st => st === 'ready' || st === 'ready_with_conditions').length,
      toSign: statuses.filter(st => st === 'pending_signatures').length,
    }
  })
  const areas = [...new Map(rows.map(r => [r.area_code, r.area_name])).entries()].sort((a, b) => a[0].localeCompare(b[0]))

  const blockerText = (g: MatrixGate): string => {
    if (g.status === 'pending_signatures') return t('next.signing')
    if (g.status === 'ready' || g.status === 'ready_with_conditions') return t('next.ready')
    if (!g.blocker) return t(`gateStatus.${g.status}`)
    const label = g.blocker.label ?? tg(`kind.${g.blocker.kind}`)
    const n = blockerCount(g.blocker)
    return n ? t('next.blockerCount', { label, count: n }) : label
  }
  const query = new URLSearchParams(Object.entries(params0).filter(([, v]) => !!v) as [string, string][])
  const systemHref = (systemId: string, gateId?: string) => `/projects/${projectId}/systems/${systemId}${gateId ? `?gate=${gateId}` : ''}`

  return (
    <div style={{ padding: 'clamp(12px, 4vw, 32px)', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px' }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('title')}</h1>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)', margin: '4px 0 0' }}>{project.code} · {project.name} · {t('subtitle')}</p>
        </div>
        <a href={`/projects/${projectId}/readiness/export?${query.toString()}`} style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--primary-700)', minHeight: 40, display: 'inline-flex', alignItems: 'center' }}>
          ↓ {t('export')}
        </a>
      </div>

      <ReadinessFilters
        gates={gateDefs.map(g => g.code)}
        areas={areas.map(([code, name]) => ({ code, name }))}
        states={ROW_STATES.map(s => ({ value: s, label: t(`rowState.${s}`) }))}
      />

      {/* KPI row */}
      {rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, margin: '16px 0' }}>
          <Card padding="md">
            <div style={kpiLabel}>{t('kpi.systems')}</div>
            <div style={{ ...kpiValue, color: 'var(--text-strong)' }}>{rows.length}</div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 2 }}>{t('kpi.physical', { pct: (projectWeighted * 100).toFixed(1) })}</div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 2 }}>{t('kpi.readiness', { done: readiness.done, total: readiness.total, pct: (readiness.pct * 100).toFixed(1) })}</div>
          </Card>
          <Card padding="md" style={{ gridColumn: 'span 2' }}>
            <div style={kpiLabel}>{t('kpi.approvedByGate')}</div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 4 }}>
              {byGate.map(g => (
                <div key={g.code}>
                  <div style={{ ...kpiValue, marginTop: 0, color: g.approved === rows.length ? 'var(--success-700)' : 'var(--text-strong)' }}>
                    {g.approved}/{rows.length}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                    {g.code}{g.toApprove > 0 && <span style={{ color: 'var(--success-700)' }}> · {t('kpi.toApprove', { count: g.toApprove })}</span>}
                    {g.toSign > 0 && <span style={{ color: 'var(--primary-700)' }}> · {t('kpi.toSign', { count: g.toSign })}</span>}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 6 }}>
              {data.catBLimit == null ? t('kpi.catBNoLimit') : t('kpi.catBLimit', { limit: data.catBLimit })}
            </div>
          </Card>
          <Card padding="md">
            <div style={kpiLabel}>{t('kpi.punchesOpen')}</div>
            <div style={{ ...kpiValue, color: 'var(--danger-700)' }}>
              {punchTotals.a}<span style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)', fontWeight: 500 }}> A</span>
              {' · '}
              {punchTotals.b}<span style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)', fontWeight: 500 }}> B</span>
            </div>
          </Card>
        </div>
      )}

      {/* Systems table */}
      {rows.length === 0 ? (
        <Card padding="lg" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          {t('empty')}
        </Card>
      ) : (
        <TableWrapper>
          <div style={{ padding: '8px 12px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {t('showing', { shown: shown.length, total: rows.length })}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <Table aria-label={t('title')}>
              <THead>
                <TR>
                  <TH style={{ position: 'sticky', left: 0, background: 'var(--gray-50)', zIndex: 2, minWidth: 140 }}>{t('col.area')}</TH>
                  <TH style={{ minWidth: 160 }}>{t('col.system')}</TH>
                  <TH style={{ width: 180 }}>{t('col.physical')}</TH>
                  <TH style={{ width: 64, textAlign: 'center' }}>{t('col.punchA')}</TH>
                  <TH style={{ width: 64, textAlign: 'center' }}>{t('col.punchB')}</TH>
                  <TH style={{ width: 240 }}>{t('col.gates')}</TH>
                  <TH style={{ minWidth: 260 }}>{t('col.next')}</TH>
                </TR>
              </THead>
              <TBody>
                {shown.map(r => {
                  const info = data.sysInfo.get(r.system_id)
                  const w = data.weighted.get(r.system_id)
                  const p = data.punches.get(r.system_id) ?? { a: 0, b: 0 }
                  const next = nextGate(r.gates)
                  const state = rowState(r.gates)
                  const commit = next ? data.commitments.get(`${r.system_id}:${next.gate_id}`) : undefined
                  const blockedBy = next ? data.blocks.get(`${r.system_id}:${next.gate_id}`) : undefined
                  const conditions = r.gates.reduce((n, g) => n + (g.approval?.id ? (data.openConditions.get(g.approval.id) ?? 0) : 0), 0)
                  const parts = [info?.system_type && t(`systemType.${info.system_type}`), info?.priority && `P${info.priority}`].filter(Boolean)
                  return (
                    <TR key={r.system_id}>
                      <TD style={{ position: 'sticky', left: 0, background: 'var(--card-bg)', zIndex: 1 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{r.area_code}</div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{r.area_name}</div>
                      </TD>
                      <TD>
                        <Link href={systemHref(r.system_id)} style={{ fontWeight: 600, color: 'var(--text-strong)', textDecoration: 'none' }}>{r.system_code}</Link>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{r.system_name}</div>
                        {parts.length > 0 && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginTop: 2 }}>{parts.join(' · ')}</div>}
                      </TD>
                      <TD>
                        <Bar pct={(w?.pct ?? 0) * 100} />
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{t('itrsWeighing', { count: w?.itrs ?? 0 })}</div>
                      </TD>
                      <TD style={{ textAlign: 'center', color: p.a > 0 ? 'var(--danger-700)' : 'var(--text-muted)', fontWeight: 600 }}>{p.a}</TD>
                      <TD style={{ textAlign: 'center', color: p.b > 0 ? 'var(--warning-700)' : 'var(--text-muted)', fontWeight: 600 }}>{p.b}</TD>
                      <TD>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {r.gates.map(g => {
                            const by = data.blocks.get(`${r.system_id}:${g.gate_id}`)
                            const gs = gateState({ status: g.status, workState: g.work_state })
                            const title = t('gateTitle', { name: g.name, status: ts(`${gs.family}.${gs.key}`, gs.params), failing: g.failing })
                            return (
                              <GateBadge key={g.gate_id} gate={g} label={g.code} href={systemHref(r.system_id, g.gate_id)} blocked={!!by}
                                title={by ? `${title}\n${t('blockedBy', { systems: by.join(', ') })}` : title} />
                            )
                          })}
                        </div>
                      </TD>
                      <TD style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                        {next ? (
                          <>
                            <div>
                              <strong style={{ color: STATE_TONE[state] }}>{next.code}</strong>
                              {' · '}{blockedBy ? t('blockedBy', { systems: blockedBy.join(', ') }) : blockerText(next)}
                            </div>
                            {(!!commit || conditions > 0) && (
                              <div style={{ fontSize: 'var(--text-xs)', marginTop: 2 }}>
                                {commit && <span style={{ color: commit < data.today ? 'var(--danger-700)' : 'var(--text-muted)' }}>{t('committedOn', { date: commit })}</span>}
                                {commit && conditions > 0 && ' · '}
                                {conditions > 0 && <span style={{ color: 'var(--warning-700)' }}>{t('conditionsOpen', { count: conditions })}</span>}
                              </div>
                            )}
                          </>
                        ) : (
                          <span style={{ color: 'var(--success-700)', fontWeight: 600 }}>
                            {t('noBlockers')}{conditions > 0 && <span style={{ color: 'var(--warning-700)', fontWeight: 500 }}> · {t('conditionsOpen', { count: conditions })}</span>}
                          </span>
                        )}
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </div>
        </TableWrapper>
      )}
    </div>
  )
}

const kpiLabel: React.CSSProperties = {
  fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '.05em',
}
const kpiValue: React.CSSProperties = {
  fontSize: 28, fontWeight: 700, marginTop: 4,
}
