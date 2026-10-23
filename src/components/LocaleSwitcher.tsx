'use client'

import { useTransition } from 'react'
import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { setLocale } from '@/app/actions/locale'
import { ink } from '@/lib/theme'

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

  const activeColor = variant === 'dark' ? 'var(--primary-400)' : 'var(--primary-700)'
  const inactiveColor = variant === 'dark' ? 'var(--gray-400)' : 'var(--gray-400)'
  const dividerColor = variant === 'dark' ? 'var(--gray-700)' : 'var(--gray-200)'

  return (
    <div style={{ display: 'flex', alignItems: 'center', opacity: isPending ? 0.5 : 1, transition: 'opacity 0.15s' }}>
      <button
        onClick={() => switchLocale('es')}
        style={{
          ...baseBtn,
          color: ink(locale === 'es' ? activeColor : inactiveColor),
          cursor: locale === 'es' ? 'default' : 'pointer',
        }}
      >
        ES
      </button>
      <span style={{ color: ink(dividerColor), fontSize: '11px', userSelect: 'none' }}>|</span>
      <button
        onClick={() => switchLocale('en')}
        style={{
          ...baseBtn,
          color: ink(locale === 'en' ? activeColor : inactiveColor),
          cursor: locale === 'en' ? 'default' : 'pointer',
        }}
      >
        EN
      </button>
    </div>
  )
}