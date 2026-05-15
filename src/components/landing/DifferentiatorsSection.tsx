import { getTranslations } from 'next-intl/server'

export default async function DifferentiatorsSection() {
  const t = await getTranslations('Landing.differentiators')

  const items = [
    {
      icon: '📱',
      title: t('nfcTitle'),
      desc: t('nfcDesc'),
      color: '#7c3aed',
      highlight: 'NFC + QR',
    },
    {
      icon: '☁️',
      title: t('cloudTitle'),
      desc: t('cloudDesc'),
      color: '#0ea5e9',
      highlight: 'Zero-install',
    },
    {
      icon: '⚡',
      title: t('realtimeTitle'),
      desc: t('realtimeDesc'),
      color: '#10b981',
      highlight: 'Live',
    },
    {
      icon: '🔒',
      title: t('securityTitle'),
      desc: t('securityDesc'),
      color: '#f59e0b',
      highlight: 'RLS',
    },
  ]

  return (
    <section style={{
      background: '#0a0a14',
      padding: '100px 24px',
      borderTop: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h2 style={{
          fontSize: 36, fontWeight: 800, color: '#f1f5f9',
          textAlign: 'center', margin: '0 0 56px', letterSpacing: '-0.02em',
        }}>
          {t('title')}
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>
          {items.map(({ icon, title, desc, color, highlight }) => (
            <div key={title} style={{
              background: '#0d0d1a',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 16, padding: 28,
              display: 'flex', flexDirection: 'column', gap: 16,
              transition: 'border-color 0.2s',
            }}>
              {/* Icon circle */}
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: `${color}18`,
                border: `1px solid ${color}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24,
              }}>
                {icon}
              </div>

              {/* Highlight badge */}
              <div style={{
                display: 'inline-flex', alignItems: 'center',
                background: `${color}15`, color,
                border: `1px solid ${color}30`,
                borderRadius: 6, padding: '3px 10px',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
                alignSelf: 'flex-start',
              }}>
                {highlight}
              </div>

              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', margin: '0 0 8px' }}>
                  {title}
                </h3>
                <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.65, margin: 0 }}>
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
