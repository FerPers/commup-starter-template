import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function CtaSection() {
  const t = await getTranslations('Landing.cta')

  return (
    <section id="contact" style={{
      padding: '120px 24px',
      borderTop: '1px solid rgba(255,255,255,0.05)',
      position: 'relative', overflow: 'hidden',
      background: '#0B1D3A',
    }}>
      {/* Teal radial glow */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(0,181,168,0.15) 0%, transparent 65%)',
      }} />

      {/* Grid texture */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `linear-gradient(rgba(0,181,168,0.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,181,168,0.05) 1px, transparent 1px)`,
        backgroundSize: '60px 60px',
      }} />

      <div style={{
        maxWidth: 680, margin: '0 auto',
        textAlign: 'center', position: 'relative', zIndex: 2,
      }}>
        <h2 style={{
          fontSize: 42, fontWeight: 800, color: '#f1f5f9',
          margin: '0 0 16px', lineHeight: 1.12, letterSpacing: '-0.03em',
        }}>
          {t('title')}
        </h2>
        <p style={{ fontSize: 17, color: '#64748b', margin: '0 0 44px', lineHeight: 1.65 }}>
          {t('subtitle')}
        </p>

        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a
            href="mailto:contacto@commup.app?subject=Demo CommUp"
            style={{
              background: 'linear-gradient(135deg, #ea580c, #dc2626)',
              color: '#fff', border: 'none', borderRadius: 12,
              padding: '15px 32px', fontSize: 16, fontWeight: 700,
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
              boxShadow: '0 4px 28px rgba(234,88,12,0.45)',
              transition: 'transform 0.15s, box-shadow 0.15s',
              letterSpacing: '-0.01em',
            }}
          >
            {t('btnDemo')}
          </a>
          <Link href="/login" style={{
            background: 'rgba(255,255,255,0.06)',
            color: '#e2e8f0',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 12, padding: '15px 28px',
            fontSize: 16, fontWeight: 600, textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 8,
            transition: 'background 0.15s',
          }}>
            {t('btnAccess')} →
          </Link>
        </div>

        {/* Trust line */}
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 28 }}>
          {t('trustLine')}
        </p>
      </div>
    </section>
  )
}
