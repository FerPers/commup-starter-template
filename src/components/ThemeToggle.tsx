'use client'

import { useEffect, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Sun, Moon } from 'lucide-react'
import { setTheme } from '@/app/actions/theme'
import { useMounted } from '@/hooks/useMounted'
import type { Theme } from '@/types/theme'

function getInitialTheme(): Theme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export default function ThemeToggle({ variant = 'dark' }: { variant?: 'dark' | 'light' }) {
  const t = useTranslations('Sidebar')
  const [theme, setThemeState] = useState<Theme>('light')
  const mounted = useMounted()
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydration-safe: SSR renders 'light' default; on mount we read documentElement.dataset.theme set by the cookie-based pre-paint script
    setThemeState(getInitialTheme())
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    setThemeState(next)
    // Persist cookie for future SSR; do NOT refresh — keeps current page state.
    startTransition(() => {
      void setTheme(next)
    })
  }

  const isDark = theme === 'dark'
  // Mostrar ESTADO actual: en dark vemos Moon+"Oscuro"; en light vemos Sun+"Claro".
  // El click alterna al opuesto. aria-label dice la acción.
  const Icon = isDark ? Moon : Sun
  const light = variant === 'light'
  const bg = light ? 'var(--gray-100)' : 'rgba(255,255,255,0.06)'
  const bgHover = light ? 'var(--gray-200)' : 'rgba(255,255,255,0.12)'
  const fg = light ? 'var(--text-strong)' : '#e2e8f0'
  const border = light ? 'var(--border)' : 'rgba(255,255,255,0.12)'
  const stateLabel = isDark ? t('theme.dark') : t('theme.light')
  const actionLabel = isDark ? t('theme.switchToLight') : t('theme.switchToDark')

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={actionLabel}
      title={actionLabel}
      disabled={!mounted}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '6px 10px',
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 'var(--radius-md)',
        color: fg,
        fontSize: 'var(--text-xs)',
        fontWeight: 500,
        cursor: mounted ? 'pointer' : 'default',
        opacity: isPending ? 0.5 : 1,
        transition: 'background 0.15s, color 0.15s, opacity 0.15s',
        fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => {
        if (!mounted) return
        ;(e.currentTarget as HTMLElement).style.background = bgHover
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLElement).style.background = bg
      }}
    >
      <Icon size={14} strokeWidth={2} aria-hidden="true" />
      <span>{stateLabel}</span>
    </button>
  )
}
