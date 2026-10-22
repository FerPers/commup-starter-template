'use client'

import { startupTabHref } from '@/lib/navigation/hub-routes'
// N2a: ficha de sistema única. Encabezado común (lo que antes se repartía entre /control-tower/[id] y la ficha de
// Sistemas) + pestañas por URL. Las pestañas Gates, Dependencias y Datos son SystemGatesView y SystemDetailView;
// aquí viven Avance y plan, Arranque, Traspaso y Vendors y desempeño.

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { formatInZone } from '@/lib/time/zone'
import { MILESTONES, type OwnershipStage } from '@/lib/startup/catalog'
import { StageChip } from '@/app/(dashboard)/projects/[id]/startup/operations/ownership-ui'
import { Chip } from '@/app/(dashboard)/projects/[id]/daily/daily-ui'
import { CERT_TONE, RESULT_TONE, type CertificateStatus, type PerfResult, type PerfRunStatus } from '@/lib/performance/catalog'
import { PACKAGE_TONE, type PackageStatus } from '@/lib/vendors/catalog'
import type { GateStatus } from '@/lib/readiness/gates'
import type { SystemType } from '@/lib/systems/dependencies'
import { SYSTEM_TABS, systemTabHref, type SystemTab } from '@/lib/systems/file-tabs'
import { TypeChip } from '../system-ui'
import GatePlanPanel, { type GatePlan, type GatePlanEvent, type GateProgress } from './GatePlanPanel'
import { StatusBadge } from './SystemGatesView'

export type SystemPerformance = {
  id: string
  number: string
  title: string
  lastRun: { status: PerfRunStatus; result: PerfResult | null } | null
  certificate: { number: string; status: CertificateStatus } | null
}
export type SystemVendor = { id: string; number: string; title: string; status: PackageStatus; company: string }
type ProjectRef = { id: string; code: string; name: string; timezone: string | null }

const card: React.CSSProperties = { background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }
const small: React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }
const h2: React.CSSProperties = { fontSize: 17, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }
const linkStyle: React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--primary-600, #2563eb)', textDecoration: 'none', fontWeight: 500 }
const kpiLabel: React.CSSProperties = { fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }
const kpiValue: React.CSSProperties = { fontSize: 22, fontWeight: 700, color: 'var(--text-strong)' }

export function SystemFileShell({ project, system, tab, summary, ownership, performance, vendors, badges, children }: {
  project: ProjectRef
  system: { id: string; code: string; name: string; area: string; system_type: SystemType | null; priority: number | null }
  tab: SystemTab
  summary: {
    approved: number
    total: number
    attention: number
    weightedPct: number
    itrs: number
    next: { code: string; status: GateStatus } | null
    commitment: { gate: string; date: string; late: boolean; forecast: string | null } | null
    /** E2: tags del sistema con pin en la revisión vigente de un P&ID. */
    pid: { pinned: number; total: number } | null
  }
  ownership: { stage: OwnershipStage; pendingTransferId: string | null }
  performance: SystemPerformance[]
  vendors: SystemVendor[]
  badges: Partial<Record<SystemTab, number>>
  children: React.ReactNode
}) {
  const t = useTranslations('Systems')
  const tg = useTranslations('Gates')
  const ts = useTranslations('Startup')
  const tv = useTranslations('Vendors')

  return (
    <div style={{ padding: 'clamp(12px, 4vw, 32px)', maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: '8px 16px', flexWrap: 'wrap' }}>
        <Link href={`/projects/${project.id}/readiness`} style={linkStyle}>← {t('file.backReadiness')}</Link>
        <Link href={`/projects/${project.id}/systems`} style={linkStyle}>{t('file.backSystems')}</Link>
      </div>

      <div style={{ ...card, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <div style={small}>{project.code}{system.area ? ` · ${system.area}` : ''}</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {system.code}{system.name && system.name !== system.code && <span style={{ fontWeight: 500 }}>— {system.name}</span>}
            {system.system_type && <TypeChip type={system.system_type} label={t(`type.${system.system_type}`)} />}
            {system.priority && <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-muted)' }}>P{system.priority}</span>}
          </h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
            {summary.next
              ? <StatusBadge status={summary.next.status} label={`${summary.next.code} · ${tg(`status.${summary.next.status}`)}`} />
              : <StatusBadge status="approved" label={t('file.allApproved')} />}
            <StageChip stage={ownership.stage} />
            {vendors.map(v => (
              <Link key={v.id} href={`/projects/${project.id}/vendors/${v.id}`} title={v.title} style={{ textDecoration: 'none' }}>
                <Chip tone={PACKAGE_TONE[v.status]}>{v.number} · {v.company} · {tv(`status.${v.status}`)}</Chip>
              </Link>
            ))}
            {performance.map(pt => (
              <Link key={pt.id} href={`/projects/${project.id}/startup/performance/${pt.id}`} title={pt.title} style={{ textDecoration: 'none' }}>
                {pt.lastRun?.result
                  ? <Chip tone={RESULT_TONE[pt.lastRun.result]}>{pt.number} · {ts(`perf.result.${pt.lastRun.result}`)}</Chip>
                  : <Chip tone="muted">{pt.number} · {pt.lastRun ? ts(`perf.runStatus.${pt.lastRun.status}`) : tg('performance.noRun')}</Chip>}
              </Link>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 140 }}>
            <div style={kpiLabel}>{t('file.weighted')}</div>
            <div style={kpiValue}>{(summary.weightedPct * 100).toFixed(1)} %</div>
            <div style={small}>{t('file.itrs', { count: summary.itrs })}</div>
          </div>
          <div style={{ minWidth: 120 }}>
            <div style={kpiLabel}>{t('file.gates')}</div>
            <div style={kpiValue}>{summary.approved} / {summary.total}</div>
            {summary.attention > 0 && <div style={{ ...small, color: 'var(--danger-700)' }}>{t('file.attention', { count: summary.attention })}</div>}
          </div>
          {summary.commitment && (
            <div style={{ minWidth: 150 }}>
              <div style={kpiLabel}>{t('file.commitment', { gate: summary.commitment.gate })}</div>
              <div style={{ ...kpiValue, color: summary.commitment.late ? 'var(--danger-700)' : 'var(--text-strong)' }}>{summary.commitment.date}</div>
              {summary.commitment.forecast && <div style={small}>{t('file.forecast', { date: summary.commitment.forecast })}</div>}
            </div>
          )}
          {summary.pid && (
            <div style={{ minWidth: 130 }}>
              <div style={kpiLabel}>{t('file.pidCoverage')}</div>
              <div style={kpiValue}>{Math.round(summary.pid.pinned * 100 / summary.pid.total)} %</div>
              <Link href={`/projects/${project.id}/documents?type=pid`} style={{ ...small, textDecoration: 'none' }}>
                {t('file.pidCoverageDetail', { pinned: summary.pid.pinned, total: summary.pid.total })}
              </Link>
            </div>
          )}
        </div>
      </div>

      <nav aria-label={t('file.tabsLabel')} style={{ display: 'flex', gap: 2, flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
        {SYSTEM_TABS.map(k => {
          const active = k === tab
          const badge = badges[k]
          return (
            <Link key={k} href={systemTabHref(project.id, system.id, k)} aria-current={active ? 'page' : undefined} scroll={false}
              style={{
                minHeight: 44, padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none',
                fontSize: 'var(--text-sm)', fontWeight: active ? 700 : 500, color: active ? 'var(--text-strong)' : 'var(--text-muted)',
                borderBottom: `3px solid ${active ? 'var(--brand-orange, #f2a541)' : 'transparent'}`, marginBottom: -1,
              }}>
              {t(`file.tab.${k}`)}
              {!!badge && <span style={{ borderRadius: 999, padding: '0 7px', fontSize: 'var(--text-xs)', fontWeight: 700, background: 'var(--gray-100)', color: 'var(--text-strong)' }}>{badge}</span>}
            </Link>
          )
        })}
      </nav>

      {children}
    </div>
  )
}

// ── Avance y plan ──────────────────────────────────────────────────────

export function SystemPlanTab({ project, systemId, gates, planning, names, canEdit, daily }: {
  project: ProjectRef
  systemId: string
  gates: { gate_id: string; gate_code: string; gate_name: string; status: GateStatus; settled: boolean }[]
  planning: { progress: Record<string, GateProgress>; plans: Record<string, GatePlan>; events: (GatePlanEvent & { gate_id: string })[]; canCommit: boolean }
  names: Record<string, string>
  canEdit: boolean
  daily: {
    constraints: { id: string; number: string; title: string; status: string; escalation_level: number; need_date: string; gate: string | null }[]
    actions: { id: string; number: string; title: string; status: string; due_date: string | null; owner_id: string | null }[]
  }
}) {
  const t = useTranslations('Gates')
  const tsys = useTranslations('Systems')
  const who = (id: string | null) => (id ? names[id] : undefined) ?? t('unknownUser')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ ...small, margin: 0 }}>
        {tsys('file.planIntro')}{' '}<Link href={`/projects/${project.id}/planning/lookahead`} style={linkStyle}>{t('plan.lookahead')}</Link>
      </p>
      {gates.map(g => (
        <section key={g.gate_id} style={card} aria-label={g.gate_code}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <div><strong style={{ fontSize: 16, color: 'var(--text-strong)' }}>{g.gate_code}</strong> <span style={small}>{g.gate_name}</span></div>
            <StatusBadge status={g.status} label={t(`status.${g.status}`)} />
          </div>
          <GatePlanPanel
            projectId={project.id} systemId={systemId} gateId={g.gate_id}
            progress={planning.progress[g.gate_id]} plan={planning.plans[g.gate_id]}
            events={planning.events.filter(e => e.gate_id === g.gate_id)} names={names}
            canEdit={canEdit} canCommit={planning.canCommit} settled={g.settled}
          />
        </section>
      ))}

      <section style={card} aria-labelledby="system-daily">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h2 id="system-daily" style={h2}>{t('daily.title')}</h2>
          <Link href={`/projects/${project.id}/daily`} style={linkStyle}>{t('daily.link')}</Link>
        </div>
        {daily.constraints.length === 0 && daily.actions.length === 0
          ? <p style={{ ...small, margin: '10px 0 0' }}>{tsys('file.noDaily')}</p>
          : (
            <ul style={{ margin: '10px 0 0', paddingLeft: 18, ...small, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {daily.constraints.map(c => (
                <li key={c.id}>
                  <Link href={`/projects/${project.id}/daily/constraint/${c.id}`} style={{ ...linkStyle, fontWeight: 700 }}>{c.number}</Link> {c.title}
                  {' · '}<span style={{ fontWeight: 600, color: c.escalation_level >= 4 && c.status === 'open' ? 'var(--danger-700)' : undefined }}>{t('crit.constraintLevel', { n: c.escalation_level })}</span>
                  {c.gate ? ` · ${c.gate}` : ''}{' · '}{c.need_date}
                </li>
              ))}
              {daily.actions.slice(0, 10).map(a => (
                <li key={a.id}>
                  <Link href={`/projects/${project.id}/daily/action/${a.id}`} style={{ ...linkStyle, fontWeight: 700 }}>{a.number}</Link> {a.title}
                  {' · '}{who(a.owner_id)}{a.due_date ? ` · ${a.due_date}` : ''}
                </li>
              ))}
              {daily.actions.length > 10 && <li>{t('andMore', { count: daily.actions.length - 10 })}</li>}
            </ul>
          )}
      </section>
    </div>
  )
}

// ── Arranque ───────────────────────────────────────────────────────────

export function SystemStartupTab({ project, systemId, milestones }: {
  project: ProjectRef
  systemId: string
  milestones: { id: string; milestone: string; occurredAt: string; status: string }[]
}) {
  const t = useTranslations('Gates')
  const tsys = useTranslations('Systems')
  const locale = useLocale()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section style={card} aria-labelledby="sys-milestones">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <h2 id="sys-milestones" style={h2}>{t('milestones.title')}</h2>
          <Link href={`/projects/${project.id}/startup/events?system=${systemId}`} style={linkStyle}>{t('milestones.link')}</Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
          {MILESTONES.map(m => {
            const ev = milestones.find(x => x.milestone === m)
            return (
              <div key={m} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: ev?.status === 'witnessed' ? 'var(--success-50)' : ev ? '#fffbeb' : 'transparent' }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>{t(`milestones.${m}`)}</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>
                  {ev ? <Link href={`/projects/${project.id}/startup/events/${ev.id}`} style={{ color: 'inherit' }}>{ev.status === 'witnessed' ? '✓ ' : '⏳ '}{formatInZone(ev.occurredAt, project.timezone, locale, false)}</Link> : '—'}
                </div>
              </div>
            )
          })}
        </div>
      </section>
      <section style={{ ...card, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Link href={`/projects/${project.id}/startup`} style={linkStyle}>{tsys('file.procedures')} →</Link>
        <Link href={startupTabHref(project.id, 'lineups')} style={linkStyle}>{tsys('file.lineups')} →</Link>
      </section>
    </div>
  )
}

// ── Traspaso ───────────────────────────────────────────────────────────

export function SystemTransferTab({ project, ownership, transfers }: {
  project: ProjectRef
  ownership: { stage: OwnershipStage; pendingTransferId: string | null }
  transfers: { id: string; number: string; from_stage: string; to_stage: string; status: string; requested_at: string }[]
}) {
  const t = useTranslations('Gates')
  const tsys = useTranslations('Systems')
  const ts = useTranslations('Startup')
  const locale = useLocale()
  return (
    <section style={card} aria-labelledby="sys-transfer">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <h2 id="sys-transfer" style={h2}>{tsys('file.tab.transfer')}</h2>
        <Link href={ownership.pendingTransferId ? `/projects/${project.id}/startup/transfers/${ownership.pendingTransferId}` : `/projects/${project.id}/startup/operations`} style={linkStyle}>
          {ownership.pendingTransferId ? t('ownership.pending') : t('ownership.link')}
        </Link>
      </div>
      <div style={{ margin: '12px 0', display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={small}>{tsys('file.currentStage')}</span><StageChip stage={ownership.stage} />
      </div>
      {transfers.length === 0
        ? <p style={{ ...small, margin: 0 }}>{tsys('file.noTransfers')}</p>
        : (
          <ul style={{ margin: 0, paddingLeft: 18, ...small, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {transfers.map(tr => (
              <li key={tr.id}>
                <Link href={`/projects/${project.id}/startup/transfers/${tr.id}`} style={{ ...linkStyle, fontWeight: 700 }}>{tr.number}</Link>
                {' '}{ts(`ops.stage.${tr.from_stage}`)} → {ts(`ops.stage.${tr.to_stage}`)} · {ts(`ops.status.${tr.status}`)} · {formatInZone(tr.requested_at, project.timezone, locale, false)}
              </li>
            ))}
          </ul>
        )}
    </section>
  )
}

// ── Vendors y desempeño ────────────────────────────────────────────────

export function SystemVendorsTab({ project, performance, vendors }: { project: ProjectRef; performance: SystemPerformance[]; vendors: SystemVendor[] }) {
  const t = useTranslations('Gates')
  const tsys = useTranslations('Systems')
  const ts = useTranslations('Startup')
  const tv = useTranslations('Vendors')
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
      <section style={card} aria-labelledby="sys-vendors">
        <h2 id="sys-vendors" style={{ ...h2, marginBottom: 12 }}>{tsys('file.vendors')}</h2>
        {vendors.length === 0 ? <p style={{ ...small, margin: 0 }}>{tsys('file.noVendors')}</p> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {vendors.map(v => (
              <li key={v.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Link href={`/projects/${project.id}/vendors/${v.id}`} style={{ ...linkStyle, fontWeight: 700 }}>{v.number}</Link>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{v.title}</span>
                <span style={small}>{v.company}</span>
                <Chip tone={PACKAGE_TONE[v.status]}>{tv(`status.${v.status}`)}</Chip>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section style={card} aria-labelledby="sys-perf">
        <h2 id="sys-perf" style={{ ...h2, marginBottom: 12 }}>{tsys('file.performance')}</h2>
        {performance.length === 0 ? <p style={{ ...small, margin: 0 }}>{tsys('file.noPerformance')}</p> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {performance.map(pt => (
              <li key={pt.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Link href={`/projects/${project.id}/startup/performance/${pt.id}`} style={{ ...linkStyle, fontWeight: 700 }}>{pt.number}</Link>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{pt.title}</span>
                {pt.lastRun?.result
                  ? <Chip tone={RESULT_TONE[pt.lastRun.result]}>{ts(`perf.result.${pt.lastRun.result}`)}</Chip>
                  : <Chip tone="muted">{pt.lastRun ? ts(`perf.runStatus.${pt.lastRun.status}`) : t('performance.noRun')}</Chip>}
                {pt.certificate && <Chip tone={CERT_TONE[pt.certificate.status]}>{pt.certificate.number} · {ts(`perf.certStatus.${pt.certificate.status}`)}</Chip>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
