'use client'

import { useState, useTransition } from 'react'
import { inviteUser, updateMemberRole, removeMember } from '@/app/actions/users'

type Member = {
  id: string
  userId: string
  role: string
  joinedAt: string
  fullName: string
  avatarUrl: string | null
  email: string
}

const ALL_ROLES = ['owner', 'admin', 'architect', 'leader', 'inspector', 'client']

const ROLE_META: Record<string, { label: string; color: string; bg: string }> = {
  owner:     { label: 'Owner',      color: '#7c3aed', bg: '#f5f3ff' },
  admin:     { label: 'Admin',      color: '#2563eb', bg: '#eff6ff' },
  architect: { label: 'Architect',  color: '#0891b2', bg: '#ecfeff' },
  leader:    { label: 'Leader',     color: '#059669', bg: '#ecfdf5' },
  inspector: { label: 'Inspector',  color: '#d97706', bg: '#fffbeb' },
  client:    { label: 'Client',     color: '#64748b', bg: '#f8fafc' },
}

function RoleBadge({ role }: { role: string }) {
  const m = ROLE_META[role] ?? { label: role, color: '#64748b', bg: '#f8fafc' }
  return (
    <span style={{
      padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
      background: m.bg, color: m.color, border: `1px solid ${m.color}30`,
    }}>
      {m.label}
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

export default function UsersView({
  members,
  currentUserId,
  currentRole,
}: {
  members: Member[]
  currentUserId: string
  currentRole: string
}) {
  const [isPending, startTransition] = useTransition()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('inspector')
  const [showInvite, setShowInvite] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null)

  const isAdmin = ['owner', 'admin'].includes(currentRole)

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
        notify('Invitación enviada por email')
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
    if (!confirm(`¿Remover a ${name} de la organización?`)) return
    setError(null)
    startTransition(async () => {
      const res = await removeMember({ memberId })
      if (res.error) setError(res.error)
    })
  }

  return (
    <div style={{ padding: '32px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px', margin: 0 }}>
            Usuarios
          </h1>
          <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0' }}>
            {members.length} miembro{members.length !== 1 ? 's' : ''} en la organización
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setShowInvite(true); setError(null) }}
            style={{
              padding: '9px 18px', background: '#3b82f6', color: 'white',
              border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            + Invitar usuario
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

      {/* Temp password box (email provider not configured) */}
      {tempPassword && (
        <div style={{
          marginBottom: '16px', padding: '16px 20px', background: '#fffbeb',
          border: '1px solid #fcd34d', borderRadius: '10px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
            <div>
              <p style={{ margin: '0 0 6px', fontSize: '13px', fontWeight: 600, color: '#92400e' }}>
                Usuario creado — comparte estas credenciales manualmente
              </p>
              <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#78350f' }}>
                Email: <strong>{tempPassword.email}</strong>
              </p>
              <p style={{ margin: 0, fontSize: '13px', color: '#78350f' }}>
                Contraseña temporal: <strong style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}>{tempPassword.password}</strong>
              </p>
              <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#a16207' }}>
                El usuario puede cambiar su contraseña desde su perfil después de ingresar.
              </p>
            </div>
            <button
              onClick={() => setTempPassword(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a16207', fontSize: '18px', lineHeight: 1, padding: '2px' }}
              aria-label="Cerrar"
            >×</button>
          </div>
        </div>
      )}

      {/* Invite form */}
      {showInvite && (
        <div style={{
          marginBottom: '24px', padding: '20px 24px', background: 'white',
          borderRadius: '12px', border: '1px solid #e2e8f0',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        }}>
          <p style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', margin: '0 0 16px' }}>
            Invitar nuevo usuario
          </p>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 260px' }}>
              <label style={{ fontSize: '12px', fontWeight: 500, color: '#64748b', display: 'block', marginBottom: '6px' }}>
                Email
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="usuario@empresa.com"
                onKeyDown={e => e.key === 'Enter' && handleInvite()}
                style={{
                  width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0',
                  borderRadius: '8px', fontSize: '14px', color: '#0f172a',
                  background: 'white', boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ flex: '0 1 160px' }}>
              <label style={{ fontSize: '12px', fontWeight: 500, color: '#64748b', display: 'block', marginBottom: '6px' }}>
                Rol
              </label>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value)}
                style={{
                  width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0',
                  borderRadius: '8px', fontSize: '14px', color: '#0f172a',
                  background: 'white', cursor: 'pointer',
                }}
              >
                {ALL_ROLES.filter(r => r !== 'owner').map(r => (
                  <option key={r} value={r}>{ROLE_META[r]?.label ?? r}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleInvite}
                disabled={isPending || !inviteEmail.trim()}
                style={{
                  padding: '9px 18px', background: '#3b82f6', color: 'white',
                  border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                  cursor: isPending ? 'wait' : 'pointer', opacity: (!inviteEmail.trim() || isPending) ? 0.6 : 1,
                }}
              >
                {isPending ? 'Enviando…' : 'Enviar invitación'}
              </button>
              <button
                onClick={() => { setShowInvite(false); setError(null) }}
                style={{
                  padding: '9px 14px', background: 'white', border: '1px solid #e2e8f0',
                  borderRadius: '8px', fontSize: '13px', color: '#64748b', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Members table */}
      <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {members.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
            No hay miembros
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                {['Usuario', 'Email', 'Rol', 'Miembro desde', ''].map(h => (
                  <th key={h} style={{
                    padding: '12px 20px', textAlign: 'left',
                    fontSize: '11px', fontWeight: 600, color: '#94a3b8',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => {
                const isSelf = m.userId === currentUserId
                const isOwner = m.role === 'owner'
                const canEdit = isAdmin && (!isOwner || currentRole === 'owner')
                return (
                  <tr key={m.id} style={{
                    borderBottom: i < members.length - 1 ? '1px solid #f1f5f9' : 'none',
                    opacity: isPending ? 0.6 : 1,
                  }}>
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Avatar name={m.fullName} url={m.avatarUrl} />
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 500, color: '#0f172a' }}>
                            {m.fullName}
                            {isSelf && (
                              <span style={{ marginLeft: '8px', fontSize: '11px', color: '#94a3b8', fontWeight: 400 }}>
                                (tú)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: '13px', color: '#64748b' }}>
                      {m.email}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      {canEdit && !isSelf ? (
                        <select
                          value={m.role}
                          onChange={e => handleRoleChange(m.id, e.target.value)}
                          disabled={isPending}
                          style={{
                            padding: '4px 8px', border: '1px solid #e2e8f0',
                            borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                            color: ROLE_META[m.role]?.color ?? '#64748b',
                            background: ROLE_META[m.role]?.bg ?? '#f8fafc',
                            cursor: 'pointer',
                          }}
                        >
                          {ALL_ROLES.map(r => (
                            <option key={r} value={r}>{ROLE_META[r]?.label ?? r}</option>
                          ))}
                        </select>
                      ) : (
                        <RoleBadge role={m.role} />
                      )}
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: '13px', color: '#94a3b8' }}>
                      {new Date(m.joinedAt).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                      {isAdmin && !isSelf && !isOwner && (
                        <button
                          onClick={() => handleRemove(m.id, m.fullName)}
                          disabled={isPending}
                          style={{
                            padding: '6px 12px', background: 'transparent',
                            border: '1px solid #fca5a5', borderRadius: '6px',
                            fontSize: '12px', color: '#ef4444', cursor: 'pointer',
                          }}
                        >
                          Remover
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

      {/* Role legend */}
      <div style={{ marginTop: '20px', padding: '16px 20px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <p style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>
          Referencia de roles
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
          {[
            { role: 'owner',     desc: 'Control total, billing' },
            { role: 'admin',     desc: 'Gestión usuarios y config' },
            { role: 'architect', desc: 'Templates, jerarquía, asignar ITRs' },
            { role: 'leader',    desc: 'Asignar ITRs, cerrar punches' },
            { role: 'inspector', desc: 'Ejecutar ITRs, crear punches' },
            { role: 'client',    desc: 'Solo lectura + firma cliente' },
          ].map(({ role, desc }) => (
            <div key={role} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <RoleBadge role={role} />
              <span style={{ fontSize: '12px', color: '#64748b' }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
