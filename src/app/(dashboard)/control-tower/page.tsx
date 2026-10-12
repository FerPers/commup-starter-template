import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Card, Button, Select, Table, THead, TBody, TR, TH, TD, TableWrapper } from '@/components/ui'
import { GATE_STATUS_STYLE, isApproved, type MatrixGate } from '@/lib/readiness/gates'

type GateLevel = 'green' | 'yellow' | 'red'

type Gate = {
  phase_id: string
  code: string
  name: string
  certificate: string
  order: number
  itr_total: number
  itr_approved: number
  subsystems_total: number
  subsystems_red: number
  subsystems_yellow: number
  level: GateLevel
  ready: boolean
}

type Blocker = { code: string; severity: string; message: string; count?: number; pending?: number; limit?: number }

type Readiness = {
  system_id: string
  system_code: string
  system_name: string
  area_code: string
  area_name: string
  itr_total: number
  itr_approved: number
  itr_pct: number
  open_punches_a: number
  open_punches_b: number
  open_punches_c: number
  cat_b_limit: number | null
  gates: Gate[]
  blockers: Blocker[]
}

// Estado del hold point por sistema (fase 1): aprobado / listo / no listo / regresión.
function GateBadge({ gate, label, title, href }: { gate: MatrixGate; label: string; title: string; href: string }) {
  const st = GATE_STATUS_STYLE[gate.status]
  return (
    <Link href={href} title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none',
      padding: '3px 9px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--text-xs)', fontWeight: 600,
      background: st.bg, color: st.fg, border: `1.5px solid ${st.border}`,
    }}>
      <span style={{ fontSize: 10 }} aria-hidden="true">{st.icon}</span>
      {label}
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
        {pct.toFixed(0)}%
      </span>
    </div>
  )
}

export default async function ControlTowerPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }
  const orgId = membership.org_id

  const t = await getTranslations('ControlTower')

  const { data: projects } = await supabase
    .from('projects')
    .select('id, code, name')
    .eq('org_id', orgId)
    .order('code')

  const params = await searchParams
  const projectId = params.projectId ?? projects?.[0]?.id ?? null

  let rows: Readiness[] = []
  const gatesBySystem = new Map<string, MatrixGate[]>()
  if (projectId) {
    const [readiness, gates] = await Promise.all([
      supabase.rpc('compute_project_readiness', { p_project_id: projectId }),
      supabase.rpc('compute_project_gates', { p_project_id: projectId }),
    ])
    if (readiness.error) console.error('[ControlTower] readiness rpc error:', readiness.error)
    else rows = (readiness.data ?? []) as unknown as Readiness[]
    if (gates.error) console.error('[ControlTower] gates rpc error:', gates.error)
    for (const g of gates.data ?? []) gatesBySystem.set(g.system_id, (g.gates ?? []) as unknown as MatrixGate[])
  }

  const totals = rows.reduce(
    (acc, r) => ({
      systems: acc.systems + 1,
      punchesA: acc.punchesA + r.open_punches_a,
      punchesB: acc.punchesB + r.open_punches_b,
      itrPctSum: acc.itrPctSum + Number(r.itr_pct),
    }),
    { systems: 0, punchesA: 0, punchesB: 0, itrPctSum: 0 },
  )
  const avgItrPct = totals.systems > 0 ? totals.itrPctSum / totals.systems : 0

  // Por gate: sistemas aprobados y, aparte, los que ya están listos para aprobar.
  const gateDefs = rows.length > 0 ? (gatesBySystem.get(rows[0].system_id) ?? []) : []
  const byGate = gateDefs.map(g => {
    const statuses = rows.map(r => gatesBySystem.get(r.system_id)?.find(x => x.gate_id === g.gate_id)?.status)
    return {
      code: g.code,
      approved: statuses.filter(st => st && isApproved(st) && st !== 'regressed').length,
      toApprove: statuses.filter(st => st === 'ready' || st === 'ready_with_conditions').length,
      toSign: statuses.filter(st => st === 'pending_signatures').length,
    }
  })

  const blockerText = (b: Blocker): string => {
    switch (b.code) {
      case 'no_subsystems':        return t('blocker.noSubsystems')
      case 'no_itrs':              return t('blocker.noItrs')
      case 'itrs_incomplete':      return t('blocker.itrsIncomplete', { pending: b.pending ?? 0 })
      case 'punches_a_open':       return t('blocker.punchesA', { count: b.count ?? 0 })
      case 'punches_b_over_limit': return t('blocker.punchesBOverLimit', { count: b.count ?? 0, limit: b.limit ?? 0 })
      case 'punches_b_open':       return t('blocker.punchesB', { count: b.count ?? 0 })
      default:                     return b.message
    }
  }

  return (
    <div style={{ padding: 32, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('title')}</h1>
        <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)', margin: '4px 0 0' }}>{t('subtitle')}</p>
      </div>

      {/* Project picker */}
      {projects && projects.length > 0 && (
        <Card padding="sm" style={{ marginBottom: 16 }}>
          <form method="get" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label htmlFor="ct-project" style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--gray-600)' }}>{t('project')}</label>
            <Select
              id="ct-project"
              name="projectId"
              defaultValue={projectId ?? ''}
              fullWidth={false}
              style={{ flex: 1, maxWidth: 360 }}
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
              ))}
            </Select>
            <Button type="submit">{t('load')}</Button>
          </form>
        </Card>
      )}

      {/* KPI row */}
      {rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
          <Card padding="md">
            <div style={kpiLabel}>{t('kpi.systems')}</div>
            <div style={{ ...kpiValue, color: 'var(--text-strong)' }}>{totals.systems}</div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 2 }}>{t('kpi.avgItr', { pct: avgItrPct.toFixed(1) })}</div>
          </Card>
          <Card padding="md" style={{ gridColumn: 'span 2' }}>
            <div style={kpiLabel}>{t('kpi.approvedByGate')}</div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 4 }}>
              {byGate.map(g => (
                <div key={g.code}>
                  <div style={{ ...kpiValue, marginTop: 0, color: g.approved === totals.systems ? 'var(--success-500)' : 'var(--text-strong)' }}>
                    {g.approved}/{totals.systems}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                    {g.code}{g.toApprove > 0 && <span style={{ color: 'var(--success-700)' }}> · {t('kpi.toApprove', { count: g.toApprove })}</span>}
                    {g.toSign > 0 && <span style={{ color: '#1d4ed8' }}> · {t('kpi.toSign', { count: g.toSign })}</span>}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 6 }}>
              {rows[0]?.cat_b_limit == null
                ? t('kpi.catBNoLimit')
                : t('kpi.catBLimit', { limit: rows[0].cat_b_limit })}
            </div>
          </Card>
          <Card padding="md">
            <div style={kpiLabel}>{t('kpi.punchesOpen')}</div>
            <div style={{ ...kpiValue, color: 'var(--danger-500)' }}>
              {totals.punchesA}<span style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)', fontWeight: 500 }}> A</span>
              {' · '}
              {totals.punchesB}<span style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)', fontWeight: 500 }}> B</span>
            </div>
          </Card>
        </div>
      )}

      {/* Systems table */}
      {rows.length === 0 ? (
        <Card padding="lg" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          {projectId ? t('empty') : t('selectProject')}
        </Card>
      ) : (
        <TableWrapper>
          <div style={{ overflowX: 'auto' }}>
            <Table aria-label={t('title')}>
              <THead>
                <TR>
                  <TH style={{ position: 'sticky', left: 0, background: 'var(--gray-50)', zIndex: 2, minWidth: 140 }}>{t('col.area')}</TH>
                  <TH style={{ minWidth: 160 }}>{t('col.system')}</TH>
                  <TH style={{ width: 220 }}>{t('col.itrs')}</TH>
                  <TH style={{ width: 80, textAlign: 'center' }}>{t('col.punchA')}</TH>
                  <TH style={{ width: 80, textAlign: 'center' }}>{t('col.punchB')}</TH>
                  <TH style={{ width: 80, textAlign: 'center' }}>{t('col.punchC')}</TH>
                  <TH style={{ width: 240 }}>{t('col.gates')}</TH>
                  <TH style={{ minWidth: 220 }}>{t('col.topBlocker')}</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map(r => {
                  const topBlocker = r.blockers[0]
                  return (
                    <TR key={r.system_id}>
                      <TD style={{ position: 'sticky', left: 0, background: 'var(--card-bg)', zIndex: 1 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{r.area_code}</div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{r.area_name}</div>
                      </TD>
                      <TD>
                        <Link href={`/control-tower/${r.system_id}`} style={{ fontWeight: 600, color: 'var(--text-strong)', textDecoration: 'none' }}>{r.system_code}</Link>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{r.system_name}</div>
                      </TD>
                      <TD>
                        <Bar pct={Number(r.itr_pct)} />
                        <div style={{ fontSize: 10, color: 'var(--gray-400)', marginTop: 2 }}>
                          {r.itr_approved}/{r.itr_total} {t('approved')}
                        </div>
                      </TD>
                      <TD style={{ textAlign: 'center', color: r.open_punches_a > 0 ? 'var(--danger-500)' : 'var(--gray-400)', fontWeight: 600 }}>
                        {r.open_punches_a}
                      </TD>
                      <TD style={{ textAlign: 'center', color: r.open_punches_b > 0 ? 'var(--warning-500)' : 'var(--gray-400)', fontWeight: 600 }}>
                        {r.open_punches_b}
                      </TD>
                      <TD style={{ textAlign: 'center', color: r.open_punches_c > 0 ? 'var(--gray-500)' : 'var(--gray-300)', fontWeight: 600 }}>
                        {r.open_punches_c}
                      </TD>
                      <TD>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {(gatesBySystem.get(r.system_id) ?? []).map(g => (
                            <GateBadge
                              key={g.gate_id}
                              gate={g}
                              label={g.code}
                              href={`/control-tower/${r.system_id}`}
                              title={t('gateTitle', { name: g.name, status: t(`gateStatus.${g.status}`), failing: g.failing })}
                            />
                          ))}
                        </div>
                      </TD>
                      <TD style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                        {topBlocker ? blockerText(topBlocker) : <span style={{ color: 'var(--success-500)', fontWeight: 600 }}>{t('noBlockers')}</span>}
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
