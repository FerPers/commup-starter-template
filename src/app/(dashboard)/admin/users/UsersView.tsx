'use client'

import type { OrgMemberRole } from '@/types/database'
import { useId, useMemo, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { inviteUser, updateMemberRole, removeMember, setMemberAccess, sendPasswordReset, getMemberRemovalContext, type MemberRemovalContext } from '@/app/actions/users'
import { setMemberCompany } from '@/app/actions/documents'
import { ROLE_TIERS } from '@/lib/constants/roles'
import { useAskDialog } from '@/components/ui/AskDialog'
import { DialogSurface } from '@/components/ui/dialog-a11y'
import { alpha, ink } from '@/lib/theme'
import { MemberActionsMenu } from './MemberActionsMenu'

type Member = {
  id: string
  userId: string
  role: string
  joinedAt: string
  fullName: string
  avatarUrl: string | null
  email: string
  lastActive: string | null
  companyId: string | null
  /** S15 (I-21): invited · active · suspended, y vencimiento del acceso. */
  status: string
  accessExpiresAt: string | null
  suspendReason: string | null
}

type PendingInvite = {
  userId: string
  email: string
  invitedAt: string
  role: string | null
}

const ALL_ROLES = ['owner', 'admin', 'architect', 'leader', 'inspector', 'client']

const ROLE_COLORS: Record<string, { color: string; bg: string }> = {
  owner:     { color: 'var(--violet-700)',  bg: 'var(--violet-50)' },
  admin:     { color: 'var(--primary-700)', bg: 'var(--primary-50)' },
  architect: { color: 'var(--cyan-700)',    bg: 'var(--cyan-50)' },
  leader:    { color: 'var(--success-700)', bg: 'var(--success-50)' },
  inspector: { color: 'var(--warning-700)', bg: 'var(--warning-50)' },
  client:    { color: 'var(--text-muted)',  bg: 'var(--gray-50)' },
}

function RoleBadge({ role, label }: { role: string; label: string }) {
  const m = ROLE_COLORS[role] ?? { color: 'var(--text-muted)', bg: 'var(--gray-50)' }
  return (
    <span style={{
      padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
      background: m.bg, color: ink(m.color), border: `1px solid ${alpha(m.color, 19)}`,
    }}>
      {label}
    </span>
  )
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  // eslint-disable-next-line @next/next/no-img-element -- Avatar from external/Supabase URL, no optimization benefit on Workers
  if (url) return <img src={url} alt={name} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%',
      background: 'var(--primary-100)', border: '1px solid var(--primary-200)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '13px', fontWeight: 700, color: 'var(--primary-700)', flexShrink: 0,
    }}>
      {initials || '?'}
    </div>
  )
}

function formatJoinedDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatLastActive(
  iso: string | null,
  t: (key: string, vals?: Record<string, string | number>) => string,
): string {
  if (!iso) return t('table.lastActiveNever')
  const then = new Date(iso)
  const now  = new Date()
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dayDiff = Math.floor((startOfDay(now) - startOfDay(then)) / 86400000)
  if (dayDiff <= 0) return t('table.lastActiveToday')
  if (dayDiff === 1) return t('table.lastActiveYesterday')
  if (dayDiff < 7)   return t('table.lastActiveDaysAgo', { days: dayDiff })
  return formatJoinedDate(iso)
}

export default function UsersView({
  members,
  pendingInvites,
  currentUserId,
  currentRole,
  companies = [],
}: {
  members: Member[]
  pendingInvites: PendingInvite[]
  currentUserId: string
  currentRole: string
  /** Fase 8: empresas de la org (la firma muestra «nombre · empresa»). */
  companies?: { id: string; name: string }[]
}) {
  const t = useTranslations('Users')
  const { dialog, ask, confirm } = useAskDialog() // G-08: diálogo propio
  const removeTitleId = useId()
  const uid = useId()
  const [isPending, startTransition] = useTransition()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('inspector')
  const [inviteExpires, setInviteExpires] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [filterRole, setFilterRole] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'pending'>('all')

  const isAdmin = ROLE_TIERS.admin.includes(currentRole)

  const roleLabels: Record<string, string> = {
    owner:     t('roles.owner'),
    admin:     t('roles.admin'),
    architect: t('roles.architect'),
    leader:    t('roles.leader'),
    inspector: t('roles.inspector'),
    client:    t('roles.client'),
  }

  const roleDesc: Record<string, string> = {
    owner:     t('roleDesc.owner'),
    admin:     t('roleDesc.admin'),
    architect: t('roleDesc.architect'),
    leader:    t('roleDesc.leader'),
    inspector: t('roleDesc.inspector'),
    client:    t('roleDesc.client'),
  }

  const filteredMembers = useMemo(() => {
    if (filterStatus === 'pending') return []
    return members.filter(m => filterRole === 'all' || m.role === filterRole)
  }, [members, filterRole, filterStatus])

  const filteredPending = useMemo(() => {
    if (filterStatus === 'active') return []
    return pendingInvites.filter(p => filterRole === 'all' || p.role === filterRole)
  }, [pendingInvites, filterRole, filterStatus])

  function notify(msg: string) {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 3000)
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return
    setError(null)
    startTransition(async () => {
      const email = inviteEmail.trim()
      const res = await inviteUser({ email, role: inviteRole, expiresAt: inviteExpires ? `${inviteExpires}T23:59:59` : null })
      if (res.error) { setError(res.error); return }
      setInviteEmail('')
      setInviteExpires('')
      setShowInvite(false)
      notify(t('invite.successEmail'))
    })
  }

  async function handleCompanyChange(userId: string, companyId: string) {
    setError(null)
    startTransition(async () => {
      const res = await setMemberCompany({ userId, companyId: companyId || null })
      if (res.error) setError(res.error)
    })
  }

  // S15 (I-21): suspender (con motivo), reactivar y fijar o quitar el vencimiento del acceso.
  async function handleAccess(m: Member, next: { status: 'active' | 'suspended'; expiresAt?: string | null }) {
    let reason: string | undefined
    if (next.status === 'suspended') {
      reason = (await ask({
        title: t('access.suspend'), confirmLabel: t('access.suspend'), danger: true,
        input: { label: t('access.suspendPrompt', { name: m.fullName }), minLength: 3, multiline: true },
      })) ?? undefined
      if (!reason || reason.trim().length < 3) return
    }
    setError(null)
    startTransition(async () => {
      const res = await setMemberAccess({ memberId: m.id, status: next.status, expiresAt: next.expiresAt ?? null, reason })
      if (res.error) { setError(res.error); return }
      notify(t('access.saved'))
    })
  }

  // El admin no ve ni fija la contraseña: se envía el correo de restablecimiento a la persona.
  async function handleSendReset(m: Member) {
    if (!(await confirm({ title: t('menu.sendReset'), message: t('menu.sendResetConfirm', { name: m.fullName, email: m.email }), confirmLabel: t('menu.sendResetButton') }))) return
    setError(null)
    startTransition(async () => {
      const res = await sendPasswordReset({ memberId: m.id })
      if (res.error) { setError(res.error); return }
      notify(res.message ?? t('menu.sendResetDone'))
    })
  }

  async function handleRoleChange(memberId: string, role: OrgMemberRole) {
    setError(null)
    startTransition(async () => {
      const res = await updateMemberRole({ memberId, role })
      if (res.error) setError(res.error)
    })
  }

  // Remove flow: open a dialog, load what the member leaves behind, confirm.
  const [removeTarget, setRemoveTarget] = useState<{ memberId: string; name: string } | null>(null)
  const [removeCtx, setRemoveCtx] = useState<MemberRemovalContext | null>(null)

  function openRemove(memberId: string, name: string) {
    setError(null)
    setRemoveCtx(null)
    setRemoveTarget({ memberId, name })
    startTransition(async () => {
      const res = await getMemberRemovalContext({ memberId })
      if (res.error) { setError(res.error); setRemoveTarget(null); return }
      setRemoveCtx(res.data ?? null)
    })
  }

  function confirmRemove() {
    if (!removeTarget) return
    const { memberId } = removeTarget
    startTransition(async () => {
      const res = await removeMember({ memberId })
      if (res.error) setError(res.error)
      setRemoveTarget(null)
      setRemoveCtx(null)
    })
  }

  const labelStyle = { fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }
  const selectStyle = {
    padding: '7px 10px', border: '1px solid var(--border)',
    borderRadius: '8px', fontSize: '13px', color: 'var(--text-strong)',
    background: 'var(--card-bg)', cursor: 'pointer', minWidth: '140px',
  }

  return (
    <div style={{ padding: '32px' }}>
      {dialog}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-strong)', letterSpacing: '-0.5px', margin: 0 }}>
            {t('title')}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '4px 0 0' }}>
            {t('subtitle', { count: members.length })}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setShowInvite(true); setError(null) }}
            style={{
              padding: '9px 18px', background: 'var(--primary-600)', color: '#fff',
              border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {t('inviteBtn')}
          </button>
        )}
      </div>

      {/* Feedback */}
      {error && (
        <div style={{ marginBottom: '16px', padding: '12px 16px', background: 'var(--danger-100)', border: '1px solid var(--danger-300)', borderRadius: '8px', color: 'var(--danger-700)', fontSize: '13px' }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ marginBottom: '16px', padding: '12px 16px', background: 'var(--success-50)', border: '1px solid var(--success-300)', borderRadius: '8px', color: 'var(--success-700)', fontSize: '13px' }}>
          {success}
        </div>
      )}

      {/* Invite form */}
      {showInvite && (
        <div style={{
          marginBottom: '24px', padding: '20px 24px', background: 'var(--card-bg)',
          borderRadius: '12px', border: '1px solid var(--border)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        }}>
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', margin: '0 0 16px' }}>
            {t('invite.title')}
          </p>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 260px' }}>
              <label htmlFor={`${uid}-email`} style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                {t('invite.email')}
              </label>
              <input
                id={`${uid}-email`}
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder={t('invite.emailPh')}
                onKeyDown={e => e.key === 'Enter' && handleInvite()}
                style={{
                  width: '100%', padding: '9px 12px', border: '1px solid var(--border)',
                  borderRadius: '8px', fontSize: '14px', color: 'var(--text-strong)',
                  background: 'var(--card-bg)', boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ flex: '0 1 160px' }}>
              <label htmlFor={`${uid}-role`} style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                {t('invite.role')}
              </label>
              <select
                id={`${uid}-role`}
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value)}
                style={{
                  width: '100%', padding: '9px 12px', border: '1px solid var(--border)',
                  borderRadius: '8px', fontSize: '14px', color: 'var(--text-strong)',
                  background: 'var(--card-bg)', cursor: 'pointer',
                }}
              >
                {ALL_ROLES
                  .filter(r => r !== 'owner' || currentRole === 'owner')
                  .map(r => (
                    <option key={r} value={r}>{roleLabels[r] ?? r}</option>
                  ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${uid}-expires`} style={labelStyle}>{t('access.expiresLabel')}</label>
              <input id={`${uid}-expires`} type="date" value={inviteExpires} onChange={e => setInviteExpires(e.target.value)}
                style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px', background: 'var(--card-bg)', color: 'var(--text-strong)' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleInvite}
                disabled={isPending || !inviteEmail.trim()}
                style={{
                  padding: '9px 18px', background: 'var(--primary-600)', color: '#fff',
                  border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                  cursor: isPending ? 'wait' : 'pointer', opacity: (!inviteEmail.trim() || isPending) ? 0.6 : 1,
                }}
              >
                {isPending ? t('invite.sending') : t('invite.send')}
              </button>
              <button
                onClick={() => { setShowInvite(false); setError(null) }}
                style={{
                  padding: '9px 14px', background: 'var(--card-bg)', border: '1px solid var(--border)',
                  borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer',
                }}
              >
                {t('invite.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div>
          <label htmlFor={`${uid}-filterRole`} style={labelStyle}>{t('filters.role')}</label>
          <select
            id={`${uid}-filterRole`}
            value={filterRole}
            onChange={e => setFilterRole(e.target.value)}
            style={selectStyle}
          >
            <option value="all">{t('filters.all')}</option>
            {ALL_ROLES.map(r => (
              <option key={r} value={r}>{roleLabels[r] ?? r}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${uid}-filterStatus`} style={labelStyle}>{t('filters.status')}</label>
          <select
            id={`${uid}-filterStatus`}
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as 'all' | 'active' | 'pending')}
            style={selectStyle}
          >
            <option value="all">{t('filters.all')}</option>
            <option value="active">{t('filters.active')}</option>
            <option value="pending">{t('filters.pending')}</option>
          </select>
        </div>
      </div>

      {/* Pending invites */}
      {filteredPending.length > 0 && (
        <div style={{
          marginBottom: '20px',
          padding: '14px 18px',
          background: 'var(--warning-50)',
          border: '1px solid var(--warning-300)',
          borderRadius: '10px',
        }}>
          <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 600, color: 'var(--warning-800)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {t('pending.title', { count: filteredPending.length })}
          </p>
          <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--warning-900)' }}>
            {t('pending.desc')}
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filteredPending.map(p => (
              <li key={p.userId} style={{ fontSize: 13, color: 'var(--warning-900)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <span>
                  <strong>{p.email}</strong>
                  {p.role && (
                    <span style={{ marginLeft: 8 }}>
                      <RoleBadge role={p.role} label={roleLabels[p.role] ?? p.role} />
                    </span>
                  )}
                </span>
                <span style={{ color: 'var(--warning-700)', fontSize: 12 }}>
                  {t('pending.invitedOn', { date: formatJoinedDate(p.invitedAt) })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Members table */}
      {filterStatus !== 'pending' && (
        <div style={{ background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)', overflowX: 'auto' }}>
          {filteredMembers.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
              {members.length === 0 ? t('table.empty') : t('table.emptyFiltered')}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)' }}>
                  {[
                    t('table.colUser'),
                    t('table.colEmail'),
                    t('table.colRole'),
                    t('table.colCompany'),
                    t('table.colSince'),
                    t('table.colLastActive'),
                    '',
                  ].map((h, i) => (
                    <th key={i} style={{
                      padding: '12px 20px', textAlign: 'left',
                      fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((m, i) => {
                  const isSelf  = m.userId === currentUserId
                  const isOwner = m.role === 'owner'
                  const canEdit = isAdmin && (!isOwner || currentRole === 'owner')
                  return (
                    <tr key={m.id} style={{
                      borderBottom: i < filteredMembers.length - 1 ? '1px solid var(--gray-100)' : 'none',
                      opacity: isPending ? 0.6 : 1,
                    }}>
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <Avatar name={m.fullName} url={m.avatarUrl} />
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-strong)' }}>
                              {m.fullName}
                              {isSelf && (
                                <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 400 }}>
                                  {t('table.self')}
                                </span>
                              )}
                            </div>
                            {(() => {
                              const expired = !!m.accessExpiresAt && new Date(m.accessExpiresAt) <= new Date()
                              const label = m.status === 'invited' ? t('access.invited')
                                : m.status === 'suspended' ? t('access.suspended', { reason: m.suspendReason ?? '' })
                                  : expired ? t('access.expired')
                                    : m.accessExpiresAt ? t('access.until', { date: m.accessExpiresAt.slice(0, 10) }) : null
                              if (!label) return null
                              const bad = m.status === 'suspended' || expired
                              return <div suppressHydrationWarning style={{ fontSize: '12px', marginTop: 2, color: bad ? 'var(--danger-700)' : m.status === 'invited' ? 'var(--primary-700)' : 'var(--text-muted)' }}>{label}</div>
                            })()}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 20px', fontSize: '13px', color: 'var(--text-muted)' }}>
                        {m.email}
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        {canEdit && !isSelf ? (
                          <select
                            value={m.role}
                            onChange={e => handleRoleChange(m.id, e.target.value as OrgMemberRole)}
                            disabled={isPending}
                            style={{
                              padding: '4px 8px', border: '1px solid var(--border)',
                              borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                              color: ink(ROLE_COLORS[m.role]?.color ?? 'var(--text-muted)'),
                              background: ROLE_COLORS[m.role]?.bg ?? 'var(--gray-50)',
                              cursor: 'pointer',
                            }}
                          >
                            {ALL_ROLES
                              .filter(r => r !== 'owner' || currentRole === 'owner')
                              .map(r => (
                                <option key={r} value={r}>{roleLabels[r] ?? r}</option>
                              ))}
                          </select>
                        ) : (
                          <RoleBadge role={m.role} label={roleLabels[m.role] ?? m.role} />
                        )}
                      </td>
                      <td style={{ padding: '14px 20px', fontSize: '13px', color: 'var(--text-muted)' }}>
                        {isAdmin ? (
                          <select
                            value={m.companyId ?? ''}
                            aria-label={t('table.colCompany')}
                            onChange={e => handleCompanyChange(m.userId, e.target.value)}
                            disabled={isPending}
                            style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', maxWidth: 180, background: 'var(--card-bg)', color: 'var(--text-strong)' }}
                          >
                            <option value="">{t('table.noCompany')}</option>
                            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        ) : (companies.find(c => c.id === m.companyId)?.name ?? '—')}
                      </td>
                      <td style={{ padding: '14px 20px', fontSize: '13px', color: 'var(--text-muted)' }}>
                        {formatJoinedDate(m.joinedAt)}
                      </td>
                      <td style={{ padding: '14px 20px', fontSize: '13px', color: 'var(--text-muted)' }} title={m.lastActive ?? ''}>
                        {formatLastActive(m.lastActive, t)}
                      </td>
                      <td style={{ padding: '14px 12px', textAlign: 'right' }}>
                        {isAdmin && !isSelf && (!isOwner || currentRole === 'owner') && (
                          <MemberActionsMenu
                            name={m.fullName}
                            disabled={isPending}
                            accessExpiresAt={m.accessExpiresAt}
                            showAccess={m.status !== 'invited'}
                            suspended={m.status === 'suspended'}
                            canSendReset={m.status === 'active'}
                            onExpiresChange={date => handleAccess(m, { status: m.status === 'suspended' ? 'suspended' : 'active', expiresAt: date ? `${date}T23:59:59` : null })}
                            onToggleSuspend={() => handleAccess(m, { status: m.status === 'suspended' ? 'active' : 'suspended', expiresAt: m.accessExpiresAt })}
                            onSendReset={() => handleSendReset(m)}
                            onRemove={() => openRemove(m.id, m.fullName)}
                          />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Empty pending state */}
      {filterStatus === 'pending' && filteredPending.length === 0 && (
        <div style={{
          padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px',
          background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)',
        }}>
          {t('pending.empty')}
        </div>
      )}

      {/* Remove member dialog */}
      {removeTarget && (
        <div
          role="presentation"
          onClick={e => { if (e.target === e.currentTarget && !isPending) { setRemoveTarget(null); setRemoveCtx(null) } }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 60,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <DialogSurface
            onClose={isPending ? undefined : () => { setRemoveTarget(null); setRemoveCtx(null) }}
            labelledBy={removeTitleId}
            style={{
              width: '100%', maxWidth: 460, background: 'var(--card-bg)', borderRadius: 14,
              border: '1px solid var(--border)', padding: 22, boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
            }}>
            <h3 id={removeTitleId} style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: 'var(--text-strong)' }}>
              {t('removeDialog.title', { name: removeTarget.name })}
            </h3>

            {!removeCtx ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{t('removeDialog.loading')}</p>
            ) : (
              <>
                <dl style={{ margin: '0 0 14px', display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 6, columnGap: 16, fontSize: 13 }}>
                  {([
                    ['openPunches', removeCtx.openPunches, true],
                    ['openItrs', removeCtx.openItrAssignments, true],
                    ['signatures', removeCtx.signatures, false],
                    ['punchesRaised', removeCtx.punchesRaised, false],
                  ] as const).map(([key, n, isOpenWork]) => (
                    <div key={key} style={{ display: 'contents' }}>
                      <dt style={{ color: 'var(--text-muted)' }}>{t(`removeDialog.${key}`)}</dt>
                      <dd style={{
                        margin: 0, fontWeight: 700, textAlign: 'right',
                        color: isOpenWork && n > 0 ? 'var(--warning-700)' : 'var(--text-strong)',
                      }}>{n}</dd>
                    </div>
                  ))}
                </dl>

                {(removeCtx.openPunches > 0 || removeCtx.openItrAssignments > 0) && (
                  <p style={{
                    margin: '0 0 10px', padding: '10px 12px', borderRadius: 8, fontSize: 12.5, lineHeight: 1.45,
                    background: 'var(--warning-50)', border: '1px solid var(--warning-300)', color: 'var(--warning-900)',
                  }}>
                    {t('removeDialog.warnOpen')}
                  </p>
                )}
                <p style={{ margin: '0 0 18px', fontSize: 12.5, lineHeight: 1.45, color: 'var(--text-muted)' }}>
                  {t('removeDialog.keepsHistory')}
                </p>
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => { setRemoveTarget(null); setRemoveCtx(null) }}
                disabled={isPending}
                style={{
                  padding: '8px 14px', background: 'transparent', border: '1px solid var(--border)',
                  borderRadius: 8, fontSize: 13, color: 'var(--text-strong)', cursor: 'pointer',
                }}
              >
                {t('removeDialog.cancel')}
              </button>
              <button
                onClick={confirmRemove}
                disabled={isPending || !removeCtx}
                style={{
                  padding: '8px 14px', background: 'var(--danger-500)', border: '1px solid var(--danger-500)',
                  borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff',
                  cursor: isPending || !removeCtx ? 'wait' : 'pointer', opacity: isPending || !removeCtx ? 0.6 : 1,
                }}
              >
                {t('removeDialog.confirm')}
              </button>
            </div>
          </DialogSurface>
        </div>
      )}

      {/* Role legend */}
      <div style={{ marginTop: '20px', padding: '16px 20px', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)' }}>
        <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>
          {t('legend')}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
          {ALL_ROLES.map(role => (
            <div key={role} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <RoleBadge role={role} label={roleLabels[role] ?? role} />
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{roleDesc[role]}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
