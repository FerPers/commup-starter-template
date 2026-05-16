'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import LocaleSwitcher from '@/components/LocaleSwitcher'
import CommUpLogo from './CommUpLogo'

export default function LandingNavbar() {
  const t = useTranslations('Landing.nav')
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const navStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    transition: 'background 0.25s, box-shadow 0.25s, backdrop-filter 0.25s',
    background: scrolled ? 'rgba(10, 10, 20, 0.92)' : 'transparent',
    backdropFilter: scrolled ? 'blur(12px)' : 'none',
    boxShadow: scrolled ? '0 1px 0 rgba(255,255,255,0.06)' : 'none',
  }

  const innerStyle: React.CSSProperties = {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '0 24px',
    height: 64,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 24,
  }

  const navLinkStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 500,
    color: '#94a3b8',
    textDecoration: 'none',
    transition: 'color 0.15s',
    whiteSpace: 'nowrap',
  }

  const rightStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
  }

  const loginBtnStyle: React.CSSProperties = {
    background: 'transparent',
    color: '#94a3b8',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    padding: '7px 16px',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    transition: 'color 0.15s, border-color 0.15s',
    whiteSpace: 'nowrap',
  }

  const demoBtnStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, #ea580c, #dc2626)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '8px 18px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    letterSpacing: '0.01em',
    transition: 'opacity 0.15s, transform 0.1s',
    whiteSpace: 'nowrap',
    boxShadow: '0 2px 12px rgba(234,88,12,0.35)',
  }

  const navLinks = [
    { key: 'features' as const, href: '#features' },
    { key: 'modules' as const, href: '#modules' },
    { key: 'howItWorks' as const, href: '#how-it-works' },
    { key: 'industries' as const, href: '#industries' },
    { key: 'pricing' as const, href: '#pricing' },
  ]

  return (
    <nav style={navStyle}>
      <div style={innerStyle}>
        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flexShrink: 0 }}>
          <CommUpLogo size={32} variant="full" theme="dark" />
        </Link>

        {/* Nav links — hidden on mobile via media (handled in globals) */}
        <ul style={{
          display: 'flex', alignItems: 'center', gap: 28,
          listStyle: 'none', margin: 0, padding: 0, flex: 1,
        }} className="landing-nav-links">
          {navLinks.map(({ key, href }) => (
            <li key={key}>
              <a href={href} style={navLinkStyle} className="landing-nav-link">
                {t(key)}
              </a>
            </li>
          ))}
        </ul>

        {/* Right side */}
        <div style={rightStyle}>
          <LocaleSwitcher variant="dark" />
          <Link href="/login" style={loginBtnStyle} className="landing-nav-links">
            {t('login')}
          </Link>
          <a
            href="mailto:contacto@commup.app?subject=Demo CommUp"
            style={demoBtnStyle}
          >
            {t('requestDemo')} →
          </a>
        </div>
      </div>
    </nav>
  )
}
