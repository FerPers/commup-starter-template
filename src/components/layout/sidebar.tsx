'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import LocaleSwitcher from '@/components/LocaleSwitcher'
import { useOfflineSync } from '@/hooks/useOfflineSync'

function SyncIndicator() {
  const { isOnline, pendingCount } = useOfflineSync()
  const dotColor = isOnline
    ? pendingCount > 0 ? '#f59e0b' : '#10b981'
    : '#ef4444'
  const label = isOnline
    ? pendingCount > 0 ? `Syncing ${pendingCount}…` : 'Online'
    : `Offline · ${pendingCount} pending`
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '6px 10px', borderRadius: '6px',
      background: 'rgba(255,255,255,0.04)',
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: dotColor, flexShrink: 0,
        boxShadow: isOnline && pendingCount === 0 ? `0 0 4px ${dotColor}` : 'none',
      }} />
      <span style={{ fontSize: 11, color: '#64748b' }}>{label}</span>
    </div>
  )
}

const navItems = [
  {
    groupKey: 'main',
    items: [
      { href: '/dashboard', labelKey: 'dashboard', icon: '◈' },
      { href: '/projects', labelKey: 'projects', icon: '⬡' },
    ],
  },
  {
    groupKey: 'execution',
    items: [
      { href: '/scan', labelKey: 'scan', icon: '⊟' },
      { href: '/itrs', labelKey: 'itrs', icon: '✓' },
      { href: '/punch-list', labelKey: 'punchList', icon: '⚑' },
      { href: '/preservation', labelKey: 'preservation', icon: '◉' },
      { href: '/work-plans', labelKey: 'workPlans', icon: '▦' },
    ],
  },
  {
    groupKey: 'control',
    items: [
      { href: '/control-tower', labelKey: 'controlTower', icon: '◍' },
      { href: '/certificates', labelKey: 'certificates', icon: '◎' },
      { href: '/kpis', labelKey: 'kpis', icon: '▲' },
    ],
  },
  {
    groupKey: 'admin',
    items: [
      { href: '/admin/templates', labelKey: 'itrTemplates', icon: '▤' },
      { href: '/admin/templates/preservation', labelKey: 'preservationTemplates', icon: '◉' },
      { href: '/admin/templates/pssr', labelKey: 'pssrTemplates', icon: '🛡' },
      { href: '/admin/users', labelKey: 'users', icon: '◯' },
      { href: '/admin/config', labelKey: 'config', icon: '⚙' },
      { href: '/admin/workflows', labelKey: 'workflows', icon: '⚡' },
      { href: '/admin/api-keys', labelKey: 'apiKeys', icon: '🔑' },
      { href: '/admin/webhooks', labelKey: 'webhooks', icon: '🪝' },
      { href: '/admin/notifications', labelKey: 'notifications', icon: '🔔' },
      { href: '/admin/audit', labelKey: 'auditLog', icon: '◑' },
    ],
  },
]

interface NotifCounts {
  punches: number
  preservation: number
}

export default function Sidebar({ notifCounts }: { notifCounts?: NotifCounts }) {
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations('Sidebar')

  const projectMatch = pathname.match(/\/projects\/([^/]+)/)
  const currentProjectId = projectMatch ? projectMatch[1] : null

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside style={{
      width: '240px', minWidth: '240px', height: '100vh',
      background: '#0f172a', display: 'flex', flexDirection: 'column',
      borderRight: '1px solid rgba(255,255,255,0.06)',
      position: 'sticky', top: 0,
    }}>
      {/* Logo */}
      <div style={{
        padding: '24px 20px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" stroke="white" strokeWidth="2"/>
            </svg>
          </div>
          <div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: '16px', letterSpacing: '-0.3px' }}>CommUp</div>
            <div style={{ color: '#475569', fontSize: '11px' }}>{t('platform')}</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {/* Dynamic project-context section */}
        {currentProjectId && (
          <div style={{ marginBottom: '4px' }}>
            <div style={{
              padding: '8px 20px 4px',
              fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em',
              color: '#334155', textTransform: 'uppercase',
            }}>
              {t('groups.project')}
            </div>
            {[
              { href: `/projects/${currentProjectId}/twin`, labelKey: 'twin', icon: '🔷' },
              { href: `/projects/${currentProjectId}/explorer`, labelKey: 'explorer', icon: '◧' },
              { href: `/projects/${currentProjectId}/work-plans`, labelKey: 'workPlans', icon: '▦' },
              { href: `/projects/${currentProjectId}/pssr`, labelKey: 'pssr', icon: '🛡' },
            ].map(item => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <a
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '9px 20px', margin: '1px 8px',
                    borderRadius: '8px', textDecoration: 'none',
                    background: isActive ? 'rgba(59,130,246,0.15)' : 'transparent',
                    color: isActive ? '#60a5fa' : '#64748b',
                    fontSize: '14px', fontWeight: isActive ? 500 : 400,
                    transition: 'all 0.15s',
                    borderLeft: isActive ? '2px solid #3b82f6' : '2px solid transparent',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'
                      ;(e.currentTarget as HTMLElement).style.color = '#94a3b8'
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.background = 'transparent'
                      ;(e.currentTarget as HTMLElement).style.color = '#64748b'
                    }
                  }}
                >
                  <span style={{ fontSize: '16px', opacity: 0.8 }}>{item.icon}</span>
                  {t(`nav.${item.labelKey}`)}
                </a>
              )
            })}
          </div>
        )}

        {navItems.map(group => (
          <div key={group.groupKey} style={{ marginBottom: '4px' }}>
            <div style={{
              padding: '8px 20px 4px',
              fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em',
              color: '#334155', textTransform: 'uppercase',
            }}>
              {t(`groups.${group.groupKey}`)}
            </div>
            {group.items.map(item => {
              const disabled = 'disabled' in item && item.disabled
              const isActive = !disabled && (pathname === item.href || pathname.startsWith(item.href + '/'))
              const badge =
                item.href === '/punch-list' ? (notifCounts?.punches ?? 0) :
                item.href === '/preservation' ? (notifCounts?.preservation ?? 0) :
                0
              if (disabled) {
                return (
                  <div
                    key={item.href}
                    title={t('comingSoon')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '9px 20px', margin: '1px 8px',
                      borderRadius: '8px', cursor: 'not-allowed',
                      color: '#334155', fontSize: '14px', fontWeight: 400,
                      borderLeft: '2px solid transparent',
                    }}
                  >
                    <span style={{ fontSize: '16px', opacity: 0.4 }}>{item.icon}</span>
                    <span style={{ opacity: 0.45 }}>{t(`nav.${item.labelKey}`)}</span>
                    <span style={{
                      marginLeft: 'auto', fontSize: '9px', fontWeight: 600,
                      color: '#475569', background: 'rgba(255,255,255,0.06)',
                      padding: '2px 6px', borderRadius: '4px', letterSpacing: '0.04em',
                    }}>{t('soon')}</span>
                  </div>
                )
              }
              return (
                <a
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '9px 20px', margin: '1px 8px',
                    borderRadius: '8px', textDecoration: 'none',
                    background: isActive ? 'rgba(59,130,246,0.15)' : 'transparent',
                    color: isActive ? '#60a5fa' : '#64748b',
                    fontSize: '14px', fontWeight: isActive ? 500 : 400,
                    transition: 'all 0.15s',
                    borderLeft: isActive ? '2px solid #3b82f6' : '2px solid transparent',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'
                      ;(e.currentTarget as HTMLElement).style.color = '#94a3b8'
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.background = 'transparent'
                      ;(e.currentTarget as HTMLElement).style.color = '#64748b'
                    }
                  }}
                >
                  <span style={{ fontSize: '16px', opacity: 0.8 }}>{item.icon}</span>
                  {t(`nav.${item.labelKey}`)}
                  {badge > 0 && (
                    <span style={{
                      marginLeft: 'auto', background: '#ef4444', color: 'white',
                      fontSize: '11px', fontWeight: 700,
                      padding: '1px 6px', borderRadius: '10px',
                      minWidth: '20px', textAlign: 'center', lineHeight: '18px',
                    }}>
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </a>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer: sync indicator + locale switcher + logout */}
      <div style={{
        padding: '12px 20px 16px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column', gap: '10px',
      }}>
        <SyncIndicator />
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <LocaleSwitcher variant="dark" />
        </div>
        <button
          onClick={handleLogout}
          style={{
            width: '100%', padding: '9px 12px',
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: '8px', color: '#f87171', fontSize: '13px',
            cursor: 'pointer', fontWeight: 500,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.2)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
        >
          {t('logout')}
        </button>
      </div>
    </aside>
  )
}