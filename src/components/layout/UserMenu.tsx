'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { BookOpen, Check, ChevronDown, LogOut } from 'lucide-react'
import { switchOrg } from '@/app/actions/org'
import { createClient } from '@/lib/supabase/client'
import LocaleSwitcher from '@/components/LocaleSwitcher'
import ThemeToggle from '@/components/ThemeToggle'
import type { OrgMemberRole } from '@/types/database'

/**
 * Menú de usuario en la barra superior (Sprint N, 2026-09-04). Sustituye al OrgSwitcher
 * y absorbe lo que vivía en el pie del sidebar: idioma, tema, guía de arranque y cerrar sesión.
 */

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

function displayNameOf(name: string | null, email: string | null): string {
  const trimmed = name?.trim() ?? ''
  if (trimmed.length > 0) return trimmed
  return email?.split('@')[0] ?? ''
}

function initialsOf(name: string | null, email: string | null): string {
  const base = displayNameOf(name, email)
  const src = (base.length > 0 ? base : '?').replace(/[._-]+/g, ' ')
  const parts = src.split(/\s+/).filter(Boolean)
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : src.slice(0, 2)).toUpperCase()
}

export default function UserMenu({
  activeOrgId,
  activeOrgName,
  activeRole,
  memberships,
  userEmail,
  userName,
  roleLabels,
}: {
  activeOrgId: string
  activeOrgName: string | null
  activeRole: OrgMemberRole
  memberships: Membership[]
  userEmail: string | null
  userName: string | null
  roleLabels: Record<string, string>
}) {
  const router = useRouter()
  const t = useTranslations('Topbar.menu')
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const colors = ROLE_COLORS[activeRole] ?? ROLE_COLORS.client
  const multiOrg = memberships.length > 1
  const displayName = displayNameOf(userName, userEmail)

  function handleSelect(orgId: string) {
    if (orgId === activeOrgId) return
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

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={userEmail ?? undefined}
        disabled={isPending}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '5px 12px 5px 6px',
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          borderRadius: 'var(--radius-pill)',
          fontSize: 'var(--text-sm)',
          fontWeight: 600,
          color: colors.fg,
          cursor: 'pointer',
          opacity: isPending ? 0.6 : 1,
          whiteSpace: 'nowrap',
          maxWidth: 360,
        }}
      >
        <span aria-hidden="true" style={{
          width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
          background: colors.fg, color: colors.bg,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, letterSpacing: '0.02em',
        }}>
          {initialsOf(userName, userEmail)}
        </span>
        <span style={{ textTransform: 'capitalize' }}>{roleLabels[activeRole] ?? activeRole}</span>
        {activeOrgName && (
          <>
            <span aria-hidden="true" style={{ opacity: 0.5, fontWeight: 400 }}>@</span>
            <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeOrgName}</span>
          </>
        )}
        <ChevronDown size={14} style={{ opacity: 0.7, flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            width: 300,
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
            padding: 6,
            zIndex: 30,
          }}
        >
          {/* Identidad */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px 10px' }}>
            <span aria-hidden="true" style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: colors.bg, color: colors.fg, border: `1px solid ${colors.border}`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700,
            }}>
              {initialsOf(userName, userEmail)}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
              {userEmail && <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userEmail}</div>}
            </div>
          </div>

          {/* Cambiar organización */}
          {multiOrg && (
            <>
              <SectionLabel>{t('switchOrg')}</SectionLabel>
              {memberships.map(m => {
                const isActive = m.orgId === activeOrgId
                const c = ROLE_COLORS[m.role] ?? ROLE_COLORS.client
                return (
                  <button
                    key={m.orgId}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => handleSelect(m.orgId)}
                    disabled={isPending}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                      padding: '7px 10px', background: isActive ? 'var(--gray-50)' : 'transparent',
                      border: 'none', borderRadius: 6, fontSize: 13, color: 'var(--text-strong)',
                      cursor: isPending ? 'wait' : 'pointer', textAlign: 'left',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.orgName}</span>
                      <span style={{ fontSize: 11, color: c.fg, background: c.bg, border: `1px solid ${c.border}`, padding: '0 7px', borderRadius: 999, textTransform: 'capitalize', flexShrink: 0 }}>
                        {roleLabels[m.role] ?? m.role}
                      </span>
                    </span>
                    {isActive && <Check size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                  </button>
                )
              })}
              {error && <p style={{ margin: '6px 10px', fontSize: 12, color: 'var(--danger-500)' }}>{error}</p>}
            </>
          )}

          {/* Preferencias */}
          <SectionLabel>{t('preferences')}</SectionLabel>
          <PrefRow label={t('language')}><LocaleSwitcher variant="light" /></PrefRow>
          <PrefRow label={t('theme')}><ThemeToggle variant="light" /></PrefRow>

          <Divider />
          <a
            href="/guia"
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, fontSize: 13, color: 'var(--text-strong)', textDecoration: 'none' }}
          >
            <BookOpen size={15} aria-hidden="true" style={{ color: 'var(--text-muted)' }} />
            {t('guide')}
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'transparent', border: 'none', borderRadius: 6, fontSize: 13, color: 'var(--danger-500)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
          >
            <LogOut size={15} aria-hidden="true" />
            {t('logout')}
          </button>
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: '8px 10px 4px', fontSize: 11, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {children}
    </p>
  )
}

function PrefRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '5px 10px', fontSize: 13, color: 'var(--text-strong)' }}>
      <span>{label}</span>
      {children}
    </div>
  )
}

function Divider() {
  return <div aria-hidden="true" style={{ height: 1, background: 'var(--border)', margin: '6px 4px' }} />
}
