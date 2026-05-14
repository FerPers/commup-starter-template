'use client'

import { useMemo, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { inviteUser, updateMemberRole, removeMember } from '@/app/actions/users'

type Member = {
  id: string
  userId: string
  role: string
  joinedAt: string
  fullName: string
  avatarUrl: string | null
  email: string
  lastActive: string | null
}

type PendingInvite = {
  userId: string
  email: string
  invitedAt: string
  role: string | null
}

const ALL_ROLES = ['owner', 'admin', 'architect', 'leader', 'inspector', 'client']

const ROLE_COLORS: Record<string, { color: string; bg: string }> = {
  owner:     { color: '#7c3aed', bg: '#f5f3ff' },
  admin:     { color: '#2563eb', bg: '#eff6ff' },
  architect: { color: '#0891b2', bg: '#ecfeff' },
  leader:    { color: '#059669', bg: '#ecfdf5' },
  inspector: { color: '#d97706', bg: '#fffbeb' },
  client:    { color: 'var(--text-muted)', bg: 'var(--gray-50)' },
}

function RoleBadge({ role, label }: { role: string; label: string }) {
  const m = ROLE_COLORS[role] ?? { color: 'var(--text-muted)', bg: 'var(--gray-50)' }
  return (
    <span style={{
      padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
      background: m.bg, color: m.color, border: `1px solid ${m.color}30`,
    }}>
      {label}
    </span>
  )
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  if (url) return <img src={url} alt={name} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%',
      background: '#3b82f620', border: '1px solid #3b82f630',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '13px', fontWeight: 700, color: '#3b82f6', flexShrink: 0,
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
}: {
  members: Member[]
  pendingInvites: PendingInvite[]
  currentUserId: string
  currentRole: string
}) {
  const t = useTranslations('Users')
  const [isPending, startTransition] = useTransition()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('inspector')
  const [showInvite, setShowInvite] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null)

  const [filterRole, setFilterRole] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'pending'>('all')

  const isAdmin = ['owner', 'admin'].includes(currentRole)

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
      const res = await inviteUser({ email, role: inviteRole })
      if (res.error) { setError(res.error); return }
      setInviteEmail('')
      setShowInvite(false)
      if (res.tempPassword) {
        setTempPassword({ email, password: res.tempPassword })
      } else {
        notify(t('invite.successEmail'))
      }
    })
  }

  async function handleRoleChange(memberId: string, role: string) {
    setError(null)
    startTransition(async () => {
      const res = await updateMemberRole({ memberId, role })
      if (res.error) setError(res.error)
    })
  }

  async function handleRemove(memberId: string, name: string) {
    if (!confirm(t('confirmRemove', { name }))) return
    setError(null)
    startTransition(async () => {
      const res = await removeMember({ memberId })
      if (res.error) setError(res.error)
    })
  }

  const labelStyle = { fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }
  const selectStyle = {
    padding: '7px 10px', border: '1px solid var(--border)',
    borderRadius: '8px', fontSize: '13px', color: 'var(--text-strong)',
    background: 'var(--card-bg)', cursor: 'pointer', minWidth: '140px',
  }

  return (
    <div style={{ padding: '32px' }}>

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
              padding: '9px 18px', background: '#3b82f6', color: '#fff',
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
        <div style={{ marginBottom: '16px', padding: '12px 16px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#dc2626', fontSize: '13px' }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ marginBottom: '16px', padding: '12px 16px', background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: '8px', color: '#059669', fontSize: '13px' }}>
          {success}
        </div>
      )}

      {/* Temp password box */}
      {tempPassword && (
        <div style={{
          marginBottom: '16px', padding: '16px 20px', background: '#fffbeb',
          border: '1px solid #fcd34d', borderRadius: '10px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
            <div>
              <p style={{ margin: '0 0 6px', fontSize: '13px', fontWeight: 600, color: '#92400e' }}>
                {t('tempPassword.title')}
              </p>
              <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#78350f' }}>
                {t('tempPassword.emailLabel')} <strong>{tempPassword.email}</strong>
              </p>
              <p style={{ margin: 0, fontSize: '13px', color: '#78350f' }}>
                {t('tempPassword.passwordLabel')} <strong style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}>{tempPassword.password}</strong>
              </p>
              <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#a16207' }}>
                {t('tempPassword.hint')}
              </p>
            </div>
            <button
              onClick={() => setTempPassword(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a16207', fontSize: '18px', lineHeight: 1, padding: '2px' }}
              aria-label={t('tempPassword.close')}
            >×</button>
          </div>
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
              <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                {t('invite.email')}
              </label>
              <input
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
              <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                {t('invite.role')}
              </label>
              <select
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
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleInvite}
                disabled={isPending || !inviteEmail.trim()}
                style={{
                  padding: '9px 18px', background: '#3b82f6', color: '#fff',
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
          <label style={labelStyle}>{t('filters.role')}</label>
          <select
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
          <label style={labelStyle}>{t('filters.status')}</label>
          <select
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
          background: '#fffbeb',
          border: '1px solid #fcd34d',
          borderRadius: '10px',
        }}>
          <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 600, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {t('pending.title', { count: filteredPending.length })}
          </p>
          <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#78350f' }}>
            {t('pending.desc')}
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filteredPending.map(p => (
              <li key={p.userId} style={{ fontSize: 13, color: '#78350f', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <span>
                  <strong>{p.email}</strong>
                  {p.role && (
                    <span style={{ marginLeft: 8 }}>
                      <RoleBadge role={p.role} label={roleLabels[p.role] ?? p.role} />
                    </span>
                  )}
                </span>
                <span style={{ color: '#a16207', fontSize: 12 }}>
                  {t('pending.invitedOn', { date: formatJoinedDate(p.invitedAt) })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Members table */}
      {filterStatus !== 'pending' && (
        <div style={{ background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)', overflow: 'hidden' }}>
          {filteredMembers.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--gray-400)', fontSize: '14px' }}>
              {members.length === 0 ? t('table.empty') : t('table.emptyFiltered')}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid #f1f5f9' }}>
                  {[
                    t('table.colUser'),
                    t('table.colEmail'),
                    t('table.colRole'),
                    t('table.colSince'),
                    t('table.colLastActive'),
                    '',
                  ].map((h, i) => (
                    <th key={i} style={{
                      padding: '12px 20px', textAlign: 'left',
                      fontSize: '11px', fontWeight: 600, color: 'var(--gray-400)',
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
                      borderBottom: i < filteredMembers.length - 1 ? '1px solid #f1f5f9' : 'none',
                      opacity: isPending ? 0.6 : 1,
                    }}>
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <Avatar name={m.fullName} url={m.avatarUrl} />
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-strong)' }}>
                              {m.fullName}
                              {isSelf && (
                                <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--gray-400)', fontWeight: 400 }}>
                                  {t('table.self')}
                                </span>
                              )}
                            </div>
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
                            onChange={e => handleRoleChange(m.id, e.target.value)}
                            disabled={isPending}
                            style={{
                              padding: '4px 8px', border: '1px solid var(--border)',
                              borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                              color: ROLE_COLORS[m.role]?.color ?? 'var(--text-muted)',
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
                      <td style={{ padding: '14px 20px', fontSize: '13px', color: 'var(--gray-400)' }}>
                        {formatJoinedDate(m.joinedAt)}
                      </td>
                      <td style={{ padding: '14px 20px', fontSize: '13px', color: 'var(--gray-400)' }} title={m.lastActive ?? ''}>
                        {formatLastActive(m.lastActive, t)}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        {isAdmin && !isSelf && (!isOwner || currentRole === 'owner') && (
                          <button
                            onClick={() => handleRemove(m.id, m.fullName)}
                            disabled={isPending}
                            style={{
                              padding: '6px 12px', background: 'transparent',
                              border: '1px solid #fca5a5', borderRadius: '6px',
                              fontSize: '12px', color: '#ef4444', cursor: 'pointer',
                            }}
                          >
                            {t('table.remove')}
                          </button>
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
          padding: '48px', textAlign: 'center', color: 'var(--gray-400)', fontSize: '14px',
          background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)',
        }}>
          {t('pending.empty')}
        </div>
      )}

      {/* Role legend */}
      <div style={{ marginTop: '20px', padding: '16px 20px', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)' }}>
        <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>
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
