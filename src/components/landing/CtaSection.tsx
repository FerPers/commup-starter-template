import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import LeadForm from './LeadForm'

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
          fontSize: 'clamp(30px, 7vw, 42px)', fontWeight: 800, color: '#f1f5f9',
          margin: '0 0 16px', lineHeight: 1.12, letterSpacing: '-0.03em',
        }}>
          {t('title')}
        </h2>
        <p style={{ fontSize: 17, color: '#94a3b8', margin: '0 0 44px', lineHeight: 1.65 }}>
          {t('subtitle')}
        </p>

        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <LeadForm source="cta" />
        </div>

        {/* Trust line + acceso clientes */}
        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 28 }}>
          {t('trustLine')}
        </p>
        <p style={{ fontSize: 13, marginTop: 8 }}>
          <Link href="/login" style={{ color: '#00B5A8', textDecoration: 'none', fontWeight: 600 }}>
            {t('btnAccess')} →
          </Link>
        </p>
      </div>
    </section>
  )
}
