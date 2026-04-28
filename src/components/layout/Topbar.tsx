import { getTranslations } from 'next-intl/server'
import type { OrgMemberRole } from '@/types/database'
import Breadcrumbs from './Breadcrumbs'

interface TopbarProps {
  role: OrgMemberRole | null
  orgName: string | null
  userEmail: string | null
}

const ROLE_COLORS: Record<OrgMemberRole, { bg: string; fg: string; border: string }> = {
  owner:     { bg: 'var(--role-owner-bg)',     fg: 'var(--role-owner-fg)',     border: 'var(--role-owner-border)' },
  admin:     { bg: 'var(--role-admin-bg)',     fg: 'var(--role-admin-fg)',     border: 'var(--role-admin-border)' },
  architect: { bg: 'var(--role-architect-bg)', fg: 'var(--role-architect-fg)', border: 'var(--role-architect-border)' },
  leader:    { bg: 'var(--role-leader-bg)',    fg: 'var(--role-leader-fg)',    border: 'var(--role-leader-border)' },
  inspector: { bg: 'var(--role-inspector-bg)', fg: 'var(--role-inspector-fg)', border: 'var(--role-inspector-border)' },
  client:    { bg: 'var(--role-client-bg)',    fg: 'var(--role-client-fg)',    border: 'var(--role-client-border)' },
}

export default async function Topbar({ role, orgName, userEmail }: TopbarProps) {
  const t = await getTranslations('Topbar')
  const colors = role ? ROLE_COLORS[role] : null
  const roleLabel = role ? t(`role.${role}`) : null

  return (
    <header
      role="banner"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        height: 56,
        padding: '0 24px',
        background: 'var(--card-bg)',
        borderBottom: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      <Breadcrumbs />

      {role && colors && (
        <div
          aria-label={t('roleAria', { role: roleLabel ?? role, org: orgName ?? '' })}
          title={userEmail ?? undefined}
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
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          <span aria-hidden="true" style={{ textTransform: 'capitalize' }}>{roleLabel}</span>
          {orgName && (
            <>
              <span aria-hidden="true" style={{ opacity: 0.5, fontWeight: 400 }}>@</span>
              <span style={{ fontWeight: 500 }}>{orgName}</span>
            </>
          )}
        </div>
      )}
    </header>
  )
}
