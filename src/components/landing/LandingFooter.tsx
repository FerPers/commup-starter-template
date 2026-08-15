import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function LandingFooter() {
  const t = await getTranslations('Landing.footer')

  return (
    <footer style={{
      background: '#0B1D3A',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      padding: '60px 24px 32px',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Top row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
          gap: 40, marginBottom: 48,
        }} className="footer-grid">
          {/* Brand */}
          <div>
            <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 9 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logos/isotipo-white.png" height={30} alt="" aria-hidden="true" style={{ display: 'block', height: 30, width: 'auto' }} />
              <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, color: '#FFFFFF' }}>
                Comm<span style={{ color: '#F47A20' }}>UP</span>
              </span>
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, margin: '0 0 4px' }}>
              {t('subtitle')}
            </p>
            <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.65, margin: '0 0 16px', maxWidth: 240 }}>
              {t('tagline')}
            </p>
            <a
              href="mailto:contacto@commup.app"
              style={{ fontSize: 13, color: '#00B5A8', textDecoration: 'none', fontWeight: 500 }}
            >
              contacto@commup.app
            </a>
          </div>

          {/* Product */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>
              {t('product')}
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li><a href="#modules" style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'none' }}>{t('modules')}</a></li>
              <li><a href="#how-it-works" style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'none' }}>{t('howItWorks')}</a></li>
              <li><a href="/guia.html" style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'none' }}>{t('guide')}</a></li>
              <li><a href="#contact" style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'none' }}>{t('demo')}</a></li>
              <li><a href="#pricing" style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'none' }}>{t('pricing')}</a></li>
            </ul>
          </div>

          {/* Modules */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>
              {t('modules')}
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(['itrs', 'punchList', 'certificates', 'kpis', 'preservation'] as const).map(k => (
                <li key={k}>
                  <span style={{ fontSize: 13, color: '#94a3b8' }}>{t(k)}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>
              {t('company')}
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li><span style={{ fontSize: 13, color: '#94a3b8' }}>{t('about')}</span></li>
              <li><a href="#contact" style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'none' }}>{t('blog')}</a></li>
              <li>
                <a href="#contact" style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'none' }}>
                  {t('contact')}
                </a>
              </li>
              <li>
                <Link href="/login" style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'none' }}>
                  {t('demo')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>
              {t('legal')}
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li><Link href="/privacy" style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'none' }}>{t('privacy')}</Link></li>
              <li><Link href="/terms" style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'none' }}>{t('terms')}</Link></li>
              <li>
                <Link href="/login" style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'none' }}>
                  {t('clientAccess')}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.05)',
          paddingTop: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12,
        }}>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
            © 2026 CommUp. {t('rights')}
          </p>
          {/* Redes sociales retiradas hasta tener cuentas reales (audit L1) */}
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>commup.app</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
