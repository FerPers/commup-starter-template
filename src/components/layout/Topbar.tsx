import { getTranslations } from 'next-intl/server'
import type { OrgMemberRole } from '@/types/database'
import Breadcrumbs from './Breadcrumbs'
import UserMenu from './UserMenu'
import NotificationsBell from './NotificationsBell'
import CommandPalette from './CommandPalette'
import CreateMenu from './CreateMenu'
import { FIELD_ROLES } from '@/lib/constants/navigation'

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
  userName: string | null
  userId: string
  unreadNotifications: number
  projectNames: Record<string, string>
  children?: React.ReactNode
}

export default async function Topbar({ role, orgName, activeOrgId, memberships, userEmail, userName, userId, unreadNotifications, projectNames, children }: TopbarProps) {
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
      {children}
      <Breadcrumbs projectNames={projectNames} />

      {/* N3a: buscar cualquier cosa (⌘K) */}
      {role && <CommandPalette />}

      {/* N3b: ＋ Crear con el contexto de la pantalla (en el teléfono de campo, el ＋ de la barra inferior) */}
      {role && (
        <CreateMenu
          role={role}
          projects={Object.entries(projectNames).map(([id, name]) => ({ id, name }))}
          hideOnTabbar={FIELD_ROLES.includes(role)}
        />
      )}

      {role && (
        <NotificationsBell
          initialUnread={unreadNotifications}
          userId={userId}
          orgId={activeOrgId}
        />
      )}

      {role && (
        <UserMenu
          activeOrgId={activeOrgId}
          activeOrgName={orgName}
          activeRole={role}
          memberships={memberships}
          userEmail={userEmail}
          userName={userName}
          roleLabels={roleLabels}
        />
      )}
    </header>
  )
}
