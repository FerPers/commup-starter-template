import { getTranslations } from 'next-intl/server'
import type { OrgMemberRole } from '@/types/database'
import Breadcrumbs from './Breadcrumbs'
import OrgSwitcher from './OrgSwitcher'

type Membership = {
  orgId: string
  orgName: string
  role: string
}

interface TopbarProps {
  role: OrgMemberRole | null
  orgName: string | null
  activeOrgId: string
  memberships: Membership[]
  userEmail: string | null
}

export default async function Topbar({ role, orgName, activeOrgId, memberships, userEmail }: TopbarProps) {
  const t = await getTranslations('Topbar')
  const roleLabels: Record<string, string> = {
    owner:     t('role.owner'),
    admin:     t('role.admin'),
    architect: t('role.architect'),
    leader:    t('role.leader'),
    inspector: t('role.inspector'),
    client:    t('role.client'),
  }

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

      {role && (
        <OrgSwitcher
          activeOrgId={activeOrgId}
          activeOrgName={orgName}
          activeRole={role}
          memberships={memberships}
          userEmail={userEmail}
          roleLabels={roleLabels}
        />
      )}
    </header>
  )
}
