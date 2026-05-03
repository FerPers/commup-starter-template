import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Card, Button, Select, Table, THead, TBody, TR, TH, TD, TableWrapper } from '@/components/ui'

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
  ready_mc: boolean
  ready_rfsu: boolean
  ready_rfc: boolean
  blockers: Array<{ code: string; severity: string; message: string; count?: number; pending?: number }>
}

function GateBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 9px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--text-xs)', fontWeight: 600,
      background: ok ? 'var(--success-50)' : 'var(--danger-50)',
      color:      ok ? 'var(--success-700)' : 'var(--danger-700)',
      border: `1px solid ${ok ? '#a7f3d0' : '#fecaca'}`,
    }}>
      <span style={{ fontSize: 10 }} aria-hidden="true">{ok ? '●' : '○'}</span>
      {label}
    </span>
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
  if (projectId) {
    const { data, error } = await supabase.rpc('compute_project_readiness', {
      p_project_id: projectId,
    })
    if (error) {
      console.error('[ControlTower] rpc error:', error)
    } else {
      rows = (data ?? []) as Readiness[]
    }
  }

  const totals = rows.reduce(
    (acc, r) => ({
      systems: acc.systems + 1,
      mc:   acc.mc   + (r.ready_mc   ? 1 : 0),
      rfsu: acc.rfsu + (r.ready_rfsu ? 1 : 0),
      rfc:  acc.rfc  + (r.ready_rfc  ? 1 : 0),
      punchesA: acc.punchesA + r.open_punches_a,
      punchesB: acc.punchesB + r.open_punches_b,
      itrPctSum: acc.itrPctSum + Number(r.itr_pct),
    }),
    { systems: 0, mc: 0, rfsu: 0, rfc: 0, punchesA: 0, punchesB: 0, itrPctSum: 0 },
  )
  const avgItrPct = totals.systems > 0 ? totals.itrPctSum / totals.systems : 0

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
          <Card padding="md">
            <div style={kpiLabel}>{t('kpi.readyMc')}</div>
            <div style={{ ...kpiValue, color: 'var(--success-500)' }}>{totals.mc}/{totals.systems}</div>
          </Card>
          <Card padding="md">
            <div style={kpiLabel}>{t('kpi.readyRfsu')}</div>
            <div style={{ ...kpiValue, color: '#7c3aed' }}>{totals.rfsu}/{totals.systems}</div>
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
                        <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{r.system_code}</div>
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
                          <GateBadge ok={r.ready_mc}   label="MC" />
                          <GateBadge ok={r.ready_rfsu} label="RFSU" />
                          <GateBadge ok={r.ready_rfc}  label="RFC" />
                        </div>
                      </TD>
                      <TD style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                        {topBlocker ? topBlocker.message : <span style={{ color: 'var(--success-500)', fontWeight: 600 }}>{t('noBlockers')}</span>}
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
