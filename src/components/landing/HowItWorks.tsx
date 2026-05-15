import { getTranslations } from 'next-intl/server'

export default async function HowItWorks() {
  const t = await getTranslations('Landing.howItWorks')

  const steps = [
    { icon: '🏷️', label: t('step1Label'), desc: t('step1Desc'), color: '#7c3aed' },
    { icon: '📱', label: t('step2Label'), desc: t('step2Desc'), color: '#6d28d9' },
    { icon: '✅', label: t('step3Label'), desc: t('step3Desc'), color: '#5b21b6' },
    { icon: '📄', label: t('step4Label'), desc: t('step4Desc'), color: '#4c1d95' },
  ]

  return (
    <section style={{
      padding: '100px 24px',
      borderTop: '1px solid rgba(255,255,255,0.05)',
      position: 'relative', overflow: 'hidden',
      backgroundImage: [
        'linear-gradient(to bottom, rgba(8,8,18,0.78) 0%, rgba(8,8,18,0.65) 50%, rgba(8,8,18,0.80) 100%)',
        'url(https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=1920&q=80&auto=format&fit=crop)',
      ].join(', '),
      backgroundSize: 'auto, cover',
      backgroundPosition: 'center, center 30%',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <h2 style={{
          fontSize: 36, fontWeight: 800, color: '#f1f5f9',
          textAlign: 'center', margin: '0 0 64px', letterSpacing: '-0.02em',
        }}>
          {t('title')}
        </h2>

        <div style={{ position: 'relative' }}>
          {/* Connector line */}
          <div style={{
            position: 'absolute', top: 36, left: '12.5%', right: '12.5%', height: 2,
            background: 'linear-gradient(90deg, #7c3aed, #4c1d95)',
            opacity: 0.3,
          }} className="how-connector" />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }} className="how-grid">
            {steps.map(({ icon, label, desc, color }, i) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                {/* Step circle */}
                <div style={{
                  width: 72, height: 72, borderRadius: '50%',
                  background: `${color}22`,
                  border: `2px solid ${color}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, marginBottom: 20, position: 'relative', zIndex: 1,
                  flexShrink: 0,
                }}>
                  {icon}
                  {/* Step number */}
                  <div style={{
                    position: 'absolute', top: -6, right: -6,
                    width: 22, height: 22, borderRadius: '50%',
                    background: color, color: '#fff',
                    fontSize: 11, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {i + 1}
                  </div>
                </div>

                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', margin: '0 0 8px' }}>
                  {label}
                </h3>
                <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, margin: 0 }}>
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
