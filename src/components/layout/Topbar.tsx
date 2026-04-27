import { getTranslations } from 'next-intl/server'
import type { OrgMemberRole } from '@/types/database'
import Breadcrumbs from './Breadcrumbs'

interface TopbarProps {
  role: OrgMemberRole | null
  orgName: string | null
  userEmail: string | null
}

const ROLE_COLORS: Record<OrgMemberRole, { bg: string; fg: string; border: string }> = {
  owner:     { bg: 'rgba(168,85,247,0.12)', fg: 'var(--accent-700)',  border: 'rgba(168,85,247,0.30)' },
  admin:     { bg: 'rgba(59,130,246,0.12)', fg: 'var(--primary-700)', border: 'rgba(59,130,246,0.30)' },
  architect: { bg: 'rgba(59,130,246,0.10)', fg: 'var(--primary-700)', border: 'rgba(59,130,246,0.25)' },
  leader:    { bg: 'rgba(245,158,11,0.12)', fg: 'var(--warning-700)', border: 'rgba(245,158,11,0.30)' },
  inspector: { bg: 'rgba(16,185,129,0.12)', fg: 'var(--success-700)', border: 'rgba(16,185,129,0.30)' },
  client:    { bg: 'rgba(100,116,139,0.12)', fg: 'var(--gray-700)',   border: 'rgba(100,116,139,0.30)' },
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
