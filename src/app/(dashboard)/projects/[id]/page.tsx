import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { fetchItrPhaseCounts, fetchPunchCounts, fetchCertCounts, sumItr, sumPunch, sumCert, isOpenPunch } from '@/lib/list/kpi-query'
import { loadMatrix } from '@/lib/readiness/matrix-server'
import { blockerCount, readinessSummary, rowState } from '@/lib/readiness/matrix'
import { blockedToday, buildPhaseBoard, upcomingWindow, type UpcomingItem } from '@/lib/readiness/phase-board'
import type { MatrixGate } from '@/lib/readiness/gates'
import { OWNERSHIP_STAGES } from '@/lib/startup/catalog'
import { addDaysIso, formatInZone } from '@/lib/time/zone'
import ProjectHeader from './ProjectHeader'
import { ROLE_TIERS } from '@/lib/constants/roles'

// N2b (H-10/H-20, «Maquetas N2» aprobadas por Luis 2026-10-21): el Resumen del proyecto es un tablero por fases.
// Una fila por gate (readiness, avance de los ITR de su fase, lo que más bloquea, próximo compromiso) que abre
// Readiness filtrado; abajo, lo que bloquea hoy, los próximos 7 días y una franja chica de ingeniería y datos.
// El Digital Twin dejó de ser el banner principal.

const card: React.CSSProperties = { background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12 }
const small: React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }
const th: React.CSSProperties = { padding: '10px 16px', textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '12px 16px', fontSize: 'var(--text-sm)', color: 'var(--text-strong)', verticalAlign: 'top' }
const linkStyle: React.CSSProperties = { color: 'var(--primary-600, #2563eb)', textDecoration: 'none', fontWeight: 600 }
const chipLink: React.CSSProperties = { textDecoration: 'none', padding: '6px 10px', borderRadius: 8, background: 'var(--gray-50)', border: '1px solid var(--border)', color: 'var(--text-strong)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap' }

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const canEdit = ROLE_TIERS.privileged.includes(ctx.role)
  const canDelete = ctx.role === 'owner'

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, code, location, client, country, region, start_date, end_date, status, timezone, created_at')
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .maybeSingle()
  if (!project) notFound()

  const [
    t, tc, tg, ts, locale,
    matrix,
    { data: orgGates },
    itrCounts, punchCounts, certCounts,
    { count: tagCount }, { count: signalCount }, { count: loopCount }, { count: ceMatrixCount }, { count: documentCount }, { count: pidCount },
    { data: ownership }, { count: pendingTransfers },
  ] = await Promise.all([
    getTranslations('ProjectOverview'), getTranslations('ControlTower'), getTranslations('Gates'), getTranslations('Startup'), getLocale(),
    loadMatrix(supabase, id, ctx.orgId),
    // bounded: gates de la org
    supabase.from('readiness_gates').select('id, phase_id').eq('org_id', ctx.orgId).limit(100),
    fetchItrPhaseCounts(supabase, { projectId: id }),
    fetchPunchCounts(supabase, { projectId: id }),
    fetchCertCounts(supabase, { projectId: id }),
    supabase.from('tags').select('id', { count: 'exact', head: true }).eq('project_id', id),
    supabase.from('signals').select('id, tags!inner(project_id)', { count: 'exact', head: true }).eq('tags.project_id', id),
    supabase.from('loops').select('id', { count: 'exact', head: true }).eq('project_id', id),
    supabase.from('ce_matrices').select('id', { count: 'exact', head: true }).eq('project_id', id),
    supabase.from('documents').select('id', { count: 'exact', head: true }).eq('project_id', id),
    supabase.from('pid_documents').select('id', { count: 'exact', head: true }).eq('project_id', id),
    // bounded: una fila por sistema del proyecto
    supabase.from('system_ownership').select('stage').eq('project_id', id).limit(5000),
    supabase.from('ownership_transfers').select('id', { count: 'exact', head: true }).eq('project_id', id).eq('status', 'pending_signatures'),
  ])

  const { rows, today } = matrix
  const end = addDaysIso(today, 7)
  const [{ data: actions }, { data: constraints }, { data: vendorActs }] = await Promise.all([
    supabase.from('actions').select('id, number, title, due_date').eq('project_id', id)
      .in('status', ['open', 'in_progress']).not('due_date', 'is', null).lte('due_date', end).order('due_date').limit(20),
    supabase.from('project_constraints').select('id, number, title, need_date').eq('project_id', id)
      .eq('status', 'open').lte('need_date', end).order('need_date').limit(20),
    supabase.from('vendor_activities').select('id, title, planned_date, package_id, vendor_packages(number)').eq('project_id', id)
      .is('performed_on', null).gte('planned_date', today).lte('planned_date', end).order('planned_date').limit(20),
  ])

  // ── Tablero por fases ────────────────────────────────────────────────
  const itrByPhase = new Map<string, { approved: number; total: number }>()
  for (const c of itrCounts) {
    const cur = itrByPhase.get(c.phase_id) ?? { approved: 0, total: 0 }
    cur.total += c.n
    if (c.status === 'approved') cur.approved += c.n
    itrByPhase.set(c.phase_id, cur)
  }
  const board = buildPhaseBoard(rows, {
    commitments: matrix.commitments, forecasts: matrix.forecasts, today,
    gatePhase: new Map((orgGates ?? []).map(g => [g.id, g.phase_id])),
    itrByPhase,
  })

  const weightedVals = [...matrix.weighted.values()]
  const weightedItrs = weightedVals.reduce((s, w) => s + w.itrs, 0)
  const weighted = weightedItrs > 0 ? weightedVals.reduce((s, w) => s + w.pct * w.itrs, 0) / weightedItrs : 0
  const readiness = readinessSummary(rows.map(r => r.gates))
  const states = rows.map(r => rowState(r.gates))
  const blockedNow = states.filter(s => s === 'blocked' || s === 'regressed').length
  const regressedNow = states.filter(s => s === 'regressed').length
  const toSignNow = board.reduce((n, p) => n + p.toSign, 0)

  const blockerText = (g: MatrixGate): string => {
    if (!g.blocker) return tc(`gateStatus.${g.status}`)
    const label = g.blocker.label ?? tg(`kind.${g.blocker.kind}`)
    const n = blockerCount(g.blocker)
    return n ? tc('next.blockerCount', { label, count: n }) : label
  }
  const blockers = blockedToday(rows, { commitment: (s, g) => matrix.commitments.get(`${s}:${g}`) ?? null, today })

  // ── Próximos 7 días ─────────────────────────────────────────────────
  const base = `/projects/${id}`
  const gateItems: UpcomingItem[] = []
  for (const r of rows) {
    for (const g of r.gates) {
      if (g.status === 'approved' || g.status === 'approved_with_conditions') continue
      const key = `${r.system_id}:${g.gate_id}`
      const href = `${base}/systems/${r.system_id}?tab=plan`
      const commit = matrix.commitments.get(key)
      const forecast = matrix.forecasts.get(key)
      if (commit) gateItems.push({ kind: 'commitment', date: commit, ref: `${r.system_code} · ${g.code}`, title: t('upcoming.commitment'), href })
      else if (forecast) gateItems.push({ kind: 'forecast', date: forecast, ref: `${r.system_code} · ${g.code}`, title: t('upcoming.forecast'), href })
    }
  }
  const upcoming = upcomingWindow([
    ...gateItems,
    ...(actions ?? []).map(a => ({ kind: 'action' as const, date: a.due_date as string, ref: a.number, title: a.title, href: `${base}/daily/action/${a.id}` })),
    ...(constraints ?? []).map(c => ({ kind: 'constraint' as const, date: c.need_date, ref: c.number, title: c.title, href: `${base}/daily/constraint/${c.id}` })),
    ...(vendorActs ?? []).map(v => ({ kind: 'vendor' as const, date: v.planned_date as string, ref: (v.vendor_packages as { number: string } | null)?.number ?? 'VND', title: v.title, href: `${base}/vendors/${v.package_id}` })),
  ], today).slice(0, 10)

  // ── Custodia ────────────────────────────────────────────────────────
  const stageCounts = Object.fromEntries(OWNERSHIP_STAGES.map(s => [s, 0])) as Record<string, number>
  for (const o of ownership ?? []) stageCounts[o.stage] = (stageCounts[o.stage] ?? 0) + 1

  const openPunch = sumPunch(punchCounts, isOpenPunch)
  const catA = sumPunch(punchCounts, p => isOpenPunch(p) && p.category === 'A')
  const itrTotal = sumItr(itrCounts, () => true)
  const itrApproved = sumItr(itrCounts, i => i.status === 'approved')
  const certIssued = sumCert(certCounts, c => c.status === 'issued')
  const fmtDate = (d: string | null) => (d ? formatInZone(`${d}T12:00:00Z`, project.timezone, locale, false) : '—')

  return (
    <div style={{ padding: 'clamp(12px, 4vw, 32px)', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ProjectHeader project={project} canEdit={canEdit} canDelete={canDelete} />

      {/* Datos del proyecto (H-20: i18n y en el teléfono bajan de línea) */}
      <div style={{ ...card, display: 'flex', flexWrap: 'wrap' }}>
        {[
          [t('info.code'), project.code], [t('info.client'), project.client ?? '—'], [t('info.location'), project.location ?? '—'],
          [t('info.start'), fmtDate(project.start_date)], [t('info.target'), fmtDate(project.end_date)],
        ].map(([label, value]) => (
          <div key={label} style={{ flex: '1 1 160px', padding: '12px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-strong)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Los dos números canónicos (D-18) y lo de hoy */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div style={{ ...card, padding: '14px 18px' }}>
          <div style={{ ...small, fontWeight: 600 }}>{t('kpi.physical')}</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)' }}>{(weighted * 100).toFixed(1)} %</div>
          <div style={small}>{t('kpi.itrs', { approved: itrApproved, total: itrTotal })}</div>
        </div>
        <div style={{ ...card, padding: '14px 18px' }}>
          <div style={{ ...small, fontWeight: 600 }}>{t('kpi.readiness')}</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)' }}>{t('kpi.gates', { done: readiness.done, total: readiness.total })}</div>
          <div style={small}>{t('kpi.readinessPct', { pct: (readiness.pct * 100).toFixed(1) })}</div>
        </div>
        <Link href={`${base}/readiness?blocked=1`} style={{ ...card, padding: '14px 18px', textDecoration: 'none', borderColor: blockedNow > 0 ? '#f3c9c3' : 'var(--border)' }}>
          <div style={{ ...small, fontWeight: 600 }}>{t('kpi.today')}</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: blockedNow > 0 ? 'var(--danger-700)' : 'var(--success-700)' }}>{t('kpi.blocked', { count: blockedNow })}</div>
          <div style={small}>{t('kpi.todayDetail', { sign: toSignNow, regressed: regressedNow })}</div>
        </Link>
      </div>

      {/* Tablero por fases */}
      <section aria-labelledby="phase-board" style={{ ...card, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <h2 id="phase-board" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-strong)', flex: 1 }}>{t('board.title')}</h2>
          <span style={small}>{t('board.hint')}</span>
        </div>
        {board.length === 0 ? (
          <p style={{ ...small, margin: 0, padding: 18 }}>{rows.length === 0 ? t('board.noSystems') : t('board.noGates')}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)' }}>
                  <th style={th}>{t('board.col.phase')}</th>
                  <th style={{ ...th, width: 220 }}>{t('board.col.readiness')}</th>
                  <th style={th}>{t('board.col.itr')}</th>
                  <th style={th}>{t('board.col.blocker')}</th>
                  <th style={th}>{t('board.col.commitment')}</th>
                  <th style={{ ...th, textAlign: 'right' }} />
                </tr>
              </thead>
              <tbody>
                {board.map(p => {
                  const pct = p.total > 0 ? Math.round((p.approved / p.total) * 100) : 0
                  const pending = [
                    p.toApprove > 0 && t('board.toApprove', { count: p.toApprove }),
                    p.toSign > 0 && t('board.toSign', { count: p.toSign }),
                    p.regressed > 0 && t('board.regressed', { count: p.regressed }),
                  ].filter(Boolean).join(' · ')
                  return (
                    <tr key={p.gate_id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={td}>
                        <div style={{ fontWeight: 700 }}>{p.code}</div>
                        <div style={small}>{p.name}</div>
                      </td>
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ flex: 1, height: 8, background: 'var(--gray-100)', borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: pct >= 60 ? 'var(--success-500)' : pct >= 25 ? 'var(--primary-500)' : 'var(--gray-400)' }} />
                          </div>
                          <strong style={{ minWidth: 48, textAlign: 'right' }}>{p.approved}/{p.total}</strong>
                        </div>
                        {pending && <div style={{ ...small, marginTop: 4 }}>{pending}</div>}
                      </td>
                      <td style={{ ...td, fontWeight: 600 }}>
                        {p.itr ? `${Math.round((p.itr.approved / p.itr.total) * 100)} %` : '—'}
                        {p.itr && <div style={{ ...small, fontWeight: 400 }}>{t('board.itrCount', { approved: p.itr.approved, total: p.itr.total })}</div>}
                      </td>
                      <td style={{ ...td, color: p.blocked > 0 ? 'var(--danger-700)' : 'var(--text-muted)' }}>
                        {p.blocked > 0
                          ? <>
                              {t('board.blockedSystems', { count: p.blocked })}
                              {p.topBlocker && <div style={small}>{t('board.mostCommon', { label: p.topBlocker.label ?? tg(`kind.${p.topBlocker.kind}`), count: p.topBlocker.systems })}</div>}
                            </>
                          : '—'}
                      </td>
                      <td style={td}>
                        {p.commitment ? (
                          <>
                            <Link href={`${base}/systems/${p.commitment.system_id}?tab=plan`} style={{ ...linkStyle, color: p.commitment.late ? 'var(--danger-700)' : 'var(--text-strong)' }}>
                              {p.commitment.system_code} · {p.commitment.date}
                            </Link>
                            <div style={{ ...small, color: p.commitment.late ? 'var(--danger-700)' : 'var(--text-muted)' }}>
                              {p.commitment.late ? t('board.overdue') : p.commitment.forecast ? t('board.forecast', { date: p.commitment.forecast }) : t('board.noForecast')}
                            </div>
                          </>
                        ) : <span style={small}>—</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <Link href={`${base}/readiness?gate=${encodeURIComponent(p.code)}`} style={{ ...linkStyle, display: 'inline-flex', alignItems: 'center', minHeight: 36, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, whiteSpace: 'nowrap' }}>
                          {t('board.open')}
                        </Link>
                      </td>
                    </tr>
                  )
                })}
                <tr style={{ borderTop: '1px solid var(--border)', background: 'var(--gray-50)' }}>
                  <td style={td}><div style={{ fontWeight: 700 }}>{t('board.transfer')}</div><div style={small}>{t('board.transferHint')}</div></td>
                  <td colSpan={4} style={td}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {OWNERSHIP_STAGES.map(s => (
                        <span key={s} style={{ padding: '4px 10px', borderRadius: 999, background: 'var(--card-bg)', border: '1px solid var(--border)', fontSize: 'var(--text-sm)' }}>
                          {ts(`ops.stage.${s}`)} <strong>{stageCounts[s] ?? 0}</strong>
                        </span>
                      ))}
                      {(pendingTransfers ?? 0) > 0 && (
                        <span style={{ padding: '4px 10px', borderRadius: 999, background: '#f5f3ff', color: '#5b21b6', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                          {t('board.transfersToSign', { count: pendingTransfers ?? 0 })}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <Link href={`${base}/startup/operations`} style={{ ...linkStyle, whiteSpace: 'nowrap' }}>{t('board.openTransfers')}</Link>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Lo que bloquea hoy · Próximos 7 días */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start' }}>
        <section aria-labelledby="blocked-today" style={{ ...card, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
            <h2 id="blocked-today" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-strong)', flex: 1 }}>{t('blocked.title')}</h2>
            <Link href={`${base}/readiness?blocked=1`} style={{ ...linkStyle, fontSize: 'var(--text-sm)' }}>{t('blocked.all')}</Link>
          </div>
          {blockers.length === 0 ? <p style={{ ...small, margin: 0, padding: 18 }}>{t('blocked.none')}</p> : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {blockers.map(({ row, gate }) => {
                const by = matrix.blocks.get(`${row.system_id}:${gate.gate_id}`)
                return (
                  <li key={row.system_id} style={{ borderTop: '1px solid var(--border)', padding: '10px 18px', display: 'flex', gap: 12, alignItems: 'baseline' }}>
                    <span style={{ minWidth: 48, textAlign: 'center', padding: '2px 8px', borderRadius: 6, fontSize: 'var(--text-xs)', fontWeight: 700,
                      background: gate.status === 'regressed' ? 'var(--danger-500)' : 'var(--danger-50)', color: gate.status === 'regressed' ? '#fff' : 'var(--danger-700)' }}>{gate.code}</span>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-sm)' }}>
                      <Link href={`${base}/systems/${row.system_id}?gate=${gate.gate_id}`} style={linkStyle}>{row.system_code}</Link>
                      <span style={{ color: 'var(--text-strong)' }}> · {by ? tc('blockedBy', { systems: by.join(', ') }) : blockerText(gate)}</span>
                      <div style={small}>{row.system_name}</div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="upcoming" style={{ ...card, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
            <h2 id="upcoming" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-strong)', flex: 1 }}>{t('upcoming.title')}</h2>
            <Link href={`${base}/planning/lookahead`} style={{ ...linkStyle, fontSize: 'var(--text-sm)' }}>{t('upcoming.lookahead')}</Link>
          </div>
          {upcoming.length === 0 ? <p style={{ ...small, margin: 0, padding: 18 }}>{t('upcoming.none')}</p> : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {upcoming.map(u => (
                <li key={`${u.kind}:${u.ref}:${u.date}`} style={{ borderTop: '1px solid var(--border)', padding: '10px 18px', display: 'flex', gap: 14, alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 700, minWidth: 86, fontSize: 'var(--text-sm)', color: u.late ? 'var(--danger-700)' : 'var(--text-strong)' }}>{u.date}</span>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-sm)' }}>
                    <Link href={u.href} style={linkStyle}>{u.ref}</Link>
                    <span style={{ color: 'var(--text-strong)' }}> · {u.title}</span>
                    <div style={small}>{t(`upcoming.kind.${u.kind}`)}{u.late ? ` · ${t('upcoming.late')}` : ''}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Completamiento e ingeniería: franja chica (reemplaza las tarjetas del directorio y el banner del Twin) */}
      <section aria-label={t('strip.label')} style={{ ...card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '12px 18px' }}>
        <Link href={`${base}/itrs`} style={chipLink}>{t('strip.itrs')} <strong>{itrApproved}/{itrTotal}</strong></Link>
        <Link href={`${base}/punches`} style={chipLink}>{t('strip.punches')} <strong>{openPunch}</strong>{catA > 0 && <span style={{ color: 'var(--danger-700)' }}> · {t('strip.catA', { count: catA })}</span>}</Link>
        <Link href={`${base}/certificates`} style={chipLink}>{t('strip.certificates')} <strong>{certIssued}</strong></Link>
        <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', margin: '0 4px' }} aria-hidden="true" />
        <Link href={`${base}/tags`} style={chipLink}>{t('strip.tags')} <strong>{tagCount ?? 0}</strong></Link>
        <Link href={`${base}/signals`} style={chipLink}>{t('strip.signals')} <strong>{signalCount ?? 0} · {loopCount ?? 0}</strong></Link>
        <Link href={`${base}/ce-matrices`} style={chipLink}>{t('strip.ce')} <strong>{ceMatrixCount ?? 0}</strong></Link>
        <Link href={`${base}/documents`} style={chipLink}>{t('strip.documents')} <strong>{documentCount ?? 0}</strong> · {t('strip.pid', { count: pidCount ?? 0 })}</Link>
        <Link href={`${base}/systems`} style={chipLink}>{t('strip.systems')} <strong>{rows.length}</strong></Link>
        <Link href={`${base}/tags?view=cards`} style={chipLink}>{t('strip.twin')}</Link>
        <span style={{ flex: 1 }} />
        {canEdit && <Link href={`${base}/import`} style={{ ...linkStyle, fontSize: 'var(--text-sm)' }}>{t('strip.import')}</Link>}
      </section>
    </div>
  )
}
