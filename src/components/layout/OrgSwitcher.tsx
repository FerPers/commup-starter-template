'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Check } from 'lucide-react'
import { switchOrg } from '@/app/actions/org'
import type { OrgMemberRole } from '@/types/database'

type Membership = {
  orgId: string
  orgName: string
  role: string
}

const ROLE_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  owner:     { bg: 'var(--role-owner-bg)',     fg: 'var(--role-owner-fg)',     border: 'var(--role-owner-border)' },
  admin:     { bg: 'var(--role-admin-bg)',     fg: 'var(--role-admin-fg)',     border: 'var(--role-admin-border)' },
  architect: { bg: 'var(--role-architect-bg)', fg: 'var(--role-architect-fg)', border: 'var(--role-architect-border)' },
  leader:    { bg: 'var(--role-leader-bg)',    fg: 'var(--role-leader-fg)',    border: 'var(--role-leader-border)' },
  inspector: { bg: 'var(--role-inspector-bg)', fg: 'var(--role-inspector-fg)', border: 'var(--role-inspector-border)' },
  client:    { bg: 'var(--role-client-bg)',    fg: 'var(--role-client-fg)',    border: 'var(--role-client-border)' },
}

export default function OrgSwitcher({
  activeOrgId,
  activeOrgName,
  activeRole,
  memberships,
  userEmail,
  roleLabels,
}: {
  activeOrgId: string
  activeOrgName: string | null
  activeRole: OrgMemberRole
  memberships: Membership[]
  userEmail: string | null
  roleLabels: Record<string, string>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const colors = ROLE_COLORS[activeRole] ?? ROLE_COLORS.client
  const onlyOne = memberships.length <= 1

  function handleSelect(orgId: string) {
    if (orgId === activeOrgId) {
      setOpen(false)
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await switchOrg(orgId)
      if (res.error) {
        setError(res.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => !onlyOne && setOpen(o => !o)}
        title={userEmail ?? undefined}
        disabled={isPending}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '5px 12px',
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          borderRadius: 'var(--radius-pill)',
          fontSize: 'var(--text-sm)',
          fontWeight: 600,
          color: colors.fg,
          cursor: onlyOne ? 'default' : 'pointer',
          opacity: isPending ? 0.6 : 1,
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ textTransform: 'capitalize' }}>{roleLabels[activeRole] ?? activeRole}</span>
        {activeOrgName && (
          <>
            <span aria-hidden="true" style={{ opacity: 0.5, fontWeight: 400 }}>@</span>
            <span style={{ fontWeight: 500 }}>{activeOrgName}</span>
          </>
        )}
        {!onlyOne && <ChevronDown size={14} style={{ opacity: 0.7 }} />}
      </button>

      {open && !onlyOne && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: 260,
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
            padding: 6,
            zIndex: 30,
          }}
        >
          <p style={{
            margin: '6px 10px 4px',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--gray-400)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            Cambiar organización
          </p>
          {memberships.map(m => {
            const isActive = m.orgId === activeOrgId
            const c = ROLE_COLORS[m.role] ?? ROLE_COLORS.client
            return (
              <button
                key={m.orgId}
                type="button"
                onClick={() => handleSelect(m.orgId)}
                disabled={isPending}
                role="menuitem"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '8px 10px',
                  background: isActive ? 'var(--gray-50)' : 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 13,
                  color: 'var(--text-strong)',
                  cursor: isPending ? 'wait' : 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.orgName}
                  </span>
                  <span style={{
                    fontSize: 11,
                    color: c.fg,
                    background: c.bg,
                    border: `1px solid ${c.border}`,
                    padding: '1px 8px',
                    borderRadius: 999,
                    width: 'fit-content',
                    textTransform: 'capitalize',
                  }}>
                    {roleLabels[m.role] ?? m.role}
                  </span>
                </span>
                {isActive && <Check size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
              </button>
            )
          })}
          {error && (
            <p style={{ margin: '6px 10px', fontSize: 12, color: '#dc2626' }}>{error}</p>
          )}
        </div>
      )}
    </div>
  )
}
