'use client'

import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  {
    group: 'Principal',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: '◈' },
      { href: '/projects', label: 'Proyectos', icon: '⬡' },
    ],
  },
  {
    group: 'Ejecución',
    items: [
      { href: '/itrs', label: 'ITRs', icon: '✓' },
      { href: '/punch-list', label: 'Punch List', icon: '⚑' },
      { href: '/preservation', label: 'Preservación', icon: '◉' },
      { href: '/work-plans', label: 'Planes de Trabajo', icon: '▦' },
    ],
  },
  {
    group: 'Control',
    items: [
      { href: '/certificates', label: 'Certificados', icon: '◎' },
      { href: '/kpis', label: 'KPIs', icon: '▲' },
    ],
  },
  {
    group: 'Administración',
    items: [
      { href: '/admin/templates', label: 'Templates ITR', icon: '▤' },
      { href: '/admin/users', label: 'Usuarios', icon: '◯' },
      { href: '/admin/config', label: 'Configuración', icon: '⚙' },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

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
            <div style={{ color: '#475569', fontSize: '11px' }}>CMS Platform</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {navItems.map(group => (
          <div key={group.group} style={{ marginBottom: '4px' }}>
            <div style={{
              padding: '8px 20px 4px',
              fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em',
              color: '#334155', textTransform: 'uppercase',
            }}>
              {group.group}
            </div>
            {group.items.map(item => {
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
                  {item.label}
                </a>
              )
            })}
          </div>
        ))}
      </nav>

      {/* User / Logout */}
      <div style={{
        padding: '16px 20px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
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
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
