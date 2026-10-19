'use client'

// S04 (C-01): completar o cambiar quién firma cada rol requerido mientras ese rol no haya firmado.
// Antes no había pantalla para esto y la BD lo bloqueaba con la primera firma: un ITR sin supervisor
// quedaba «completado» para siempre. La BD sigue siendo la que decide (guard_itr_content).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { setItrAssignment } from '@/app/actions/itr-assign'
import type { SigningRole } from '@/lib/itr/signatures'

export type AssignableMember = { user_id: string; full_name: string; role: string }

export default function AssignmentsPanel({
  itrId,
  projectId,
  tagId,
  requiredRoles,
  assignments,
  signedRoles,
  members,
}: {
  itrId: string
  projectId: string
  tagId: string | null
  requiredRoles: SigningRole[]
  assignments: ReadonlyArray<{ role: string; user_id: string; profiles: { full_name: string } | null }>
  signedRoles: ReadonlyArray<string>
  members: AssignableMember[]
}) {
  const t = useTranslations('ItrExecution')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [draft, setDraft] = useState<Partial<Record<SigningRole, string>>>({})
  const [error, setError] = useState<string | null>(null)
  const missing = requiredRoles.some(r => !assignments.some(a => a.role === r))
  const rolesText = requiredRoles.map(r => t(`roles.${r}` as Parameters<typeof t>[0])).join(' · ')

  function save(role: SigningRole) {
    const userId = draft[role]
    if (!userId) return
    setError(null)
    startTransition(async () => {
      const res = await setItrAssignment({ itrId, projectId, tagId, role, userId })
      if (res.error) { setError(res.error); return }
      setDraft(d => ({ ...d, [role]: undefined }))
      router.refresh()
    })
  }

  return (
    <details open={missing} style={{ background: 'var(--card-bg)', border: `1px solid ${missing ? '#fde68a' : 'var(--border)'}`, borderRadius: '12px', padding: '12px 14px' }}>
      <summary style={{ cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: 'var(--text-strong)' }}>
        {missing ? '⚠ ' : ''}{t('assign.title')}
      </summary>
      <p style={{ margin: '8px 0 10px', fontSize: '12px', color: 'var(--text-muted)' }}>{t('assign.hint', { roles: rolesText })}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {requiredRoles.map(role => {
          const current = assignments.find(a => a.role === role)
          const signed = signedRoles.includes(role)
          // D6: nadie con otro rol de este ITR aparece como opción.
          const taken = new Set(assignments.filter(a => a.role !== role).map(a => a.user_id))
          const options = members.filter(m => !taken.has(m.user_id))
          const value = draft[role] ?? current?.user_id ?? ''
          const changed = !!draft[role] && draft[role] !== current?.user_id
          return (
            <div key={role} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ flex: '0 0 92px', fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)' }}>{t(`roles.${role}` as Parameters<typeof t>[0])}</span>
              {signed ? (
                <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 600 }}>✓ {current?.profiles?.full_name ?? ''} · {t('assign.signedLocked')}</span>
              ) : (
                <>
                  <select
                    value={value}
                    onChange={e => setDraft(d => ({ ...d, [role]: e.target.value }))}
                    disabled={isPending}
                    aria-label={t(`roles.${role}` as Parameters<typeof t>[0])}
                    style={{ flex: '1 1 180px', minWidth: 0, padding: '7px 10px', border: `1px solid ${current ? 'var(--border)' : '#fcd34d'}`, borderRadius: '8px', fontSize: '12px', background: 'var(--card-bg)', color: 'var(--text-strong)' }}
                  >
                    <option value="">{current ? t('assign.choose') : t('assign.unassigned')}</option>
                    {current && !options.some(m => m.user_id === current.user_id) && (
                      <option value={current.user_id}>{current.profiles?.full_name ?? current.user_id}</option>
                    )}
                    {options.map(m => <option key={m.user_id} value={m.user_id}>{m.full_name} ({m.role})</option>)}
                  </select>
                  <button
                    onClick={() => save(role)}
                    disabled={!changed || isPending}
                    style={{ padding: '7px 12px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: 600, background: changed && !isPending ? '#3b82f6' : 'var(--gray-100)', color: changed && !isPending ? '#fff' : 'var(--gray-400)', cursor: changed && !isPending ? 'pointer' : 'not-allowed' }}
                  >
                    {isPending ? t('assign.saving') : t('assign.save')}
                  </button>
                </>
              )}
            </div>
          )
        })}
      </div>
      {error && <p role="alert" style={{ margin: '10px 0 0', fontSize: '12px', color: '#b91c1c', background: '#fee2e2', borderRadius: '6px', padding: '6px 10px' }}>{error}</p>}
    </details>
  )
}
