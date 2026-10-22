'use client'

import { useEffect, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Sun, Moon, Contrast } from 'lucide-react'
import { useMounted } from '@/hooks/useMounted'
import { THEMES } from '@/lib/theme'
import { applyTheme, currentTheme, THEME_EVENT } from '@/lib/theme/client'
import type { Theme } from '@/types/theme'

const ICONS = { light: Sun, dark: Moon, contrast: Contrast } as const

// Selector Claro · Oscuro · Contraste (C-29) del menú de usuario.
export default function ThemeToggle() {
  const t = useTranslations('Sidebar')
  const [theme, setThemeState] = useState<Theme>('light')
  const mounted = useMounted()
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydration-safe: SSR renders 'light' default; on mount we read documentElement.dataset.theme (cookie SSR + pre-paint script)
    setThemeState(currentTheme())
    const onChange = (e: Event) => setThemeState((e as CustomEvent<Theme>).detail)
    window.addEventListener(THEME_EVENT, onChange)
    return () => window.removeEventListener(THEME_EVENT, onChange)
  }, [])

  function choose(next: Theme) {
    if (next === theme) return
    setThemeState(next)
    startTransition(() => { void applyTheme(next) })
  }

  return (
    <div
      role="radiogroup"
      aria-label={t('theme.label')}
      style={{
        display: 'inline-flex', padding: 2, gap: 2,
        background: 'var(--gray-100)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        opacity: isPending ? 0.6 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      {THEMES.map(option => {
        const Icon = ICONS[option]
        const selected = option === theme
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            title={t(`theme.${option}`)}
            disabled={!mounted}
            onClick={() => choose(option)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 8px',
              background: selected ? 'var(--card-bg)' : 'transparent',
              border: selected ? '1px solid var(--border)' : '1px solid transparent',
              borderRadius: 'var(--radius-sm)',
              color: selected ? 'var(--text-strong)' : 'var(--text-muted)',
              fontSize: 'var(--text-xs)',
              fontWeight: selected ? 600 : 500,
              fontFamily: 'inherit',
              cursor: mounted ? 'pointer' : 'default',
            }}
          >
            <Icon size={13} strokeWidth={2} aria-hidden="true" />
            <span>{t(`theme.${option}`)}</span>
          </button>
        )
      })}
    </div>
  )
}
