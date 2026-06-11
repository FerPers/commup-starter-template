import { getTranslations } from 'next-intl/server'

export default async function DifferentiatorsSection() {
  const t = await getTranslations('Landing.differentiators')

  const items: { src: string; title: string; desc: string; highlight: string }[] = [
    {
      src: '/icons/3d/nfc-tag.webp',
      title: t('nfcTitle'),
      desc: t('nfcDesc'),
      highlight: 'NFC + QR',
    },
    {
      src: '/icons/3d/cloud.webp',
      title: t('cloudTitle'),
      desc: t('cloudDesc'),
      highlight: 'Zero-install',
    },
    {
      src: '/icons/3d/kpi-dashboard.webp',
      title: t('realtimeTitle'),
      desc: t('realtimeDesc'),
      highlight: 'Live',
    },
    {
      src: '/icons/3d/multi-tenant.webp',
      title: t('securityTitle'),
      desc: t('securityDesc'),
      highlight: 'Enterprise',
    },
  ]

  return (
    <section style={{
      background: '#F8FAFC',
      padding: '100px 24px',
      borderTop: '1px solid #E9EDF1',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
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
          textAlign: 'center', margin: '0 0 56px', letterSpacing: '-0.02em',
        }}>
          {t('title')}
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>
          {items.map(({ src, title, desc, highlight }) => (
            <div key={title} style={{
              background: '#FFFFFF',
              border: '1px solid #E9EDF1',
              boxShadow: '0 2px 12px rgba(11,29,58,0.06)',
              borderRadius: 16, padding: 28,
              display: 'flex', flexDirection: 'column', gap: 16,
              transition: 'border-color 0.2s',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src} width={88} height={88} alt="" loading="lazy"
                style={{
                  width: 88, height: 88, borderRadius: 20, objectFit: 'cover', display: 'block',
                  border: '1px solid rgba(0,181,168,0.20)',
                }}
              />

              {/* Highlight badge */}
              <div style={{
                display: 'inline-flex', alignItems: 'center',
                background: 'rgba(0,181,168,0.10)', color: '#00B5A8',
                border: '1px solid rgba(0,181,168,0.25)',
                borderRadius: 6, padding: '3px 10px',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
                alignSelf: 'flex-start',
              }}>
                {highlight}
              </div>

              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0B1D3A', margin: '0 0 8px' }}>
                  {title}
                </h3>
                <p style={{ fontSize: 14, color: '#64707C', lineHeight: 1.65, margin: 0 }}>
                  {desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
