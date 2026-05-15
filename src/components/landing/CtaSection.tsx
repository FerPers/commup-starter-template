import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function CtaSection() {
  const t = await getTranslations('Landing.cta')

  return (
    <section id="contact" style={{
      padding: '120px 24px',
      borderTop: '1px solid rgba(255,255,255,0.05)',
      position: 'relative', overflow: 'hidden',
      backgroundImage: [
        'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(124,58,237,0.25) 0%, transparent 70%)',
        'linear-gradient(to bottom, rgba(6,4,14,0.78) 0%, rgba(6,4,14,0.62) 50%, rgba(6,4,14,0.82) 100%)',
        'url(https://images.unsplash.com/photo-1466611653911-95081537e5b7?w=1920&q=80&auto=format&fit=crop)',
      ].join(', '),
      backgroundSize: 'auto, auto, cover',
      backgroundPosition: 'center, center, center',
    }}>

      <div style={{
        maxWidth: 640, margin: '0 auto',
        textAlign: 'center', position: 'relative', zIndex: 2,
      }}>
        <h2 style={{
          fontSize: 40, fontWeight: 800, color: '#f1f5f9',
          margin: '0 0 16px', lineHeight: 1.15, letterSpacing: '-0.03em',
        }}>
          {t('title')}
        </h2>
        <p style={{ fontSize: 17, color: '#64748b', margin: '0 0 40px', lineHeight: 1.6 }}>
          {t('subtitle')}
        </p>

        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/login" style={{
            background: 'rgba(255,255,255,0.07)',
            color: '#e2e8f0',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10, padding: '14px 28px',
            fontSize: 15, fontWeight: 600, textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 8,
            transition: 'background 0.15s',
          }}>
            {t('btnAccess')} →
          </Link>
          <a
            href="mailto:contacto@commup.app?subject=Demo CommUp"
            style={{
              background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
              color: '#fff', border: 'none', borderRadius: 10,
              padding: '14px 28px', fontSize: 15, fontWeight: 600,
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
              boxShadow: '0 4px 28px rgba(124,58,237,0.45)',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
          >
            {t('btnDemo')}
          </a>
        </div>
      </div>
    </section>
  )
}
