'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { MILESTONES, type OwnershipStage } from '@/lib/startup/catalog'
import { StageChip } from '@/app/(dashboard)/projects/[id]/startup/operations/ownership-ui'
import { Chip } from '@/app/(dashboard)/projects/[id]/daily/daily-ui'
import { CERT_TONE, RESULT_TONE, type CertificateStatus, type PerfResult, type PerfRunStatus } from '@/lib/performance/catalog'
import { PACKAGE_TONE, type PackageStatus } from '@/lib/vendors/catalog'
import GatePlanPanel, { type GatePlan, type GatePlanEvent, type GateProgress } from './GatePlanPanel'
import { createClient } from '@/lib/supabase/client'
import type { DependencyCriterionDetail } from '@/lib/systems/dependencies'
import {
  approveSystemGate,
  attestGateCriterion,
  getGateEvidenceUrl,
  revokeGateAttestation,
  revokeSystemGateApproval,
  signSystemGate,
} from '@/app/actions/gates'
import {
  GATE_STATUS_STYLE,
  canApprove,
  canRevoke,
  evidencePath,
  missingSignatures,
  signableCapacities,
  type Criterion,
  type GateStatus,
  type SystemGate,
} from '@/lib/readiness/gates'

export type SystemPerformance = {
  id: string
  number: string
  title: string
  lastRun: { status: PerfRunStatus; result: PerfResult | null } | null
  certificate: { number: string; status: CertificateStatus } | null
}

type Props = {
  orgId: string
  role: string
  userId: string
  canEdit: boolean
  project: { id: string; code: string; name: string }
  system: { id: string; code: string; name: string; area: string }
  gates: SystemGate[]
  names: Record<string, string>
  phaseCodes: Record<string, string>
  dependsOn: { id: string; code: string }[]
  enables: { id: string; code: string }[]
  /** Planificación (fase 5, sesión 2): avance ponderado por gate y forecast/compromiso. */
  planning: {
    progress: Record<string, GateProgress>
    weightedPct: number
    plans: Record<string, GatePlan>
    events: (GatePlanEvent & { gate_id: string })[]
    canCommit: boolean
  }
  /** Hitos de arranque vigentes del sistema (fase 6, sesión 2). */
  milestones: { id: string; milestone: string; occurredAt: string; status: string }[]
  /** Etapa de propiedad del sistema (fase 6, sesión 3). */
  ownership: { stage: OwnershipStage; pendingTransferId: string | null }
  /** Pruebas de desempeño de las que el sistema es principal (fase 7). */
  performance: SystemPerformance[]
  /** Paquetes de vendor que abarcan el sistema (fase 8; no afectan los gates, §15.13). */
  vendors: { id: string; number: string; title: string; status: PackageStatus; company: string }[]
  /** Gestión diaria del sistema (fase 5): restricciones no cerradas y acciones vivas. */
  daily: {
    constraints: { id: string; number: string; title: string; status: string; escalation_level: number; need_date: string; gate: string | null }[]
    actions: { id: string; number: string; title: string; status: string; priority: string; due_date: string | null; owner_id: string | null }[]
  }
}

const RESULT_STYLE: Record<string, { icon: string; color: string }> = {
  pass: { icon: '✓', color: 'var(--success-500)' },
  warn: { icon: '!', color: '#d97706' },
  fail: { icon: '✕', color: 'var(--danger-500)' },
}

const card: React.CSSProperties = {
  background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
}
const small: React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }
const linkStyle: React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--primary-600, #2563eb)', textDecoration: 'none', fontWeight: 500 }
const input: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 'var(--text-sm)', background: 'var(--card-bg)', color: 'var(--text-strong)', boxSizing: 'border-box',
}
const btn = (variant: 'primary' | 'outline' | 'danger'): React.CSSProperties => ({
  padding: '7px 14px', borderRadius: 8, fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer',
  border: variant === 'outline' ? '1px solid var(--border)' : 'none',
  background: variant === 'primary' ? 'var(--primary-500)' : variant === 'danger' ? 'var(--danger-500)' : 'transparent',
  color: variant === 'outline' ? 'var(--text-strong)' : '#fff',
})

export function StatusBadge({ status, label }: { status: GateStatus; label: string }) {
  const st = GATE_STATUS_STYLE[status]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999,
      fontSize: 'var(--text-xs)', fontWeight: 700, background: st.bg, color: st.fg, border: `1.5px solid ${st.border}`,
    }}>
      <span aria-hidden="true">{st.icon}</span>{label}
    </span>
  )
}

export default function SystemGatesView({ orgId, role, userId, canEdit, project, system, gates, names, phaseCodes, dependsOn, enables, planning, milestones, ownership, performance, vendors, daily }: Props) {
  const t = useTranslations('Gates')
  const ts = useTranslations('Startup')
  const tv = useTranslations('Vendors')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [conditions, setConditions] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [signComments, setSignComments] = useState<Record<string, string>>({})
  const [attest, setAttest] = useState<Record<string, { comment: string; file: File | null }>>({})

  const base = { projectId: project.id, systemId: system.id }
  const who = (id: string | undefined) => (id ? names[id] : undefined) ?? t('unknownUser')
  const when = (iso: string | undefined) => (iso ? new Date(iso).toLocaleString() : '')

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  function approve(g: SystemGate) {
    run(() => approveSystemGate({ ...base, gateId: g.gate_id, conditions: conditions[g.gate_id] ?? '', notes: notes[g.gate_id] ?? '' }))
  }

  function sign(g: SystemGate, capacity: string) {
    if (!g.approval) return
    run(() => signSystemGate({ ...base, approvalId: g.approval!.id, capacity, comments: signComments[`${g.gate_id}:${capacity}`] ?? '' }))
  }

  function revoke(g: SystemGate) {
    if (!g.approval) return
    const reason = window.prompt(t('revokePrompt', { gate: g.gate_code }))
    if (!reason?.trim()) return
    run(() => revokeSystemGateApproval({ ...base, approvalId: g.approval!.id, reason }))
  }

  async function openEvidence(path: string) {
    const res = await getGateEvidenceUrl({ ...base, path })
    if (res.url) window.open(res.url, '_blank', 'noopener,noreferrer')
    else setError(res.error ?? t('evidenceError'))
  }

  function submitAttestation(c: Criterion) {
    const key = c.criterion_id!
    const a = attest[key]
    if (!a?.comment.trim() || !a.file) { setError(t('attestMissing')); return }
    setError(null)
    startTransition(async () => {
      const path = evidencePath(orgId, system.id, a.file!.name, crypto.randomUUID())
      const { error: upErr } = await createClient().storage.from('gate-evidence').upload(path, a.file!, { contentType: a.file!.type })
      if (upErr) { setError(upErr.message); return }
      const res = await attestGateCriterion({ ...base, criterionId: key, comment: a.comment, filePath: path })
      if (res.error) { setError(res.error); return }
      setAttest(s => ({ ...s, [key]: { comment: '', file: null } }))
      router.refresh()
    })
  }

  function criterionBody(g: SystemGate, c: Criterion) {
    const d = c.detail as Record<string, unknown>
    const phaseCode = g.gate_phase_id ? phaseCodes[g.gate_phase_id] : undefined

    switch (c.kind) {
      case 'previous_gate':
        return <span style={small}>{c.result === 'pass' ? t('crit.previousOk') : t('crit.previousMissing')}</span>

      case 'dependencies_ready': {
        const deps = (d as DependencyCriterionDetail).dependencies ?? []
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={small}>{t('crit.depsSummary', { ok: deps.filter(x => x.ok).length, total: deps.length })}</span>
            <ul style={{ margin: 0, paddingLeft: 18, ...small }}>
              {deps.map(x => (
                <li key={x.dependency_id}>
                  <Link style={linkStyle} href={`/control-tower/${x.system_id}`}>{x.system_code}</Link>
                  {x.system_name && x.system_name !== x.system_code && ` ${x.system_name}`}
                  {' · '}
                  <span style={{ color: x.ok ? 'var(--success-700)' : 'var(--danger-700)' }}>
                    {x.ok ? t('crit.depsOk', { gate: x.gate_code })
                      : x.provider_status === 'pending_signatures' ? t('crit.depsPending', { gate: x.gate_code })
                      : t('crit.depsMissing', { gate: x.gate_code })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )
      }

      case 'registers_clear': {
        const open = (d.open as { id: string; number: string; title: string; status: string }[]) ?? []
        if (!open.length) return (
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={small}>{t('crit.registersNone')}</span>
            <Link style={linkStyle} href={`/projects/${project.id}/registers`}>{t('link.registers')}</Link>
          </div>
        )
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={small}>{t('crit.registersOpen', { count: open.length })}</span>
            <ul style={{ margin: 0, paddingLeft: 18, ...small }}>
              {open.slice(0, 10).map(r => (
                <li key={r.id}>
                  <Link href={`/projects/${project.id}/registers/${r.id}`} style={{ ...linkStyle, fontWeight: 700 }}>{r.number}</Link> {r.title} · {t(`registerStatus.${r.status}`)}
                </li>
              ))}
              {open.length > 10 && <li>{t('andMore', { count: open.length - 10 })}</li>}
            </ul>
          </div>
        )
      }

      case 'constraints_clear': {
        const open = (d.open as { id: string; number: string; title: string; status: string; level: number; need_date: string }[]) ?? []
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={small}>{t('crit.constraintsOpen', { count: open.length, blocking: Number(d.blocking_count ?? 0) })}</span>
            <ul style={{ margin: 0, paddingLeft: 18, ...small }}>
              {open.slice(0, 10).map(r => (
                <li key={r.id}>
                  <Link href={`/projects/${project.id}/daily/constraint/${r.id}`} style={{ ...linkStyle, fontWeight: 700 }}>{r.number}</Link> {r.title}
                  {' · '}<span style={{ color: r.level >= 4 && r.status === 'open' ? 'var(--danger-700)' : undefined, fontWeight: 600 }}>{t('crit.constraintLevel', { n: r.level })}</span>
                  {' · '}{r.need_date}
                </li>
              ))}
              {open.length > 10 && <li>{t('andMore', { count: open.length - 10 })}</li>}
            </ul>
          </div>
        )
      }

      case 'lineup_verified': {
        if (d.missing) return (
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={small}>{t('crit.lineupMissing')}</span>
            <Link style={linkStyle} href={`/projects/${project.id}/startup?tab=lineups`}>{t('link.lineups')}</Link>
          </div>
        )
        return (
          <span style={small}>
            <Link href={`/projects/${project.id}/startup/lineups/${String(d.id)}`} style={{ ...linkStyle, fontWeight: 700 }}>{String(d.number)}</Link>
            {' · '}{d.stale ? t('crit.lineupStale') : t('crit.lineupOk')}
          </span>
        )
      }

      case 'performance_accepted': {
        if (d.not_applicable) return <span style={small}>{t('crit.performanceNa')}</span>
        const tests = (d.tests as { test_id: string; test: string; title: string; certificate: string | null; ok: boolean }[]) ?? []
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {tests.map(x => (
              <span key={x.test_id} style={small}>
                <Link href={`/projects/${project.id}/startup/performance/${x.test_id}`} style={{ ...linkStyle, fontWeight: 700 }}>{x.test}</Link>
                {' · '}{x.title}{' · '}{x.ok ? t('crit.performanceOk', { cert: x.certificate ?? '' }) : t('crit.performanceMissing')}
              </span>
            ))}
          </div>
        )
      }

      case 'documents_current': {
        const rows = (d.outdated as { reference_id: string; document: string; used: string; current: string; kind: 'itr' | 'procedure'; target: string; target_id: string }[]) ?? []
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={small}>{t('crit.documentsOutdated', { count: rows.length })}</span>
            <ul style={{ margin: 0, paddingLeft: 18, ...small }}>
              {rows.slice(0, 10).map(r => (
                <li key={r.reference_id}>
                  <strong>{r.target}</strong>{' · '}{t('crit.documentsRow', { doc: r.document, used: r.used, current: r.current })}
                  {r.kind === 'procedure' && <>{' · '}<Link href={`/projects/${project.id}/startup/procedures/${r.target_id}`} style={linkStyle}>{t('crit.documentsOpen')}</Link></>}
                </li>
              ))}
              {rows.length > 10 && <li>{t('andMore', { count: rows.length - 10 })}</li>}
            </ul>
            <Link href={`/projects/${project.id}/documents`} style={linkStyle}>{t('crit.documentsRegister')}</Link>
          </div>
        )
      }

      case 'itr_phase_approved': {
        if (d.error === 'no_phase') return <span style={small}>{t('crit.noPhase')}</span>
        const red = (d.red_subsystems as { id: string; code: string; reason: string; itr_total: number; itr_approved: number; open_a: number; open_b: number }[]) ?? []
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={small}>
              {t('crit.itrSummary', {
                approved: Number(d.itr_approved ?? 0), total: Number(d.itr_total ?? 0),
                red: Number(d.subsystems_red ?? 0), subsystems: Number(d.subsystems_total ?? 0),
              })}
              {Number(d.open_cat_b ?? 0) > 0 && ` · ${t('crit.catBOpen', { count: Number(d.open_cat_b) })}`}
            </span>
            {red.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18, ...small }}>
                {red.slice(0, 10).map(s => (
                  <li key={s.id}>
                    <strong style={{ color: 'var(--text-strong)' }}>{s.code}</strong>: {t(`reason.${s.reason}`, { approved: s.itr_approved, total: s.itr_total, a: s.open_a, b: s.open_b })}
                  </li>
                ))}
                {red.length > 10 && <li>{t('andMore', { count: red.length - 10 })}</li>}
              </ul>
            )}
            <div style={{ display: 'flex', gap: 14 }}>
              <Link style={linkStyle} href={`/projects/${project.id}/itrs${phaseCode ? `?phase=${encodeURIComponent(phaseCode)}` : ''}`}>{t('link.itrs')}</Link>
              <Link style={linkStyle} href={`/projects/${project.id}/punches`}>{t('link.punches')}</Link>
              <Link style={linkStyle} href={`/projects/${project.id}/certificates`}>{t('link.certificates')}</Link>
            </div>
          </div>
        )
      }

      case 'certificates_issued': {
        if (d.error === 'no_phase') return <span style={small}>{t('crit.noPhase')}</span>
        const missing = (d.missing as { id: string; code: string }[]) ?? []
        const total = Number(d.subsystems_total ?? 0)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={small}>{t('crit.certSummary', { issued: total - missing.length, total })}</span>
            {missing.length > 0 && <span style={small}>{t('crit.certMissing')}: {missing.slice(0, 15).map(m => m.code).join(', ')}{missing.length > 15 ? '…' : ''}</span>}
            <Link style={linkStyle} href={`/projects/${project.id}/certificates`}>{t('link.certificates')}</Link>
          </div>
        )
      }

      case 'pssr_approved': {
        const reviewId = d.review_id as string | undefined
        return (
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={small}>
              {reviewId ? t('crit.pssrStatus', { number: String(d.review_number), status: t(`pssrStatus.${String(d.review_status)}`) }) : t('crit.pssrNone')}
            </span>
            <Link style={linkStyle} href={reviewId ? `/projects/${project.id}/pssr/${reviewId}` : `/projects/${project.id}/pssr`}>{t('link.pssr')}</Link>
          </div>
        )
      }

      case 'critical_tags_ready': {
        const failing = (d.failing as { id: string; tag_number: string; criticality: string; itrs_pending: number; punches_open: number }[]) ?? []
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={small}>{t('crit.criticalSummary', { total: Number(d.critical_total ?? 0), failing: Number(d.failing_count ?? 0) })}</span>
            {failing.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18, ...small }}>
                {failing.slice(0, 10).map(f => (
                  <li key={f.id}>
                    <Link style={linkStyle} href={`/projects/${project.id}/tags/${f.id}`}>{f.tag_number}</Link>
                    {' '}({t(`criticality.${f.criticality}`)}): {t('crit.criticalTagDetail', { itrs: f.itrs_pending, punches: f.punches_open })}
                  </li>
                ))}
                {failing.length > 10 && <li>{t('andMore', { count: failing.length - 10 })}</li>}
              </ul>
            )}
          </div>
        )
      }

      case 'manual_attestation': {
        const key = c.criterion_id!
        const attId = d.attestation_id as string | undefined
        if (attId) {
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={small} suppressHydrationWarning>“{String(d.comment)}” — {who(d.attested_by as string)}, {when(d.attested_at as string)}</span>
              <div style={{ display: 'flex', gap: 14 }}>
                <button type="button" style={{ ...linkStyle, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  onClick={() => openEvidence(String(d.file_path))}>{t('attest.view')}</button>
                {canEdit && !g.approval && (
                  <button type="button" disabled={isPending} style={{ ...linkStyle, color: 'var(--danger-500)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                    onClick={() => run(() => revokeGateAttestation({ ...base, attestationId: attId }))}>{t('attest.revoke')}</button>
                )}
              </div>
            </div>
          )
        }
        if (!canEdit) return <span style={small}>{t('attest.pending')}</span>
        const a = attest[key] ?? { comment: '', file: null }
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 520 }}>
            <textarea rows={2} style={input} placeholder={t('attest.commentPlaceholder')} value={a.comment}
              onChange={e => setAttest(s => ({ ...s, [key]: { ...a, comment: e.target.value } }))} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="file" aria-label={t('attest.file')} onChange={e => setAttest(s => ({ ...s, [key]: { ...a, file: e.target.files?.[0] ?? null } }))} />
              <button type="button" disabled={isPending} style={btn('primary')} onClick={() => submitAttestation(c)}>{t('attest.submit')}</button>
            </div>
          </div>
        )
      }
    }
  }

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <Link href={`/control-tower?projectId=${project.id}`} style={linkStyle}>← {t('back')}</Link>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)', margin: '8px 0 2px' }}>
          {system.code}{system.name && system.name !== system.code ? ` — ${system.name}` : ''}
        </h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '4px 0' }}>
          <StageChip stage={ownership.stage} />
          <Link href={ownership.pendingTransferId ? `/projects/${project.id}/startup/transfers/${ownership.pendingTransferId}` : `/projects/${project.id}/startup/operations`} style={linkStyle}>
            {ownership.pendingTransferId ? t('ownership.pending') : t('ownership.link')}
          </Link>
          {performance.map(pt => (
            <Link key={pt.id} href={`/projects/${project.id}/startup/performance/${pt.id}`} title={pt.title}
              style={{ display: 'inline-flex', gap: 4, alignItems: 'center', textDecoration: 'none' }}>
              {pt.lastRun?.result
                ? <Chip tone={RESULT_TONE[pt.lastRun.result]}>{pt.number} · {ts(`perf.result.${pt.lastRun.result}`)}</Chip>
                : <Chip tone="muted">{pt.number} · {pt.lastRun ? ts(`perf.runStatus.${pt.lastRun.status}`) : t('performance.noRun')}</Chip>}
              {pt.certificate && <Chip tone={CERT_TONE[pt.certificate.status]}>{pt.certificate.number} · {ts(`perf.certStatus.${pt.certificate.status}`)}</Chip>}
            </Link>
          ))}
          {vendors.map(v => (
            <Link key={v.id} href={`/projects/${project.id}/vendors/${v.id}`} title={v.title} style={{ textDecoration: 'none' }}>
              <Chip tone={PACKAGE_TONE[v.status]}>{v.number} · {v.company} · {tv(`status.${v.status}`)}</Chip>
            </Link>
          ))}
        </div>
        <p style={{ ...small, margin: 0 }}>
          {project.code} · {project.name}{system.area ? ` · ${system.area}` : ''}
          {' · '}<Link href={`/projects/${project.id}/systems/${system.id}`} style={linkStyle}>{t('systemFile')}</Link>
        </p>
        <p style={{ ...small, margin: '6px 0 0' }}>
          <strong style={{ color: 'var(--text-strong)' }}>{t('plan.header', {
            pct: (planning.weightedPct * 100).toFixed(1),
            approved: gates.filter(g => g.status === 'approved' || g.status === 'approved_with_conditions').length,
            total: gates.length,
          })}</strong>
          {' · '}<Link href={`/projects/${project.id}/daily/lookahead`} style={linkStyle}>{t('plan.lookahead')}</Link>
        </p>
        {(dependsOn.length > 0 || enables.length > 0) && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8, ...small }}>
            {([['dependsOn', dependsOn], ['enables', enables]] as const).map(([key, list]) => list.length > 0 && (
              <span key={key}>
                <strong style={{ color: 'var(--text-strong)' }}>{t(key)}:</strong>{' '}
                {list.map((s, i) => (
                  <span key={s.id}>{i > 0 && ', '}<Link href={`/control-tower/${s.id}`} style={linkStyle}>{s.code}</Link></span>
                ))}
              </span>
            ))}
          </div>
        )}
      </div>

      <p style={{ ...small, margin: 0, lineHeight: 1.5 }}>{t('intro')}</p>

      <section style={{ ...card, padding: 12 }} aria-label={t('milestones.title')}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{t('milestones.title')}</strong>
          <Link href={`/projects/${project.id}/startup/events?system=${system.id}`} style={linkStyle}>{t('milestones.link')}</Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 6 }}>
          {MILESTONES.map(m => {
            const ev = milestones.find(x => x.milestone === m)
            return (
              <div key={m} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border)', background: ev?.status === 'witnessed' ? 'var(--success-50)' : ev ? '#fffbeb' : 'transparent' }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>{t(`milestones.${m}`)}</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }} suppressHydrationWarning>
                  {ev ? <Link href={`/projects/${project.id}/startup/events/${ev.id}`} style={{ color: 'inherit' }}>{ev.status === 'witnessed' ? '✓ ' : '⏳ '}{new Date(ev.occurredAt).toLocaleDateString()}</Link> : '—'}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {(daily.constraints.length > 0 || daily.actions.length > 0) && (
        <section style={card} aria-labelledby="system-daily">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 id="system-daily" style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('daily.title')}</h2>
            <Link href={`/projects/${project.id}/daily`} style={linkStyle}>{t('daily.link')}</Link>
          </div>
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
                {' · '}{who(a.owner_id ?? undefined)}{a.due_date ? ` · ${a.due_date}` : ''}
              </li>
            ))}
            {daily.actions.length > 10 && <li>{t('andMore', { count: daily.actions.length - 10 })}</li>}
          </ul>
        </section>
      )}

      {error && (
        <div role="alert" style={{ padding: '10px 14px', background: 'var(--danger-50)', border: '1px solid #fecaca', borderRadius: 8, color: 'var(--danger-700)', fontSize: 'var(--text-sm)' }}>
          {error}
        </div>
      )}

      {gates.length === 0 && <div style={{ ...card, ...small, textAlign: 'center' }}>{t('noGates')}</div>}

      {gates.map(g => {
        const approvable = canApprove(g, role)
        const mustCondition = g.status === 'ready_with_conditions'
        return (
          <section key={g.gate_id} style={{ ...card, borderLeft: `4px solid ${GATE_STATUS_STYLE[g.status].border}` }} aria-label={g.gate_code}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)' }}>{g.gate_code}</div>
                <div style={small}>{g.gate_name}</div>
              </div>
              <StatusBadge status={g.status} label={t(`status.${g.status}`)} />
            </div>

            <GatePlanPanel
              projectId={project.id} systemId={system.id} gateId={g.gate_id}
              progress={planning.progress[g.gate_id]} plan={planning.plans[g.gate_id]}
              events={planning.events.filter(e => e.gate_id === g.gate_id)} names={names}
              canEdit={role !== 'client'} canCommit={planning.canCommit}
              settled={g.status === 'approved' || g.status === 'approved_with_conditions'}
            />

            <ul style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {g.criteria.map((c, i) => {
                const rs = RESULT_STYLE[c.result]
                return (
                  <li key={c.criterion_id ?? `prev-${i}`} style={{ display: 'grid', gridTemplateColumns: '22px 1fr', gap: 8 }}>
                    <span aria-label={t(`result.${c.result}`)} style={{ color: rs.color, fontWeight: 800 }}>{rs.icon}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-strong)', fontSize: 'var(--text-sm)' }}>
                        {c.label ?? t(`kind.${c.kind}`)}
                        {!c.blocking && <span style={{ ...small, fontWeight: 400 }}> · {t('nonBlocking')}</span>}
                      </span>
                      {criterionBody(g, c)}
                    </div>
                  </li>
                )
              })}
            </ul>

            <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 14 }}>
              {g.approval ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)', fontWeight: 600 }}>{t('signatures')}</span>
                    <ul style={{ margin: 0, paddingLeft: 18, ...small }}>
                      {g.approval.signatures.map(sg => (
                        <li key={sg.capacity} suppressHydrationWarning>
                          <strong style={{ color: 'var(--text-strong)' }}>{t(`capacity.${sg.capacity}`)}</strong>:{' '}
                          {t('signedBy', { name: sg.signer_company ? `${who(sg.user_id)} · ${sg.signer_company}` : who(sg.user_id), role: sg.user_role, date: when(sg.signed_at) })}
                          {sg.comments && <> — “{sg.comments}”</>}
                        </li>
                      ))}
                      {missingSignatures(g).map(c => (
                        <li key={c} style={{ color: '#1d4ed8' }}>
                          <strong>{t(`capacity.${c}`)}</strong>: {t('signaturePending')}
                        </li>
                      ))}
                    </ul>
                    {signableCapacities(g, role, userId).map(c => (
                      <div key={c} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                        <input style={{ ...input, maxWidth: 360 }} placeholder={t('signCommentPlaceholder')}
                          value={signComments[`${g.gate_id}:${c}`] ?? ''}
                          onChange={e => setSignComments(s => ({ ...s, [`${g.gate_id}:${c}`]: e.target.value }))} />
                        <button type="button" disabled={isPending} style={btn('primary')} onClick={() => sign(g, c)}>
                          {t('signAs', { capacity: t(`capacity.${c}`) })}
                        </button>
                      </div>
                    ))}
                    {g.status === 'pending_signatures' && signableCapacities(g, role, userId).length === 0 && (
                      <span style={small}>{t('pendingSignaturesHint', { roles: g.cosign_roles.join(', ') })}</span>
                    )}
                    {g.status === 'regressed' && <span style={{ ...small, color: 'var(--danger-700)' }}>{t('regressedHint')}</span>}
                    {g.approval.conditions.length > 0 && (
                      <div style={small}>
                        {t('conditions')}:
                        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{g.approval.conditions.map((c, i) => <li key={i}>{c}</li>)}</ul>
                      </div>
                    )}
                    {g.approval.notes && <span style={small}>{t('notes')}: {g.approval.notes}</span>}
                  </div>
                  {canRevoke(g, role) && (
                    <button type="button" disabled={isPending} style={btn('outline')} onClick={() => revoke(g)}>{t('revoke')}</button>
                  )}
                </div>
              ) : approvable ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 640 }}>
                  <label style={{ ...small, fontWeight: 600 }}>
                    {mustCondition ? t('conditionsRequired') : t('conditionsOptional')}
                  </label>
                  <textarea rows={2} style={input} placeholder={t('conditionsPlaceholder')}
                    value={conditions[g.gate_id] ?? ''} onChange={e => setConditions(s => ({ ...s, [g.gate_id]: e.target.value }))} />
                  <input style={input} placeholder={t('notesPlaceholder')} value={notes[g.gate_id] ?? ''}
                    onChange={e => setNotes(s => ({ ...s, [g.gate_id]: e.target.value }))} />
                  <div>
                    <button type="button" disabled={isPending || (mustCondition && !(conditions[g.gate_id] ?? '').trim())}
                      style={btn('primary')} onClick={() => approve(g)}>
                      {t('approve', { gate: g.gate_code })}
                    </button>
                  </div>
                </div>
              ) : (
                <span style={small}>
                  {g.status === 'not_ready' ? t('notReadyHint') : t('noAuthority', { roles: g.approval_roles.join(', ') })}
                </span>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
