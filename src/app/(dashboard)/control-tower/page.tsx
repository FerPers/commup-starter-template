import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

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

const cardStyle: React.CSSProperties = {
  background: 'white', borderRadius: '14px', padding: '24px',
  border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
}

function GateBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600,
      background: ok ? '#ecfdf5' : '#fef2f2',
      color:      ok ? '#047857' : '#b91c1c',
      border: `1px solid ${ok ? '#a7f3d0' : '#fecaca'}`,
    }}>
      <span style={{ fontSize: 10 }}>{ok ? '●' : '○'}</span>
      {label}
    </span>
  )
}

function Bar({ pct }: { pct: number }) {
  const color = pct >= 100 ? '#10b981' : pct >= 70 ? '#3b82f6' : pct >= 30 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', minWidth: 42, textAlign: 'right' }}>
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/setup')
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
    <div style={{ padding: '32px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', margin: 0 }}>{t('title')}</h1>
        <p style={{ fontSize: 14, color: '#64748b', margin: '4px 0 0' }}>{t('subtitle')}</p>
      </div>

      {/* Project picker */}
      {projects && projects.length > 0 && (
        <form method="get" style={{ ...cardStyle, padding: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>{t('project')}</label>
          <select
            name="projectId"
            defaultValue={projectId ?? ''}
            style={{
              flex: 1, maxWidth: 360, padding: '8px 12px',
              border: '1px solid #e2e8f0', borderRadius: 8,
              fontSize: 14, background: 'white', color: '#0f172a',
            }}
          >
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </select>
          <button
            type="submit"
            style={{
              padding: '8px 16px', background: '#3b82f6', color: 'white',
              border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {t('load')}
          </button>
        </form>
      )}

      {/* KPI row */}
      {rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em' }}>{t('kpi.systems')}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>{totals.systems}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{t('kpi.avgItr', { pct: avgItrPct.toFixed(1) })}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em' }}>{t('kpi.readyMc')}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#10b981', marginTop: 4 }}>{totals.mc}/{totals.systems}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em' }}>{t('kpi.readyRfsu')}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#7c3aed', marginTop: 4 }}>{totals.rfsu}/{totals.systems}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em' }}>{t('kpi.punchesOpen')}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#ef4444', marginTop: 4 }}>{totals.punchesA}<span style={{ fontSize: 14, color: '#64748b', fontWeight: 500 }}> A</span> · {totals.punchesB}<span style={{ fontSize: 14, color: '#64748b', fontWeight: 500 }}> B</span></div>
          </div>
        </div>
      )}

      {/* Systems table */}
      {rows.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', color: '#64748b', padding: 48 }}>
          {projectId ? t('empty') : t('selectProject')}
        </div>
      ) : (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={thStyle}>{t('col.area')}</th>
                <th style={thStyle}>{t('col.system')}</th>
                <th style={{ ...thStyle, width: 220 }}>{t('col.itrs')}</th>
                <th style={{ ...thStyle, width: 90, textAlign: 'center' }}>{t('col.punchA')}</th>
                <th style={{ ...thStyle, width: 90, textAlign: 'center' }}>{t('col.punchB')}</th>
                <th style={{ ...thStyle, width: 90, textAlign: 'center' }}>{t('col.punchC')}</th>
                <th style={{ ...thStyle, width: 280 }}>{t('col.gates')}</th>
                <th style={thStyle}>{t('col.topBlocker')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const topBlocker = r.blockers[0]
                return (
                  <tr key={r.system_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.area_code}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{r.area_name}</div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.system_code}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{r.system_name}</div>
                    </td>
                    <td style={tdStyle}>
                      <Bar pct={Number(r.itr_pct)} />
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                        {r.itr_approved}/{r.itr_total} {t('approved')}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: r.open_punches_a > 0 ? '#ef4444' : '#94a3b8', fontWeight: 600 }}>
                      {r.open_punches_a}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: r.open_punches_b > 0 ? '#f59e0b' : '#94a3b8', fontWeight: 600 }}>
                      {r.open_punches_b}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: r.open_punches_c > 0 ? '#64748b' : '#cbd5e1', fontWeight: 600 }}>
                      {r.open_punches_c}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <GateBadge ok={r.ready_mc}   label="MC" />
                        <GateBadge ok={r.ready_rfsu} label="RFSU" />
                        <GateBadge ok={r.ready_rfc}  label="RFC" />
                      </div>
                    </td>
                    <td style={{ ...tdStyle, fontSize: 12, color: '#64748b' }}>
                      {topBlocker ? topBlocker.message : <span style={{ color: '#10b981', fontWeight: 600 }}>{t('noBlockers')}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '12px 16px', textAlign: 'left',
  fontSize: 11, fontWeight: 600, color: '#64748b',
  textTransform: 'uppercase', letterSpacing: '.05em',
}

const tdStyle: React.CSSProperties = {
  padding: '14px 16px', verticalAlign: 'middle', color: '#0f172a',
}
