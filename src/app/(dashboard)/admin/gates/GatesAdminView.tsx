'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { TRANSFER_CHECK_KEYS } from '@/lib/startup/catalog'
import {
  addCatalogGate,
  addGateCriterion,
  createGate,
  deleteGate,
  deleteGateCriterion,
  gateCriterionImpact,
  moveGate,
  updateGate,
  updateGateCriterion,
  updateGatePolicy,
  updateTransferPolicy,
} from '@/app/actions/gates-admin'
import { COSIGN_CAPACITIES, CONFIGURABLE_CRITERIA, type GatePolicy } from '@/lib/readiness/gates'
import { GATE_APPROVAL_ROLES, READINESS_GATE_CATALOG } from '@/lib/constants/readiness-gates'
import { useAskDialog } from '@/components/ui/AskDialog'

type Gate = {
  id: string
  code: string
  name: string
  description: string | null
  order_index: number
  phase_id: string | null
  requires_previous: boolean
  requires_lineup: boolean
  requires_performance: boolean
  is_startup_gate: boolean
  is_active: boolean
  approval_roles: string[]
  required_signatures: string[]
  cosign_roles: string[]
}
type Crit = { id: string; gate_id: string; kind: string; label: string | null; is_blocking: boolean }
type Phase = { id: string; code: string; name: string; certificate_name: string | null }

const card: React.CSSProperties = { background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }
const small: React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }
const input: React.CSSProperties = {
  padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 'var(--text-sm)',
  background: 'var(--card-bg)', color: 'var(--text-strong)',
}
const btn = (primary = false): React.CSSProperties => ({
  padding: '6px 12px', borderRadius: 8, fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer',
  border: primary ? 'none' : '1px solid var(--border)',
  background: primary ? 'var(--primary-500)' : 'transparent', color: primary ? '#fff' : 'var(--text-strong)',
})
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 'var(--text-sm)', color: 'var(--danger-500)' }

export default function GatesAdminView({ gates, criteria, phases, weights, policy, nonDispensable }: {
  gates: Gate[]; criteria: Crit[]; phases: Phase[]; weights?: React.ReactNode; policy: GatePolicy
  /** S25 (E-13): ítems del checklist de traspaso que no se pueden dispensar. */
  nonDispensable: string[]
}) {
  const t = useTranslations('GatesAdmin')
  const ts = useTranslations('Startup')
  const tg = useTranslations('Gates')
  const tA = useTranslations('AskDialog')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [newGate, setNewGate] = useState({ code: '', name: '', phaseId: '' })
  const [newCrit, setNewCrit] = useState<Record<string, { kind: string; label: string }>>({})
  const { dialog, confirm } = useAskDialog() // G-08: diálogo propio

  function act(fn: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  const existingCodes = new Set(gates.map(g => g.code))
  // S11 (E-07): una prueba de desempeño necesita la planta arrancada; exigirla antes del gate de arranque es circular.
  const startup = gates.find(g => g.is_startup_gate && g.is_active)
  const perfBeforeStartup = startup ? gates.filter(g => g.is_active && g.requires_performance && g.order_index <= startup.order_index) : []

  async function removeCriterion(id: string) {
    // S11 (D-20): confirmar con el impacto; con declaraciones el criterio se archiva (no se borra la evidencia).
    const impact = await gateCriterionImpact(id)
    if (impact.error) { setError(impact.error); return }
    const msg = (impact.attestations ?? 0) > 0
      ? t('confirmRemoveCriterionImpact', { n: impact.attestations ?? 0, systems: impact.systems ?? 0 })
      : t('confirmRemoveCriterion')
    if (await confirm({ message: msg, confirmLabel: tA('remove'), danger: true })) act(() => deleteGateCriterion(id))
  }

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {dialog}
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('title')}</h1>
        <p style={{ ...small, margin: '6px 0 0', lineHeight: 1.5 }}>{t('subtitle')}</p>
      </div>

      {error && (
        <div role="alert" style={{ padding: '10px 14px', background: 'var(--danger-50)', border: '1px solid #fecaca', borderRadius: 8, color: 'var(--danger-700)', fontSize: 'var(--text-sm)' }}>
          {error}
        </div>
      )}

      {/* S11 (D13): qué pasa cuando un gate aprobado entra en regresión */}
      <section style={card} aria-label={t('policy.title')}>
        <div style={{ fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6 }}>{t('policy.title')}</div>
        <p style={{ ...small, margin: '0 0 10px' }}>{t('policy.hint')}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          <label style={{ ...small, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {t('policy.previous')}
            <select style={input} value={policy.regressed_previous} disabled={isPending}
              onChange={e => act(() => updateGatePolicy({ regressed_previous: e.target.value as GatePolicy['regressed_previous'] }))}>
              <option value="block">{t('policy.block')}</option>
              <option value="condition">{t('policy.condition')}</option>
            </select>
          </label>
          <label style={{ ...small, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {t('policy.dependency')}
            <select style={input} value={policy.regressed_dependency} disabled={isPending}
              onChange={e => act(() => updateGatePolicy({ regressed_dependency: e.target.value as GatePolicy['regressed_dependency'] }))}>
              <option value="condition">{t('policy.condition')}</option>
              <option value="block">{t('policy.block')}</option>
            </select>
          </label>
          {/* R5: ITR requeridos (registro de requisitos) que todavía no se generaron */}
          <label style={{ ...small, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {t('policy.requirements')}
            <select style={input} value={policy.missing_requirements} disabled={isPending}
              onChange={e => act(() => updateGatePolicy({ missing_requirements: e.target.value as GatePolicy['missing_requirements'] }))}>
              <option value="warn">{t('policy.condition')}</option>
              <option value="block">{t('policy.block')}</option>
              <option value="off">{t('policy.off')}</option>
            </select>
          </label>
          <label style={{ ...small, display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
            <input type="checkbox" checked={policy.cat_a_regresses_approved} disabled={isPending}
              onChange={e => act(() => updateGatePolicy({ cat_a_regresses_approved: e.target.checked }))} />
            {t('policy.catA')}
          </label>
        </div>
      </section>

      {/* S25 (E-13): traspasos de propiedad — faltas que no se pueden justificar */}
      <section style={card} aria-label={t('transferPolicy.title')}>
        <div style={{ fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6 }}>{t('transferPolicy.title')}</div>
        <p style={{ ...small, margin: '0 0 10px' }}>{t('transferPolicy.hint')}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
          {TRANSFER_CHECK_KEYS.map(k => (
            <label key={k} style={{ ...small, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={nonDispensable.includes(k)} disabled={isPending}
                onChange={e => act(() => updateTransferPolicy(e.target.checked ? [...nonDispensable, k] : nonDispensable.filter(x => x !== k)))} />
              {ts(`ops.check.${k}`)}
            </label>
          ))}
        </div>
      </section>

      {!startup && <div role="alert" style={{ ...small, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, color: '#b45309' }}>{t('noStartupGate')}</div>}
      {perfBeforeStartup.length > 0 && (
        <div role="alert" style={{ ...small, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, color: '#b45309' }}>
          {t('perfBeforeStartup', { gates: perfBeforeStartup.map(g => g.code).join(', '), startup: startup?.code ?? '' })}
        </div>
      )}

      {/* Pesos en el avance físico ponderado (fase 5, sesión 2) */}
      {weights}

      {gates.map((g, idx) => {
        const crits = criteria.filter(c => c.gate_id === g.id)
        const nc = newCrit[g.id] ?? { kind: 'manual_attestation', label: '' }
        return (
          <section key={g.id} style={{ ...card, opacity: g.is_active ? 1 : 0.6 }} aria-label={g.code}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)' }}>{g.code}</span>
                  <input style={{ ...input, minWidth: 260 }} defaultValue={g.name} aria-label={t('name')}
                    onBlur={e => e.target.value.trim() !== g.name && act(() => updateGate(g.id, { name: e.target.value }))} />
                </div>
                {g.description && <span style={small}>{g.description}</span>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" style={btn()} disabled={isPending || idx === 0} aria-label={t('moveUp')} onClick={() => act(() => moveGate(g.id, 'up'))}>↑</button>
                <button type="button" style={btn()} disabled={isPending || idx === gates.length - 1} aria-label={t('moveDown')} onClick={() => act(() => moveGate(g.id, 'down'))}>↓</button>
                <button type="button" style={btn()} disabled={isPending} onClick={() => act(() => updateGate(g.id, { isActive: !g.is_active }))}>
                  {g.is_active ? t('deactivate') : t('activate')}
                </button>
                <button type="button" style={{ ...btn(), color: 'var(--danger-500)' }} disabled={isPending}
                  onClick={async () => { if (await confirm({ message: t('confirmDelete', { code: g.code }), confirmLabel: t('delete'), danger: true })) act(() => deleteGate(g.id)) }}>
                  {t('delete')}
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginTop: 14 }}>
              <label style={{ ...small, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {t('phase')}
                <select style={input} value={g.phase_id ?? ''} disabled={isPending}
                  onChange={e => act(() => updateGate(g.id, { phaseId: e.target.value || null }))}>
                  <option value="">{t('noPhase')}</option>
                  {phases.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                </select>
              </label>
              <label style={{ ...small, display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
                <input type="checkbox" checked={g.requires_previous} disabled={isPending || idx === 0}
                  onChange={e => act(() => updateGate(g.id, { requiresPrevious: e.target.checked }))} />
                {t('requiresPrevious')}
              </label>
              <label style={{ ...small, display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
                <input type="checkbox" checked={g.requires_lineup} disabled={isPending}
                  onChange={e => act(() => updateGate(g.id, { requiresLineup: e.target.checked }))} />
                {t('requiresLineup')}
              </label>
              <label style={{ ...small, display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
                <input type="checkbox" checked={g.requires_performance} disabled={isPending}
                  onChange={e => act(() => updateGate(g.id, { requiresPerformance: e.target.checked }))} />
                {t('requiresPerformance')}
              </label>
              <label style={{ ...small, display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
                <input type="checkbox" checked={g.is_startup_gate} disabled={isPending}
                  onChange={e => act(() => updateGate(g.id, { isStartupGate: e.target.checked }))} />
                {t('isStartupGate')}
              </label>
              <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                <legend style={small}>{t('approvalRoles')}</legend>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                  {GATE_APPROVAL_ROLES.map(r => (
                    <label key={r} style={{ ...small, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input type="checkbox" checked={g.approval_roles.includes(r)} disabled={isPending}
                        onChange={e => act(() => updateGate(g.id, {
                          approvalRoles: e.target.checked ? [...g.approval_roles, r] : g.approval_roles.filter(x => x !== r),
                        }))} />
                      {t(`role.${r}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginTop: 14 }}>
              <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                <legend style={small}>{t('requiredSignatures')}</legend>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                  {COSIGN_CAPACITIES.map(c => (
                    <label key={c} style={{ ...small, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input type="checkbox" checked={g.required_signatures.includes(c)} disabled={isPending}
                        onChange={e => act(() => updateGate(g.id, {
                          requiredSignatures: e.target.checked ? [...g.required_signatures, c] : g.required_signatures.filter(x => x !== c),
                        }))} />
                      {tg(`capacity.${c}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                <legend style={small}>{t('cosignRoles')}</legend>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                  {GATE_APPROVAL_ROLES.map(r => (
                    <label key={r} style={{ ...small, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input type="checkbox" checked={g.cosign_roles.includes(r)} disabled={isPending}
                        onChange={e => act(() => updateGate(g.id, {
                          cosignRoles: e.target.checked ? [...g.cosign_roles, r] : g.cosign_roles.filter(x => x !== r),
                        }))} />
                      {t(`role.${r}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div style={{ ...small, fontWeight: 600, marginBottom: 6 }}>{t('criteria')}</div>
              {g.requires_previous && idx > 0 && <div style={{ ...small, marginBottom: 6 }}>• {tg('kind.previous_gate')}</div>}
              {g.requires_lineup && <div style={{ ...small, marginBottom: 6 }}>• {tg('kind.lineup_verified')}</div>}
              {g.requires_performance && <div style={{ ...small, marginBottom: 6 }}>• {tg('kind.performance_accepted')}</div>}
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {crits.map(c => (
                  <li key={c.id} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 'var(--text-sm)' }}>
                    <span style={{ color: 'var(--text-strong)' }}>• {c.label ?? tg(`kind.${c.kind}`)}</span>
                    <label style={{ ...small, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input type="checkbox" checked={c.is_blocking} disabled={isPending}
                        onChange={e => act(() => updateGateCriterion(c.id, { isBlocking: e.target.checked }))} />
                      {t('blocking')}
                    </label>
                    <button type="button" style={linkBtn} disabled={isPending} onClick={() => removeCriterion(c.id)}>{t('remove')}</button>
                  </li>
                ))}
              </ul>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <select style={input} value={nc.kind} aria-label={t('criterionKind')}
                  onChange={e => setNewCrit(s => ({ ...s, [g.id]: { ...nc, kind: e.target.value } }))}>
                  {CONFIGURABLE_CRITERIA.map(k => <option key={k} value={k}>{tg(`kind.${k}`)}</option>)}
                </select>
                {nc.kind === 'manual_attestation' && (
                  <input style={{ ...input, flex: 1, minWidth: 240 }} placeholder={t('attestationPlaceholder')} value={nc.label}
                    onChange={e => setNewCrit(s => ({ ...s, [g.id]: { ...nc, label: e.target.value } }))} />
                )}
                <button type="button" style={btn(true)} disabled={isPending}
                  onClick={() => act(async () => {
                    const r = await addGateCriterion({ gateId: g.id, kind: nc.kind, label: nc.label })
                    if (!r.error) setNewCrit(s => ({ ...s, [g.id]: { kind: 'manual_attestation', label: '' } }))
                    return r
                  })}>
                  {t('addCriterion')}
                </button>
              </div>
            </div>
          </section>
        )
      })}

      <section style={card} aria-label={t('newGate')}>
        <div style={{ fontWeight: 700, color: 'var(--text-strong)', marginBottom: 10 }}>{t('newGate')}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={{ ...input, width: 130 }} placeholder={t('code')} value={newGate.code}
            onChange={e => setNewGate(s => ({ ...s, code: e.target.value }))} />
          <input style={{ ...input, flex: 1, minWidth: 220 }} placeholder={t('name')} value={newGate.name}
            onChange={e => setNewGate(s => ({ ...s, name: e.target.value }))} />
          <select style={input} value={newGate.phaseId} onChange={e => setNewGate(s => ({ ...s, phaseId: e.target.value }))} aria-label={t('phase')}>
            <option value="">{t('noPhase')}</option>
            {phases.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
          <button type="button" style={btn(true)} disabled={isPending}
            onClick={() => act(async () => {
              const r = await createGate({ code: newGate.code, name: newGate.name, phaseId: newGate.phaseId || null })
              if (!r.error) setNewGate({ code: '', name: '', phaseId: '' })
              return r
            })}>
            {t('create')}
          </button>
        </div>

        <div style={{ ...small, fontWeight: 600, marginTop: 18 }}>{t('catalogTitle')}</div>
        <p style={{ ...small, margin: '4px 0 10px' }}>{t('catalogHint')}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {READINESS_GATE_CATALOG.map(c => (
            <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontWeight: 600, color: 'var(--text-strong)', fontSize: 'var(--text-sm)' }}>{c.code} — {c.name}</span>
                <div style={small}>{c.description}</div>
              </div>
              <button type="button" style={btn()} disabled={isPending || existingCodes.has(c.code)}
                onClick={() => act(() => addCatalogGate(c.key))}>
                {existingCodes.has(c.code) ? t('added') : t('add')}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
