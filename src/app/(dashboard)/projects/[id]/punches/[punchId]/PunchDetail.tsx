'use client'

// N1b: página propia del punch (reemplaza los modales de la lista y de la ficha del tag).
// Las acciones son los mismos componentes de siempre (verificación, clasificación, cancelar);
// las RPC deciden, aquí solo se presentan. Pensada para el teléfono: una columna, botones de 44 px.

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { PersonName } from '@/components/ui'
import CancelPunchControl from '@/components/punch/CancelPunchControl'
import { PunchVerification } from '@/components/punch/PunchVerification'
import { PunchClassification } from '@/components/punch/PunchClassification'
import { updatePunchStatus, addPunchComment, reassignPunch } from '@/app/actions/punches'
import { punchDisplayStatus } from '@/lib/punches/verification'
import type { PunchTimelineEntry, PunchTimelineKind } from '@/lib/punches/timeline'
import { isInactiveMember, memberIdSet } from '@/lib/people/inactive'
import { canRaisePunch } from '@/lib/constants/punch-roles'
import { ROLE_TIERS } from '@/lib/constants/roles'
import { PUNCH_CATEGORY_CFG as CATEGORY_CFG, PUNCH_STATUS_COLORS as STATUS_COLORS } from '@/lib/constants/status-colors'
import { formatInZone } from '@/lib/time/zone'
import PunchPhotosSection from '../../tags/[tagId]/PunchPhotosSection'
import { ink } from '@/lib/theme'

export type PunchDetailData = {
  id: string
  punch_number: string
  category: 'A' | 'B' | 'C'
  description: string
  status: 'open' | 'in_progress' | 'closed' | 'cancelled'
  priority: string
  target_date: string | null
  closed_date: string | null
  created_at: string
  itr_id: string | null
  assigned_to: string | null
  raised_by: string | null
  resolved_at: string | null
  resolved_by: string | null
  resolved_by_name: string | null
  impact: string | null
  startup_disposition: string | null
  category_reviewed_at: string | null
  discipline: { code: string; name: string; color: string } | null
  tag: { id: string; tag_number: string; description: string | null } | null
  subsystem: { code: string; name: string; system: { id: string; code: string; name: string } | null } | null
  itr: { id: string; itr_number: string; tag_id: string | null } | null
  itrItem: { item_number: string | null; description: string; description_es: string | null } | null
}

type OrgMember = { user_id: string; profiles: { full_name: string } | null }

const KIND_COLOR: Record<PunchTimelineKind, string> = {
  created: 'var(--orange-600)', comment: 'var(--gray-400)', resolved: 'var(--primary-500)', verified: 'var(--success-500)',
  rejected: 'var(--danger-500)', cancelled: 'var(--gray-400)', reviewed: 'var(--warning-700)', reassigned: 'var(--violet-600)',
}

const card: React.CSSProperties = {
  background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '14px',
  padding: 'clamp(14px, 3vw, 20px)', marginTop: '12px',
}
const h2: React.CSSProperties = { fontSize: '13px', fontWeight: 700, color: 'var(--gray-700)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.04em' }
const label: React.CSSProperties = { fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }
const touch: React.CSSProperties = { minHeight: '44px', padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }

export default function PunchDetail({ punch, projectId, projectName, timezone, timeline, names, orgMembers, userId, role }: {
  punch: PunchDetailData
  projectId: string
  projectName: string
  timezone: string | null
  timeline: PunchTimelineEntry[]
  names: Record<string, string>
  orgMembers: OrgMember[]
  userId: string
  role: string
}) {
  const t = useTranslations('PunchList')
  const tTags = useTranslations('Tags')
  const tGuide = useTranslations('PunchGuide')
  const locale = useLocale()
  const router = useRouter()
  const memberIds = useMemo(() => memberIdSet(orgMembers), [orgMembers])
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [reassignTo, setReassignTo] = useState<string>(punch.assigned_to ?? '')
  const [photoCount, setPhotoCount] = useState<number | null>(null)

  const tagId = punch.tag?.id ?? null
  const catCfg = CATEGORY_CFG[punch.category]
  const displayStatus = punchDisplayStatus(punch)
  const stColors = STATUS_COLORS[displayStatus] ?? STATUS_COLORS.open
  const isClosed = punch.status === 'closed' || punch.status === 'cancelled'
  const canReassign = ROLE_TIERS.editor.includes(role)
  const reassignDirty = (reassignTo || null) !== (punch.assigned_to ?? null)
  const when = (iso: string) => formatInZone(iso, timezone, locale)
  const who = (id: string | null | undefined) => (id ? <PersonName name={names[id]} inactive={isInactiveMember(id, memberIds)} /> : t('noAssignee'))
  const itemText = punch.itrItem ? (locale.startsWith('es') && punch.itrItem.description_es ? punch.itrItem.description_es : punch.itrItem.description) : null

  function refresh() { setError(null); router.refresh() }

  function run(action: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null)
    startTransition(async () => {
      const res = await action()
      if (res.error) { setError(res.error); return }
      after?.()
      router.refresh()
    })
  }

  const meta: Array<[string, React.ReactNode]> = [
    [t('page.raisedBy'), <>{who(punch.raised_by)} · {when(punch.created_at)}</>],
    [t('page.assignedTo'), who(punch.assigned_to)],
    ...(punch.target_date ? [[t('page.targetDate'), punch.target_date] as [string, React.ReactNode]] : []),
    ...(punch.closed_date ? [[t('page.closedDate'), punch.closed_date] as [string, React.ReactNode]] : []),
    ...(punch.subsystem ? [[t('page.location'), `${punch.subsystem.system ? `${punch.subsystem.system.code} › ` : ''}${punch.subsystem.code} — ${punch.subsystem.name}`] as [string, React.ReactNode]] : []),
    ...(punch.discipline ? [[t('page.discipline'), <span key="d" style={{ color: ink(punch.discipline.color), fontWeight: 600 }}>{punch.discipline.code} · {punch.discipline.name}</span>] as [string, React.ReactNode]] : []),
  ]

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', padding: 'clamp(12px, 4vw, 32px)', paddingBottom: '48px' }}>
      {/* Volver: a la lista del proyecto y, si tiene tag, a su pestaña de punch */}
      <div style={{ display: 'flex', gap: '8px 16px', flexWrap: 'wrap', fontSize: '13px' }}>
        <Link href={`/projects/${projectId}/punches`} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
          ← {t('page.backToList', { project: projectName })}
        </Link>
        {punch.tag && (
          <Link href={`/projects/${projectId}/tags/${punch.tag.id}?tab=punches`} style={{ color: 'var(--primary-500)', textDecoration: 'none', fontFamily: 'ui-monospace, monospace' }}>
            {punch.tag.tag_number} ↗
          </Link>
        )}
      </div>

      {/* ── Encabezado ─────────────────────────────────────────── */}
      <div style={{ ...card, borderLeft: `4px solid ${catCfg.color}` }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
          <h1 style={{ fontSize: '20px', fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{punch.punch_number}</h1>
          <span style={{ padding: '3px 9px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, background: catCfg.bg, color: catCfg.color, border: `1px solid ${catCfg.border}` }}>{catCfg.label}</span>
          <span style={{ padding: '3px 9px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, background: stColors.bg, color: stColors.color }}>{t(`punchStatus.${displayStatus}`)}</span>
          {!punch.category_reviewed_at && !isClosed && <span style={{ fontSize: '11px', color: 'var(--warning-700)' }}>{tGuide('unreviewedShort')}</span>}
        </div>
        <p style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-strong)', margin: 0, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{punch.description}</p>

        {punch.tag && (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '8px 0 0' }}>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: ink(punch.discipline?.color ?? 'var(--text-strong)') }}>{punch.tag.tag_number}</span>
            {punch.tag.description ? ` — ${punch.tag.description}` : ''}
          </p>
        )}
        {punch.itr && (
          <p style={{ fontSize: '13px', margin: '6px 0 0', color: 'var(--text-muted)' }}>
            {t('page.fromItr')}{' '}
            {punch.itr.tag_id
              ? <Link href={`/projects/${projectId}/tags/${punch.itr.tag_id}/itrs/${punch.itr.id}`} style={{ color: 'var(--primary-500)', fontFamily: 'ui-monospace, monospace', textDecoration: 'none' }}>{punch.itr.itr_number}</Link>
              : <span style={{ fontFamily: 'ui-monospace, monospace' }}>{punch.itr.itr_number}</span>}
            {itemText && <> · {punch.itrItem?.item_number ? `${punch.itrItem.item_number} ` : ''}{itemText}</>}
          </p>
        )}

        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px 16px', margin: '16px 0 0' }}>
          {meta.map(([k, v]) => (
            <div key={k} style={{ minWidth: 0 }}>
              <dt style={label}>{k}</dt>
              <dd style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--text-strong)', wordBreak: 'break-word' }}>{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ── Qué hacer ahora ────────────────────────────────────── */}
      {!isClosed && (
        <section style={card} aria-labelledby="punch-actions">
          <h2 id="punch-actions" style={h2}>{t('page.actions')}</h2>
          <PunchVerification
            punch={punch}
            projectId={projectId} tagId={tagId} userId={userId} role={role} photoCount={photoCount} onUpdated={refresh}
          />
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: canReassign ? '16px' : 0 }}>
            {punch.status !== 'in_progress' && role !== 'client' && (
              <button
                onClick={() => run(() => updatePunchStatus({ punchId: punch.id, status: 'in_progress', projectId, tagId }))}
                disabled={isPending}
                style={{ ...touch, background: 'var(--primary-50)', color: 'var(--primary-500)', border: '1px solid var(--primary-200)' }}
              >
                {t('detail.toInProgress')}
              </button>
            )}
            {/* S06 (C-11, D8): cancelar con motivo, por un supervisor distinto de quien lo levantó */}
            <CancelPunchControl punch={punch} projectId={projectId} tagId={tagId} userId={userId} role={role} onDone={refresh} />
          </div>

          {canReassign && (
            <div>
              <label htmlFor="punch-reassign" style={{ ...label, display: 'block', marginBottom: '6px' }}>{tTags('punches.detail.labelReassign')}</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <select
                  id="punch-reassign"
                  value={reassignTo}
                  onChange={e => setReassignTo(e.target.value)}
                  disabled={isPending}
                  style={{ flex: '1 1 220px', minHeight: '44px', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px', background: 'var(--card-bg)', fontFamily: 'inherit' }}
                >
                  <option value="">{tTags('punches.detail.reassignPlaceholder')}</option>
                  {orgMembers.map(m => <option key={m.user_id} value={m.user_id}>{m.profiles?.full_name ?? m.user_id}</option>)}
                </select>
                <button
                  onClick={() => run(() => reassignPunch({ punchId: punch.id, projectId, tagId, newAssignee: reassignTo || null }))}
                  disabled={isPending || !reassignDirty}
                  style={{
                    ...touch, whiteSpace: 'nowrap', border: 'none',
                    background: reassignDirty && !isPending ? 'var(--primary-500)' : 'var(--gray-100)',
                    color: reassignDirty && !isPending ? '#fff' : 'var(--gray-400)',
                    cursor: reassignDirty && !isPending ? 'pointer' : 'default',
                  }}
                >
                  {isPending ? tTags('punches.detail.reassignSubmitting') : tTags('punches.detail.reassignBtn')}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Impacto, disposición para el arranque y revisión de categoría (fase 4) */}
      <section style={card}>
        <PunchClassification punch={punch} projectId={projectId} tagId={tagId} userId={userId} role={role} onUpdated={refresh} />
        {/* Fotos (C-03): las sube quien levanta punch; el cliente solo las ve */}
        <PunchPhotosSection punchId={punch.id} projectId={projectId} tagId={tagId} onCountChange={setPhotoCount} canUpload={canRaisePunch(role)} />
      </section>

      {error && (
        <p role="alert" style={{ fontSize: '13px', color: 'var(--danger-700)', padding: '10px 12px', background: 'var(--danger-100)', borderRadius: '8px', margin: '12px 0 0' }}>{error}</p>
      )}

      {/* ── Historia ───────────────────────────────────────────── */}
      <section style={card} aria-labelledby="punch-history">
        <h2 id="punch-history" style={h2}>{t('page.history')}</h2>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {timeline.map((e, i) => (
            <li key={e.key} style={{ display: 'flex', gap: '12px', paddingBottom: i < timeline.length - 1 ? '14px' : 0 }}>
              <span aria-hidden style={{ width: '10px', height: '10px', borderRadius: '50%', background: KIND_COLOR[e.kind], flexShrink: 0, marginTop: '5px' }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '13px', color: 'var(--text-strong)' }}>
                  <strong>{who(e.userId)}</strong>{' '}
                  {e.kind === 'reassigned'
                    ? t('page.kind.reassigned', { to: e.to ? (names[e.to] ?? '—') : t('noAssignee') })
                    : t(`page.kind.${e.kind}`)}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '1px' }}>{when(e.at)}</div>
                {e.text && (
                  <p style={{ fontSize: '13px', color: 'var(--gray-700)', margin: '4px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{e.text}</p>
                )}
              </div>
            </li>
          ))}
        </ol>

        {!isClosed && canRaisePunch(role) && (
          <div style={{ marginTop: '18px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
            <label htmlFor="punch-comment" style={{ ...label, display: 'block', marginBottom: '6px' }}>{t('detail.labelComment')}</label>
            <textarea
              id="punch-comment"
              rows={3}
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder={t('detail.commentPlaceholder')}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', marginBottom: '8px' }}
            />
            <button
              onClick={() => run(() => addPunchComment({ punchId: punch.id, comment: comment.trim(), projectId, tagId }), () => setComment(''))}
              disabled={isPending || !comment.trim()}
              style={{ ...touch, border: 'none', background: comment.trim() ? 'var(--primary-500)' : 'var(--gray-100)', color: comment.trim() ? '#fff' : 'var(--gray-400)', cursor: comment.trim() ? 'pointer' : 'default' }}
            >
              {t('detail.addComment')}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
