import { getTranslations } from 'next-intl/server'

export default async function ProblemSection() {
  const t = await getTranslations('Landing.problem')

  const cards = [
    {
      icon: '📋',
      title: t('card1Title'),
      desc: t('card1Desc'),
      accent: '#ef4444',
    },
    {
      icon: '📊',
      title: t('card2Title'),
      desc: t('card2Desc'),
      accent: '#f59e0b',
    },
    {
      icon: '🔍',
      title: t('card3Title'),
      desc: t('card3Desc'),
      accent: '#7c3aed',
    },
  ]

  return (
    <section id="features" style={{
      padding: '100px 24px',
      borderTop: '1px solid rgba(255,255,255,0.05)',
      position: 'relative',
      backgroundImage: [
        'linear-gradient(to bottom, rgba(6,4,14,0.82) 0%, rgba(6,4,14,0.65) 50%, rgba(6,4,14,0.82) 100%)',
        'url(/images/lng-plant.jpg)',
      ].join(', '),
      backgroundSize: 'auto, cover',
      backgroundPosition: 'center, center 40%',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h2 style={{
          fontSize: 36, fontWeight: 800, color: '#f1f5f9',
          textAlign: 'center', margin: '0 0 56px', letterSpacing: '-0.02em',
        }}>
          {t('title')}
        </h2>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24,
        }}>
          {cards.map(({ icon, title, desc, accent }) => (
            <div key={title} style={{
              background: 'rgba(8,6,20,0.82)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 16, padding: 28,
              position: 'relative', overflow: 'hidden',
            }}>
              {/* Top accent line */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                background: `linear-gradient(90deg, ${accent}, transparent)`,
              }} />

              <div style={{ fontSize: 36, marginBottom: 16 }}>{icon}</div>
              <h3 style={{
                fontSize: 17, fontWeight: 700, color: '#e2e8f0',
                margin: '0 0 10px', lineHeight: 1.4,
              }}>
                {title}
              </h3>
              <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.65, margin: 0 }}>
                {desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
