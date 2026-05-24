'use client'

import { Menu } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useDrawerControls } from './DrawerContext'

export default function MobileMenuButton() {
  const t = useTranslations('Topbar')
  const { open } = useDrawerControls()
  return (
    <button
      type="button"
      onClick={open}
      aria-label={t('openMenu')}
      className="topbar-burger"
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        color: 'var(--text-primary)',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover-bg, rgba(255,255,255,0.05))')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <Menu size={18} aria-hidden="true" />
    </button>
  )
}