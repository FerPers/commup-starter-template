import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import CommUpLogo from './CommUpLogo'

export default async function LandingFooter() {
  const t = await getTranslations('Landing.footer')

  return (
    <footer style={{
      background: '#050508',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      padding: '60px 24px 32px',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Top row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr 1fr',
          gap: 48, marginBottom: 48,
        }} className="footer-grid">
          {/* Brand */}
          <div>
            <div style={{ marginBottom: 14 }}>
              <CommUpLogo size={30} variant="full" theme="dark" />
            </div>
            <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.65, margin: '0 0 16px', maxWidth: 260 }}>
              {t('tagline')}
            </p>
            <a
              href="mailto:contacto@commup.app"
              style={{ fontSize: 13, color: '#7c3aed', textDecoration: 'none', fontWeight: 500 }}
            >
              contacto@commup.app
            </a>
          </div>

          {/* Modules */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>
              {t('modules')}
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(['itrs', 'punchList', 'certificates', 'kpis', 'preservation'] as const).map(k => (
                <li key={k}>
                  <span style={{ fontSize: 13, color: '#475569' }}>{t(k)}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>
              {t('company')}
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li><span style={{ fontSize: 13, color: '#475569' }}>{t('about')}</span></li>
              <li>
                <a href="mailto:contacto@commup.app" style={{ fontSize: 13, color: '#475569', textDecoration: 'none' }}>
                  {t('contact')}
                </a>
              </li>
              <li>
                <Link href="/login" style={{ fontSize: 13, color: '#475569', textDecoration: 'none' }}>
                  Client Access
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>
              {t('legal')}
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li><span style={{ fontSize: 13, color: '#475569' }}>{t('privacy')}</span></li>
              <li><span style={{ fontSize: 13, color: '#475569' }}>{t('terms')}</span></li>
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
          <p style={{ fontSize: 12, color: '#334155', margin: 0 }}>
            © 2026 CommUp. {t('rights')}
          </p>
          <p style={{ fontSize: 12, color: '#1e293b', margin: 0 }}>
            commup.app
          </p>
        </div>
      </div>
    </footer>
  )
}
