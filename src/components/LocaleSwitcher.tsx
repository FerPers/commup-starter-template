'use client'

import { useTransition } from 'react'
import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { setLocale } from '@/app/actions/locale'

export default function LocaleSwitcher({ variant = 'dark' }: { variant?: 'dark' | 'light' }) {
  const locale = useLocale()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function switchLocale(next: 'es' | 'en') {
    if (next === locale) return
    startTransition(async () => {
      await setLocale(next)
      router.refresh()
    })
  }

  const baseBtn: React.CSSProperties = {
    background: 'none',
    border: 'none',
    padding: '2px 5px',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    fontFamily: 'inherit',
    transition: 'color 0.15s',
  }

  const activeColor = variant === 'dark' ? '#60a5fa' : '#1d4ed8'
  const inactiveColor = variant === 'dark' ? '#94a3b8' : '#94a3b8'
  const dividerColor = variant === 'dark' ? '#334155' : '#e2e8f0'

  return (
    <div style={{ display: 'flex', alignItems: 'center', opacity: isPending ? 0.5 : 1, transition: 'opacity 0.15s' }}>
      <button
        onClick={() => switchLocale('es')}
        style={{
          ...baseBtn,
          color: locale === 'es' ? activeColor : inactiveColor,
          cursor: locale === 'es' ? 'default' : 'pointer',
        }}
      >
        ES
      </button>
      <span style={{ color: dividerColor, fontSize: '11px', userSelect: 'none' }}>|</span>
      <button
        onClick={() => switchLocale('en')}
        style={{
          ...baseBtn,
          color: locale === 'en' ? activeColor : inactiveColor,
          cursor: locale === 'en' ? 'default' : 'pointer',
        }}
      >
        EN
      </button>
    </div>
  )
}