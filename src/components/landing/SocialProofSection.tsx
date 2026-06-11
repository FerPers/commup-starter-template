import { getTranslations } from 'next-intl/server'

export default async function SocialProofSection() {
  const t = await getTranslations('Landing.socialProof')

  const scenarios: { src: string; color: string; title: string; desc: string; module: string }[] = [
    {
      src: '/icons/3d/saas-tablet.webp',
      color: '#0B1D3A',
      title: t('s1Title'),
      desc: t('s1Desc'),
      module: t('s1Module'),
    },
    {
      src: '/icons/3d/certificate-rejected.webp',
      color: '#FF8A00',
      title: t('s2Title'),
      desc: t('s2Desc'),
      module: t('s2Module'),
    },
    {
      src: '/icons/3d/kpi-console.webp',
      color: '#00B5A8',
      title: t('s3Title'),
      desc: t('s3Desc'),
      module: t('s3Module'),
    },
  ]

  return (
    <section style={{
      background: '#F8FAFC',
      padding: '100px 24px',
      borderTop: '1px solid #E9EDF1',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Section label */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
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
          fontSize: 36, fontWeight: 800, color: '#0B1D3A',
          textAlign: 'center', margin: '0 0 64px', letterSpacing: '-0.02em',
        }}>
          {t('title')}
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 24,
        }} className="testimonials-grid">
          {scenarios.map(({ src, color, title, desc, module }) => (
            <div key={title} style={{
              background: '#FFFFFF',
              border: '1px solid #E9EDF1',
              boxShadow: '0 2px 12px rgba(11,29,58,0.06)',
              borderRadius: 16,
              padding: 28,
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src} width={88} height={88} alt="" loading="lazy"
                style={{
                  width: 88, height: 88, borderRadius: 20, objectFit: 'cover', display: 'block',
                  border: `1px solid ${color}25`, flexShrink: 0,
                }}
              />

              {/* Title */}
              <h3 style={{
                fontSize: 16, fontWeight: 700, color: '#0B1D3A',
                margin: 0, lineHeight: 1.4,
              }}>
                {title}
              </h3>

              {/* Description */}
              <p style={{
                fontSize: 14, color: '#64707C', lineHeight: 1.7,
                margin: 0, flex: 1,
              }}>
                {desc}
              </p>

              {/* Module badge */}
              <div style={{
                display: 'inline-flex', alignItems: 'center',
                background: `${color}12`, color,
                border: `1px solid ${color}25`,
                borderRadius: 6, padding: '4px 10px',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                alignSelf: 'flex-start',
              }}>
                {module}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
