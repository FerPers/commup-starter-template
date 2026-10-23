'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { assignProjectCapacity, revokeProjectCapacity } from '@/app/actions/capacities'
import { CAPACITIES, CAPACITY_FALLBACK_ROLES, capacityIneligible, type Capacity } from '@/lib/constants/capacities'
import { useLocalTime } from '@/lib/use-local-time'
import { Alert, Chip, btn, card, input, small } from '../daily/daily-ui'

// Firmantes designados del proyecto (S14, D14). Por capacidad: si hay designados, firman solo ellos (cualquier
// rol, p. ej. un supervisor de la operadora con rol inspector); si no hay, rige el rol de respaldo y se avisa.

export type Designation = {
  id: string; userId: string; capacity: string; company: string | null; note: string | null
  assignedBy: string; assignedAt: string; revokedBy: string | null; revokedAt: string | null; revokeReason: string | null
  member: boolean
}
export type MemberOption = { userId: string; role: string; name: string; company: string | null; companyKind: string | null }

export default function SignatoriesView({ project, designations, members, names, canEdit }: {
  project: { id: string; code: string; name: string }
  designations: Designation[]
  members: MemberOption[]
  names: Record<string, string>
  canEdit: boolean
}) {
  const t = useTranslations('Signatories')
  const tr = useTranslations('Topbar')
  const router = useRouter()
  const localTime = useLocalTime()
  const [isPending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [pick, setPick] = useState<Record<string, string>>({})
  const [revokeFor, setRevokeFor] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  const active = designations.filter(d => !d.revokedAt)
  const history = designations.filter(d => d.revokedAt)
  const who = (id: string | null) => (id ? names[id] : undefined) ?? '—'
  const when = (iso: string | null) => (iso ? localTime(iso) : '')
  const roleLabel = (r: string) => (tr.has(`role.${r}`) ? tr(`role.${r}`) : r)

  function run(fn: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null)
    start(async () => {
      const res = await fn()
      if (res.error) { setError(res.error); return }
      after?.()
      router.refresh()
    })
  }

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('title')}</h1>
        <p style={{ ...small, margin: '4px 0 0' }}>{project.code} · {project.name} — {t('subtitle')}</p>
      </div>
      <p style={{ ...small, margin: 0 }}>{t('help')}</p>
      {error && <Alert kind="error">{error}</Alert>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        {CAPACITIES.map(cap => {
          const list = active.filter(d => d.capacity === cap && d.member)
          const designatedIds = new Set(list.map(d => d.userId))
          const candidates = members.filter(m => !designatedIds.has(m.userId) && !capacityIneligible(cap, { role: m.role, companyKind: m.companyKind }))
          return (
            <section key={cap} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }} aria-labelledby={`cap-${cap}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h2 id={`cap-${cap}`} style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>{t(`cap.${cap}`)}</h2>
                {list.length > 0
                  ? <Chip tone="green">{t('designatedN', { n: list.length })}</Chip>
                  : <Chip tone="amber">{t('none')}</Chip>}
              </div>
              <p style={{ ...small, margin: 0 }}>{t(`capHelp.${cap}`)}</p>
              {list.length === 0 && (
                <p style={{ ...small, margin: 0, color: 'var(--warning-700)' }}>
                  {t('fallback', { roles: CAPACITY_FALLBACK_ROLES[cap].map(roleLabel).join(', ') })}
                </p>
              )}
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {list.map(d => {
                  const m = members.find(x => x.userId === d.userId)
                  return (
                    <li key={d.id} style={{ borderTop: '1px solid var(--border)', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 'var(--text-sm)' }}>
                        <strong style={{ color: 'var(--text-strong)' }}>{who(d.userId)}</strong>
                        {m && <Chip tone="muted">{roleLabel(m.role)}</Chip>}
                        {(d.company ?? m?.company) && <span style={small}>{d.company ?? m?.company}</span>}
                        <span style={{ flex: 1 }} />
                        {canEdit && revokeFor !== d.id && (
                          <button type="button" style={{ ...btn('outline'), padding: '3px 10px' }} disabled={isPending} onClick={() => { setRevokeFor(d.id); setReason('') }}>{t('revoke')}</button>
                        )}
                      </div>
                      <span style={{ ...small, fontSize: 'var(--text-xs)' }}>{t('assignedBy', { who: who(d.assignedBy), when: when(d.assignedAt) })}{d.note ? ` — ${d.note}` : ''}</span>
                      {revokeFor === d.id && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <input style={{ ...input, flex: 1, minWidth: 160 }} value={reason} aria-label={t('revokeReason')} placeholder={t('revokeReason')} onChange={e => setReason(e.target.value)} />
                          <button type="button" style={btn('danger', isPending || reason.trim().length < 3)} disabled={isPending || reason.trim().length < 3}
                            onClick={() => run(() => revokeProjectCapacity({ projectId: project.id, id: d.id, reason }), () => setRevokeFor(null))}>{t('revokeConfirm')}</button>
                          <button type="button" style={btn('outline')} onClick={() => setRevokeFor(null)}>{t('cancel')}</button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
              {canEdit && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <select style={{ ...input, flex: 1, minWidth: 180 }} aria-label={t('add', { cap: t(`cap.${cap}`) })} value={pick[cap] ?? ''}
                    onChange={e => setPick({ ...pick, [cap]: e.target.value })}>
                    <option value="">{candidates.length ? t('pick') : t('noCandidates')}</option>
                    {candidates.map(m => <option key={m.userId} value={m.userId}>{m.name} · {roleLabel(m.role)}{m.company ? ` · ${m.company}` : ''}</option>)}
                  </select>
                  <button type="button" style={btn('primary', isPending || !pick[cap])} disabled={isPending || !pick[cap]}
                    onClick={() => run(() => assignProjectCapacity({ projectId: project.id, userId: pick[cap], capacity: cap as Capacity }), () => setPick({ ...pick, [cap]: '' }))}>
                    {t('designate')}
                  </button>
                </div>
              )}
              {canEdit && cap === 'client_rep' && <span style={{ ...small, fontSize: 'var(--text-xs)' }}>{t('clientRepRule')}</span>}
            </section>
          )
        })}
      </div>

      {history.length > 0 && (
        <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" style={{ ...btn('outline'), alignSelf: 'flex-start' }} aria-expanded={showHistory} onClick={() => setShowHistory(!showHistory)}>
            {t('history', { n: history.length })}
          </button>
          {showHistory && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {history.map(d => (
                <li key={d.id} style={{ ...small }}>
                  <strong>{who(d.userId)}</strong> · {t(`cap.${d.capacity as Capacity}`)} · {t('revokedBy', { who: who(d.revokedBy), when: when(d.revokedAt), reason: d.revokeReason ?? '' })}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
