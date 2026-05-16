import { getTranslations } from 'next-intl/server'

export default async function ProblemSection() {
  const t = await getTranslations('Landing.problem')

  const cards: { src: string; title: string; desc: string; accent: string }[] = [
    {
      src: '/icons/modules/04-itr.svg',
      title: t('card1Title'),
      desc: t('card1Desc'),
      accent: '#0B1D3A',
    },
    {
      src: '/icons/modules/05-punch-list.svg',
      title: t('card2Title'),
      desc: t('card2Desc'),
      accent: '#FF8A00',
    },
    {
      src: '/icons/modules/14-audit-trail.svg',
      title: t('card3Title'),
      desc: t('card3Desc'),
      accent: '#00B5A8',
    },
  ]

  return (
    <section id="features" style={{
      padding: '100px 24px',
      borderTop: '1px solid #E9EDF1',
      background: '#F8FAFC',
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
              CARACTERÍSTICAS
          </div>
        </div>

        <h2 style={{
          fontSize: 36, fontWeight: 800, color: '#0B1D3A',
          textAlign: 'center', margin: '0 0 56px', letterSpacing: '-0.02em',
        }}>
          {t('title')}
        </h2>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24,
        }}>
          {cards.map(({ src, title, desc, accent }) => (
            <div key={title} style={{
              background: '#FFFFFF',
              border: '1px solid #E9EDF1',
              boxShadow: '0 2px 12px rgba(11,29,58,0.06)',
              borderRadius: 16, padding: 28,
              position: 'relative', overflow: 'hidden',
            }}>
              {/* Top accent line */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                background: `linear-gradient(90deg, ${accent}, transparent)`,
              }} />

              <div style={{
                width: 88, height: 88, borderRadius: 20,
                background: `${accent}12`, border: `1px solid ${accent}25`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 16,
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} width={60} height={60} alt="" />
              </div>
              <h3 style={{
                fontSize: 17, fontWeight: 700, color: '#0B1D3A',
                margin: '0 0 10px', lineHeight: 1.4,
              }}>
                {title}
              </h3>
              <p style={{ fontSize: 14, color: '#64707C', lineHeight: 1.65, margin: 0 }}>
                {desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
