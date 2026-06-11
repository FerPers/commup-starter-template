import { getTranslations } from 'next-intl/server'

export default async function PricingSection() {
  const t = await getTranslations('Landing.pricing')

  return (
    <section id="pricing" style={{
      padding: '100px 24px',
      borderTop: '1px solid #E9EDF1',
      background: '#FFFFFF',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
        {/* Section label */}
        <div style={{ marginBottom: 16 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(0,181,168,0.10)', color: '#00B5A8',
            border: '1px solid rgba(0,181,168,0.25)',
            borderRadius: 20, padding: '5px 14px',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            {t('label')}
          </div>
        </div>

        <h2 style={{
          fontSize: 'clamp(28px, 7vw, 36px)', fontWeight: 800, color: '#0B1D3A',
          margin: '0 0 16px', letterSpacing: '-0.02em',
        }}>
          {t('title')}
        </h2>

        <p style={{ fontSize: 16, color: '#64707C', lineHeight: 1.7, margin: '0 0 36px' }}>
          {t('subtitle')}
        </p>

        <a
          href="#contact"
          style={{
            background: 'linear-gradient(135deg, #ea580c, #dc2626)',
            color: '#fff', borderRadius: 10,
            padding: '13px 26px', fontSize: 15, fontWeight: 600,
            textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 24px rgba(234,88,12,0.4)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
        >
          {t('cta')} →
        </a>

        <div style={{ fontSize: 13, color: '#64707C', marginTop: 20 }}>
          {t('trustLine')}
        </div>
      </div>
    </section>
  )
}
