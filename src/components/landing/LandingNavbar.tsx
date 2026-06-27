'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import LocaleSwitcher from '@/components/LocaleSwitcher'

export default function LandingNavbar() {
  const t = useTranslations('Landing.nav')
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // With the menu open the bar needs a solid background so the panel reads as one piece
  const solid = scrolled || menuOpen

  const navStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    transition: 'background 0.25s, box-shadow 0.25s, backdrop-filter 0.25s',
    background: solid ? 'rgba(255,255,255,0.96)' : 'transparent',
    backdropFilter: solid ? 'blur(12px)' : 'none',
    boxShadow: solid ? '0 1px 0 rgba(11,29,58,0.08), 0 2px 8px rgba(11,29,58,0.05)' : 'none',
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
    color: solid ? '#64707C' : '#94a3b8',
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
    color: solid ? '#64707C' : '#94a3b8',
    border: solid ? '1px solid rgba(11,29,58,0.18)' : '1px solid rgba(255,255,255,0.12)',
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

  const burgerStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 8,
    margin: -8,
    alignItems: 'center',
    justifyContent: 'center',
    color: solid ? '#0B1D3A' : '#e2e8f0',
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
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={solid ? '/logos/isotipo-color.png' : '/logos/isotipo-white.png'}
            height={38}
            alt=""
            aria-hidden="true"
            style={{ display: 'block', height: 38, width: 'auto' }}
          />
          <span style={{
            fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1,
            color: solid ? '#12304A' : '#FFFFFF',
          }}>
            Comm<span style={{ color: '#F47A20' }}>UP</span>
          </span>
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
          <LocaleSwitcher variant={solid ? 'light' : 'dark'} />
          <Link href="/login" style={loginBtnStyle} className="landing-nav-links">
            {t('login')}
          </Link>
          <a
            href="#contact"
            style={demoBtnStyle}
            className="landing-nav-demo"
          >
            {t('requestDemo')} →
          </a>
          <button
            type="button"
            className="landing-burger"
            style={burgerStyle}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(open => !open)}
          >
            {menuOpen ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu panel */}
      {menuOpen && (
        <div style={{
          background: 'rgba(255,255,255,0.98)',
          borderTop: '1px solid #E9EDF1',
          boxShadow: '0 16px 32px rgba(11,29,58,0.12)',
          padding: '8px 24px 20px',
        }}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {navLinks.map(({ key, href }) => (
              <li key={key}>
                <a
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  style={{
                    display: 'block', padding: '13px 0',
                    fontSize: 15, fontWeight: 600, color: '#1e293b',
                    textDecoration: 'none',
                    borderBottom: '1px solid #F1F5F9',
                  }}
                >
                  {t(key)}
                </a>
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
            <Link
              href="/login"
              onClick={() => setMenuOpen(false)}
              style={{
                ...loginBtnStyle,
                color: '#0B1D3A',
                border: '1px solid rgba(11,29,58,0.18)',
                justifyContent: 'center',
                padding: '11px 16px',
                fontSize: 14,
              }}
            >
              {t('login')}
            </Link>
            <a
              href="#contact"
              onClick={() => setMenuOpen(false)}
              style={{ ...demoBtnStyle, justifyContent: 'center', padding: '12px 18px', fontSize: 14 }}
            >
              {t('requestDemo')} →
            </a>
          </div>
        </div>
      )}
    </nav>
  )
}
