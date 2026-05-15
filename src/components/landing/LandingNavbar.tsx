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
    gap: 32,
  }

  const logoStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    textDecoration: 'none',
  }

  const logoMarkStyle: React.CSSProperties = {
    width: 32,
    height: 32,
    background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    fontWeight: 800,
    color: '#fff',
  }

  const logoTextStyle: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 700,
    color: '#f1f5f9',
    letterSpacing: '-0.01em',
  }

  const navLinksStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 32,
    listStyle: 'none',
    margin: 0,
    padding: 0,
  }

  const navLinkStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 500,
    color: '#94a3b8',
    textDecoration: 'none',
    transition: 'color 0.15s',
  }

  const rightStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
  }

  const ctaBtnStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
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
  }

  return (
    <nav style={navStyle}>
      <div style={innerStyle}>
        {/* Logo */}
        <Link href="/" style={logoStyle}>
          <CommUpLogo size={32} variant="full" theme="dark" />
        </Link>

        {/* Nav links — hidden on mobile via media (handled in globals) */}
        <ul style={navLinksStyle} className="landing-nav-links">
          {(['features', 'modules', 'industries', 'contact'] as const).map(k => (
            <li key={k}>
              <a
                href={`#${k}`}
                style={navLinkStyle}
                className="landing-nav-link"
              >
                {t(k)}
              </a>
            </li>
          ))}
        </ul>

        {/* Right side */}
        <div style={rightStyle}>
          <LocaleSwitcher variant="dark" />
          <Link href="/login" style={ctaBtnStyle}>
            {t('clientAccess')} →
          </Link>
        </div>
      </div>
    </nav>
  )
}
