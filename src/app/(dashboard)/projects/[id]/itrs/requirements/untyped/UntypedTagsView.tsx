'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { assignEquipmentType, classifyTagTypes, previewTagTypeGroups, rejectTagTypeProposal } from '@/app/actions/tag-types'
import { TYPE_CHANGE_REASON_MIN, codeList, needsReason, type TagTypePreview } from '@/lib/tags/type-change'
import { cleanTypeCode, type CatalogType, type FreeSource, type TypeGroup } from '@/lib/tags/type-signature'

type AiMeta = { proposalId: string; confidence: number; reason: string }
export type GroupProposal =
  | ({ kind: 'type'; typeId: string; source: FreeSource } & Partial<AiMeta>)
  | ({ kind: 'type'; typeId: string; source: 'ai' } & AiMeta)
  | ({ kind: 'new_type'; newType: { code: string; name: string; category: string | null } } & AiMeta)
  | ({ kind: 'none' } & AiMeta)
  | { kind: 'pending'; rejected: boolean }

export type UntypedGroup = TypeGroup & { key: string; proposal: GroupProposal }

type Choice = { typeId: string } | { newType: { code: string; name: string; category: string | null } }

const PAGE = 40
const MAX_AI_ROUNDS = 10
const btn: React.CSSProperties = { minHeight: 40, padding: '0 14px', borderRadius: 8, fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const outline: React.CSSProperties = { ...btn, background: 'var(--card-bg)', color: 'var(--text-strong)', border: '1px solid var(--border)' }
const primary: React.CSSProperties = { ...btn, background: 'var(--primary-600)', color: '#ffffff', border: '1px solid var(--primary-600)' }
const field: React.CSSProperties = { minHeight: 36, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 'var(--text-sm)', background: 'var(--card-bg)', color: 'var(--text-strong)', fontFamily: 'inherit' }

/** El tipo que se aplicaría al aceptar (la propuesta o lo que el usuario eligió en «Otro tipo…»). */
function choiceOf(p: GroupProposal): Choice | null {
  if (p.kind === 'type') return { typeId: p.typeId }
  if (p.kind === 'new_type') return { newType: p.newType }
  return null
}

export default function UntypedTagsView({ projectId, groups, catalog, untyped, pendingAi, estimateUsd, lastRun, canEdit }: {
  projectId: string
  groups: UntypedGroup[]
  catalog: CatalogType[]
  untyped: number
  pendingAi: number
  estimateUsd: number
  lastRun: { at: string; model: string } | null
  canEdit: boolean
}) {
  const t = useTranslations('TagTypes')
  const router = useRouter()
  const [shown, setShown] = useState(PAGE)
  const [override, setOverride] = useState<Record<string, Choice>>({})
  const [previews, setPreviews] = useState<Record<string, TagTypePreview>>({})
  const [done, setDone] = useState<Record<string, number>>({})
  const [aiMsg, setAiMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const byId = useMemo(() => new Map(catalog.map(c => [c.id, c])), [catalog])

  const visible = groups.slice(0, shown)
  const counts = {
    free: groups.filter(g => g.proposal.kind === 'type' && g.proposal.source !== 'ai').length,
    ai: groups.filter(g => g.proposal.kind === 'type' ? g.proposal.source === 'ai' : g.proposal.kind === 'new_type').length,
    none: groups.filter(g => g.proposal.kind === 'none').length,
  }

  // Vista previa de los grupos visibles con un tipo existente (un tipo nuevo no tiene reglas: no gana ITR).
  const wanted = visible
    .filter(g => !done[g.key])
    .map(g => ({ g, c: override[g.key] ?? choiceOf(g.proposal) }))
    .filter((x): x is { g: UntypedGroup; c: { typeId: string } } => !!x.c && 'typeId' in x.c)
    .map(x => ({ key: `${x.g.key}#${x.c.typeId}`, signature: { prefix: x.g.prefix, disciplineId: x.g.discipline_id, descNorm: x.g.desc_norm }, typeId: x.c.typeId }))
  const missing = wanted.filter(w => !previews[w.key])
  const missingKey = missing.map(m => m.key).join(',')
  useEffect(() => {
    if (!missing.length) return
    let alive = true
    void previewTagTypeGroups({ projectId, items: missing }).then(res => {
      if (alive && res.previews) setPreviews(p => ({ ...p, ...res.previews }))
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- missingKey resume `missing` (array nuevo en cada render)
  }, [missingKey, projectId])

  function classify() {
    setError(null); setAiMsg(null)
    startTransition(async () => {
      let proposed = 0, cost = 0
      for (let i = 0; i < MAX_AI_ROUNDS; i++) {
        const res = await classifyTagTypes({ projectId })
        if (res.error) { setError(res.error); break }
        proposed += res.proposed ?? 0; cost += res.costUsd ?? 0
        if (!res.remaining) break
      }
      setAiMsg(t('ai.done', { count: proposed, cost: cost.toFixed(3) }))
      router.refresh()
    })
  }

  const accept = (g: UntypedGroup, choice: Choice, reason: string) => new Promise<string | null>(resolve => {
    startTransition(async () => {
      const p = g.proposal
      const res = await assignEquipmentType({
        projectId,
        signature: { prefix: g.prefix, disciplineId: g.discipline_id, descNorm: g.desc_norm },
        ...('typeId' in choice ? { typeId: choice.typeId } : { newType: choice.newType }),
        reason: reason || null,
        proposalId: 'proposalId' in p && !override[g.key] ? p.proposalId ?? null : null,
        source: override[g.key] ? 'manual' : p.kind === 'type' ? p.source : 'ai',
      })
      if (res.error) { resolve(res.error); return }
      setDone(d => ({ ...d, [g.key]: res.updated ?? 0 }))
      resolve(null)
      router.refresh()
    })
  })

  const reject = (g: UntypedGroup) => {
    const p = g.proposal
    if (!('proposalId' in p) || !p.proposalId) return
    startTransition(async () => {
      const res = await rejectTagTypeProposal({ projectId, proposalId: p.proposalId! })
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 'var(--text-sm)' }}>
        <strong>{t('summary.groups', { count: groups.length })}</strong>
        <span style={{ color: 'var(--text-muted)' }}>{t('summary.detail', { free: counts.free, ai: counts.ai, none: counts.none, pending: pendingAi })}</span>
        <span style={{ flex: 1 }} />
        {lastRun && <span style={{ color: 'var(--text-muted)' }}>{t('summary.lastRun', { at: new Date(lastRun.at).toLocaleString(), model: lastRun.model })}</span>}
        {canEdit && pendingAi > 0 && (
          <button type="button" onClick={classify} disabled={isPending} style={{ ...outline, opacity: isPending ? 0.6 : 1 }}
            title={t('ai.hint')}>
            {isPending ? t('ai.running') : t('ai.run', { count: pendingAi, cost: estimateUsd < 0.01 ? '< 0,01' : estimateUsd.toFixed(2) })}
          </button>
        )}
      </div>
      {aiMsg && <p role="status" style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--success-800)' }}>{aiMsg}</p>}
      {error && <p role="alert" style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--danger-700)' }}>{error}</p>}
      {!canEdit && groups.length > 0 && <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{t('readOnly')}</p>}

      {groups.length === 0 ? (
        <p style={{ margin: 0, padding: '24px 16px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
          {untyped === 0 ? t('emptyAll') : t('empty')}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map(g => {
            const choice = override[g.key] ?? choiceOf(g.proposal)
            const pv = choice && 'typeId' in choice ? previews[`${g.key}#${choice.typeId}`] : undefined
            return (
              <GroupCard key={g.key} g={g} choice={choice} overridden={!!override[g.key]} preview={pv} doneCount={done[g.key]}
                catalog={catalog} byId={byId} canEdit={canEdit} busy={isPending}
                onChoose={c => setOverride(o => ({ ...o, [g.key]: c }))}
                onAccept={(c, reason) => accept(g, c, reason)}
                onReject={() => reject(g)} />
            )
          })}
          {groups.length > shown && (
            <button type="button" onClick={() => setShown(s => s + PAGE)} style={{ ...outline, alignSelf: 'center' }}>
              {t('more', { count: groups.length - shown })}
            </button>
          )}
        </div>
      )}
    </>
  )
}

function GroupCard({ g, choice, overridden, preview, doneCount, catalog, byId, canEdit, busy, onChoose, onAccept, onReject }: {
  g: UntypedGroup
  choice: Choice | null
  overridden: boolean
  preview?: TagTypePreview
  doneCount?: number
  catalog: CatalogType[]
  byId: Map<string, CatalogType>
  canEdit: boolean
  busy: boolean
  onChoose: (c: Choice) => void
  onAccept: (c: Choice, reason: string) => Promise<string | null>
  onReject: () => void
}) {
  const t = useTranslations('TagTypes')
  const [picking, setPicking] = useState(false)
  const [pickId, setPickId] = useState('')
  const [nt, setNt] = useState({ code: g.prefix, name: g.description ?? '', category: '' })
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const p = g.proposal
  const isDone = doneCount != null
  const categories = useMemo(() => [...new Set(catalog.map(c => c.category).filter((x): x is string => !!x))].sort(), [catalog])

  const label = !choice ? null
    : 'typeId' in choice ? (() => { const c = byId.get(choice.typeId); return c ? `${c.code} · ${c.name}` : '—' })()
      : t('proposal.create', { code: choice.newType.code, name: choice.newType.name })
  const source = overridden ? t('source.manual')
    : p.kind === 'type' && p.source !== 'ai' ? t(`source.${p.source}`)
      : p.kind === 'type' || p.kind === 'new_type' ? t('source.ai', { conf: (p.confidence ?? 0).toFixed(2) })
        : p.kind === 'none' ? t('source.none')
          : p.rejected ? t('source.rejected') : t('source.pending')
  const sourceColor = overridden ? 'var(--text-muted)' : p.kind === 'type' && p.source !== 'ai' ? 'var(--success-700)' : p.kind === 'type' || p.kind === 'new_type' ? 'var(--violet-700)' : 'var(--text-muted)'
  const aiReason = 'reason' in p && !overridden ? p.reason : null
  const needs = !!preview && needsReason(preview)
  const ready = !!choice && (!needs || reason.trim().length >= TYPE_CHANGE_REASON_MIN)

  async function doAccept() {
    if (!choice) return
    setErr(null)
    const e = await onAccept(choice, reason.trim())
    if (e) setErr(['reason_required', 'type_exists', 'invalid_type', 'no_tags'].includes(e) ? t(`error.${e as 'no_tags'}`) : e)
  }
  function applyPick() {
    if (pickId === '__new') {
      const code = cleanTypeCode(nt.code)
      if (!code || !nt.name.trim()) { setErr(t('error.invalid_type')); return }
      onChoose({ newType: { code, name: nt.name.trim(), category: nt.category || null } })
    } else if (pickId) onChoose({ typeId: pickId })
    setPicking(false); setErr(null)
  }

  return (
    <article style={{ background: isDone ? 'var(--success-50)' : 'var(--card-bg)', border: `1px solid ${isDone ? 'var(--success-200)' : 'var(--border)'}`, borderRadius: 12, padding: '14px 18px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 15, color: 'var(--text-strong)' }}>{g.prefix || '—'} · «{(g.description ?? '').trim() || t('noDescription')}»</strong>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{g.discipline_name ?? t('noDiscipline')}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            title={g.samples.join(', ')}>
            {t('tags', { count: g.n })}: {g.samples.join(', ')}{g.n > g.samples.length ? ' …' : ''}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('proposal.label')}</span>
          <strong style={{ fontSize: 14, color: 'var(--text-strong)' }}>{label ?? t('proposal.empty')}</strong>
          <span style={{ fontSize: 12, fontWeight: 600, color: sourceColor }}>{source}</span>
          {aiReason && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{aiReason}</span>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 'var(--text-sm)' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('preview.label')}</span>
          {!choice ? <span style={{ color: 'var(--text-muted)' }}>—</span>
            : 'newType' in choice ? <span style={{ color: 'var(--text-muted)' }}>{t('preview.newType')}</span>
              : !preview ? <span style={{ color: 'var(--text-muted)' }}>{t('preview.loading')}</span>
                : (
                  <>
                    <span>{t('preview.gain', { count: preview.gain })}</span>
                    {preview.gain_codes.length > 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace' }}>{codeList(preview.gain_codes)}</span>}
                    {preview.type_rules === 0 && <span style={{ fontSize: 12, color: 'var(--warning-800)' }}>{t('preview.noRules')}</span>}
                    {preview.outside > 0 && <span style={{ fontSize: 12, color: 'var(--warning-800)' }}>{t('preview.outside', { count: preview.outside, signed: preview.outside_signed })}</span>}
                  </>
                )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {isDone ? (
            <span role="status" style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--success-800)' }}>{t('applied', { count: doneCount })}</span>
          ) : canEdit ? (
            <>
              {'proposalId' in p && p.proposalId && !overridden && (p.kind === 'type' || p.kind === 'new_type') && (
                <button type="button" onClick={onReject} disabled={busy} style={outline}>{t('reject')}</button>
              )}
              <button type="button" onClick={() => setPicking(v => !v)} disabled={busy} style={outline} aria-expanded={picking}>{t('other')}</button>
              {choice && (
                <button type="button" onClick={doAccept} disabled={busy || !ready} style={{ ...primary, opacity: busy || !ready ? 0.55 : 1, cursor: busy || !ready ? 'not-allowed' : 'pointer' }}>
                  {t('accept', { count: g.n })}
                </button>
              )}
            </>
          ) : null}
        </div>
      </div>

      {picking && canEdit && !isDone && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
            {t('pick.label')}
            <select value={pickId} onChange={e => setPickId(e.target.value)} style={{ ...field, minWidth: 260 }}>
              <option value="">{t('pick.placeholder')}</option>
              {catalog.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}{c.category ? ` (${c.category})` : ''}</option>)}
              <option value="__new">{t('pick.new')}</option>
            </select>
          </label>
          {pickId === '__new' && (
            <>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                {t('pick.code')}
                <input value={nt.code} onChange={e => setNt({ ...nt, code: e.target.value.toUpperCase() })} maxLength={12} style={{ ...field, width: 90, fontFamily: 'ui-monospace, monospace' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                {t('pick.name')}
                <input value={nt.name} onChange={e => setNt({ ...nt, name: e.target.value })} maxLength={80} style={{ ...field, width: 220 }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                {t('pick.category')}
                <select value={nt.category} onChange={e => setNt({ ...nt, category: e.target.value })} style={field}>
                  <option value="">—</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </>
          )}
          <button type="button" onClick={applyPick} disabled={!pickId} style={{ ...outline, minHeight: 36 }}>{t('pick.apply')}</button>
        </div>
      )}

      {needs && canEdit && !isDone && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 6 }}>
            {t('reason.label', { count: preview!.outside, codes: codeList(preview!.outside_codes) })}
          </label>
          <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder={t('reason.placeholder')}
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 'var(--text-sm)', fontFamily: 'inherit', resize: 'vertical' }} />
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>{t('reason.hint')}</p>
        </div>
      )}
      {err && <p role="alert" style={{ fontSize: 12, color: 'var(--danger-700)', margin: '10px 0 0' }}>{err}</p>}
    </article>
  )
}
