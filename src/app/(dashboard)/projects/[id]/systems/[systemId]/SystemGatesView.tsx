'use client'

import { startupTabHref } from '@/lib/navigation/hub-routes'
import Link from 'next/link'
import { isCapacity, type MyCapacities } from '@/lib/constants/capacities'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { formatInZone } from '@/lib/time/zone'
import { Modal } from '@/components/ui'
import { approveImpact, revokeImpact, type ProvidedDependency } from '@/lib/readiness/impact'
import { isDone, nextGate } from '@/lib/readiness/matrix'
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

type Props = {
  /** S14 (D14): capacidades del usuario en el proyecto (firmantes designados o respaldo por rol). */
  caps: MyCapacities
  orgId: string
  role: string
  userId: string
  canEdit: boolean
  project: { id: string; code: string; name: string; timezone: string | null }
  system: { id: string; code: string; name: string; area: string }
  gates: SystemGate[]
  names: Record<string, string>
  phaseCodes: Record<string, string>
  provides: ProvidedDependency[]
  /** N2a: gate pedido en `?gate=` (desde la matriz de Readiness): queda abierto y a la vista. */
  focusGateId?: string | null
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

export default function SystemGatesView({ orgId, role, userId, caps, canEdit, project, system, gates, names, phaseCodes, provides, focusGateId }: Props) {
  const t = useTranslations('Gates')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [conditions, setConditions] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [signComments, setSignComments] = useState<Record<string, string>>({})
  const [attest, setAttest] = useState<Record<string, { comment: string; file: File | null }>>({})

  const base = { projectId: project.id, systemId: system.id }
  const who = (id: string | undefined) => (id ? names[id] : undefined) ?? t('unknownUser')
  // S22 (D-36): con la zona del proyecto y rotulada (antes toLocaleString + suppressHydrationWarning).
  const locale = useLocale()
  const when = (iso: string | undefined) => (iso ? formatInZone(iso, project.timezone, locale) : '')

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  useEffect(() => {
    if (focusGateId) document.getElementById(`gate-${focusGateId}`)?.scrollIntoView({ block: 'start' })
  }, [focusGateId])

  // S23 (D-25): aprobar y revocar pasan por un diálogo que muestra qué se firma y qué cambia aguas abajo.
  const [confirm, setConfirm] = useState<{ kind: 'approve' | 'revoke'; gate: SystemGate } | null>(null)
  const [revokeReason, setRevokeReason] = useState('')
  const nextGateId = nextGate(gates.map(x => ({ gate_id: x.gate_id, code: x.gate_code, name: x.gate_name, order: x.gate_order, computed_level: x.computed_level, status: x.status, failing: 0, approval: null })))?.gate_id
  const impactGates = gates.map(x => ({ gate_id: x.gate_id, gate_code: x.gate_code, gate_order: x.gate_order, status: x.status }))

  function approve(g: SystemGate) {
    setConfirm({ kind: 'approve', gate: g })
  }

  function doApprove(g: SystemGate) {
    setConfirm(null)
    run(() => approveSystemGate({ ...base, gateId: g.gate_id, conditions: conditions[g.gate_id] ?? '', notes: notes[g.gate_id] ?? '' }))
  }

  function sign(g: SystemGate, capacity: string) {
    if (!g.approval) return
    run(() => signSystemGate({ ...base, approvalId: g.approval!.id, capacity, comments: signComments[`${g.gate_id}:${capacity}`] ?? '' }))
  }

  function revoke(g: SystemGate) {
    if (!g.approval) return
    setRevokeReason('')
    setConfirm({ kind: 'revoke', gate: g })
  }

  function doRevoke(g: SystemGate) {
    if (!g.approval || !revokeReason.trim()) return
    setConfirm(null)
    run(() => revokeSystemGateApproval({ ...base, approvalId: g.approval!.id, reason: revokeReason }))
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
      const { error: upErr } = await createClient().storage.from('gate-evidence').upload(path, a.file!, { contentType: a.file!.type || 'application/octet-stream' })
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
        // S11 (D-02/D13): el anterior aprobado pero en regresión bloquea (o deja condición, según la org).
        return <span style={small}>{c.result === 'pass' ? t('crit.previousOk') : (d as { regressed?: boolean }).regressed ? t('crit.previousRegressed') : t('crit.previousMissing')}</span>

      case 'dependencies_ready': {
        const deps = (d as DependencyCriterionDetail).dependencies ?? []
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={small}>{t('crit.depsSummary', { ok: deps.filter(x => x.ok).length, total: deps.length })}</span>
            <ul style={{ margin: 0, paddingLeft: 18, ...small }}>
              {deps.map(x => (
                <li key={x.dependency_id}>
                  <Link style={linkStyle} href={`/projects/${project.id}/systems/${x.system_id}?tab=gates`}>{x.system_code}</Link>
                  {x.system_name && x.system_name !== x.system_code && ` ${x.system_name}`}
                  {' · '}
                  <span style={{ color: x.ok ? 'var(--success-700)' : 'var(--danger-700)' }}>
                    {x.ok ? t('crit.depsOk', { gate: x.gate_code })
                      : x.provider_status === 'regressed' ? t('crit.depsRegressed', { gate: x.gate_code })
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
            <Link style={linkStyle} href={startupTabHref(project.id, 'lineups')}>{t('link.lineups')}</Link>
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
              <span style={small}>“{String(d.comment)}” — {who(d.attested_by as string)}, {when(d.attested_at as string)}</span>
              <div style={{ display: 'flex', gap: 14 }}>
                <button type="button" style={{ ...linkStyle, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  onClick={() => openEvidence(String(d.file_path))}>{t('attest.view')}</button>
                {canEdit && !g.approval && (
                  <button type="button" disabled={isPending} style={{ ...linkStyle, color: 'var(--danger-500)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                    onClick={() => {
                      const reason = window.prompt(t('attest.revokePrompt'))
                      if (reason !== null) run(() => revokeGateAttestation({ ...base, attestationId: attId, reason }))
                    }}>{t('attest.revoke')}</button>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ ...small, margin: 0, lineHeight: 1.5 }}>{t('intro')}</p>

      {error && (
        <div role="alert" style={{ padding: '10px 14px', background: 'var(--danger-50)', border: '1px solid #fecaca', borderRadius: 8, color: 'var(--danger-700)', fontSize: 'var(--text-sm)' }}>
          {error}
        </div>
      )}

      {gates.length === 0 && <div style={{ ...card, ...small, textAlign: 'center' }}>{t('noGates')}</div>}

      {gates.map(g => {
        // S14: con firmantes de Comisionamiento designados, aprueba solo uno de ellos.
        const approvable = canApprove(g, role) && (!caps.commissioning.designated || caps.commissioning.allowed)
        const mustCondition = g.status === 'ready_with_conditions'
        return (
          <section key={g.gate_id} id={`gate-${g.gate_id}`} style={{ ...card, borderLeft: `4px solid ${GATE_STATUS_STYLE[g.status].border}`, scrollMarginTop: 72 }} aria-label={g.gate_code}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)' }}>{g.gate_code}</div>
                <div style={small}>{g.gate_name}</div>
              </div>
              <StatusBadge status={g.status} label={t(`status.${g.status}`)} />
            </div>

            {/* S23 (D-19): los gates ya aprobados se colapsan; queda abierto el siguiente que pide trabajo */}
            <details open={!isDone(g.status) || g.gate_id === nextGateId || g.gate_id === focusGateId} style={{ marginTop: 8 }}>
            <summary style={{ ...small, cursor: 'pointer', fontWeight: 600 }}>{t('criteriaSummary', { pass: g.criteria.filter(c => c.result === 'pass').length, total: g.criteria.length })}</summary>

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
            </details>

            <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 14 }}>
              {g.approval ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)', fontWeight: 600 }}>{t('signatures')}</span>
                    <ul style={{ margin: 0, paddingLeft: 18, ...small }}>
                      {g.approval.signatures.map(sg => (
                        <li key={sg.capacity}>
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
                    {signableCapacities(g, role, userId, caps).map(c => (
                      <div key={c} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                        <input style={{ ...input, maxWidth: 360 }} placeholder={t('signCommentPlaceholder')}
                          value={signComments[`${g.gate_id}:${c}`] ?? ''}
                          onChange={e => setSignComments(s => ({ ...s, [`${g.gate_id}:${c}`]: e.target.value }))} />
                        <button type="button" disabled={isPending} style={btn('primary')} onClick={() => sign(g, c)}>
                          {t('signAs', { capacity: t(`capacity.${c}`) })}
                        </button>
                      </div>
                    ))}
                    {g.status === 'pending_signatures' && signableCapacities(g, role, userId, caps).length === 0 && (
                      <span style={small}>{missingSignatures(g).some(c => isCapacity(c) && caps[c].designated)
                        ? t('pendingSignaturesDesignated')
                        : t('pendingSignaturesHint', { roles: g.cosign_roles.join(', ') })}</span>
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

      {confirm && (() => {
        const g = confirm.gate
        const impact = confirm.kind === 'approve' ? approveImpact(impactGates, g.gate_id, provides) : revokeImpact(impactGates, g.gate_id, provides)
        const conds = (conditions[g.gate_id] ?? '').split('\n').map(x => x.trim()).filter(Boolean)
        const pending = g.required_signatures.filter(c => c !== 'commissioning')
        return (
          <Modal open onClose={() => setConfirm(null)} size="md"
            title={confirm.kind === 'approve' ? t('confirm.approveTitle', { gate: g.gate_code, system: system.code }) : t('confirm.revokeTitle', { gate: g.gate_code, system: system.code })}
            footer={
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" style={btn('outline')} onClick={() => setConfirm(null)}>{t('confirm.cancel')}</button>
                {confirm.kind === 'approve'
                  ? <button type="button" style={btn('primary')} disabled={isPending} onClick={() => doApprove(g)}>{t('approve', { gate: g.gate_code })}</button>
                  : <button type="button" style={btn('primary')} disabled={isPending || !revokeReason.trim()} onClick={() => doRevoke(g)}>{t('revoke')}</button>}
              </div>
            }>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>
              {confirm.kind === 'approve' ? (
                <>
                  <span>{t('confirm.criteria', { pass: g.criteria.filter(c => c.result === 'pass').length, total: g.criteria.length })}</span>
                  {conds.length > 0 && (
                    <div>{t('confirm.conditions')}<ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{conds.map((c, i) => <li key={i}>{c}</li>)}</ul></div>
                  )}
                  <span style={small}>{pending.length > 0
                    ? t('confirm.pendingSignatures', { capacities: pending.map(c => t(`capacity.${c}`)).join(', ') })
                    : t('confirm.noCosign')}</span>
                  {impact.ownGates.length > 0 && <span>{t('confirm.enablesGate', { gates: impact.ownGates.join(', ') })}</span>}
                  {impact.dependents.length > 0 && <span>{t('confirm.enablesSystems', { systems: impact.dependents.join(', ') })}</span>}
                </>
              ) : (
                <>
                  {impact.ownGates.length > 0
                    ? <span style={{ color: 'var(--danger-700)' }}>{t('confirm.regressesGates', { gates: impact.ownGates.join(', ') })}</span>
                    : <span>{t('confirm.noOwnImpact')}</span>}
                  {impact.dependents.length > 0 && <span style={{ color: 'var(--danger-700)' }}>{t('confirm.affectsSystems', { systems: impact.dependents.join(', ') })}</span>}
                  <label style={{ ...small, fontWeight: 600 }}>{t('revokePrompt', { gate: g.gate_code })}</label>
                  <textarea rows={3} style={input} value={revokeReason} onChange={e => setRevokeReason(e.target.value)} autoFocus />
                </>
              )}
            </div>
          </Modal>
        )
      })()}
    </div>
  )
}
