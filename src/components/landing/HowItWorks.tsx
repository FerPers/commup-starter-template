import { getTranslations } from 'next-intl/server'

const STEP_SRCS = [
  '/icons/modules/01-tag-register.svg',
  '/icons/modules/13-qr-nfc-scan.svg',
  '/icons/modules/04-itr.svg',
  '/icons/modules/06-certificates.svg',
  '/icons/modules/09-dossier.svg',
]

export default async function HowItWorks() {
  const t = await getTranslations('Landing.howItWorks')

  const steps = [
    { label: t('step1Label'), desc: t('step1Desc') },
    { label: t('step2Label'), desc: t('step2Desc') },
    { label: t('step3Label'), desc: t('step3Desc') },
    { label: t('step4Label'), desc: t('step4Desc') },
    { label: t('step5Label'), desc: t('step5Desc') },
  ]

  return (
    <section id="how-it-works" style={{
      padding: '100px 24px',
      borderTop: '1px solid rgba(255,255,255,0.05)',
      position: 'relative', overflow: 'hidden',
      backgroundImage: [
        'linear-gradient(to bottom, rgba(8,8,18,0.78) 0%, rgba(8,8,18,0.65) 50%, rgba(8,8,18,0.80) 100%)',
        'url(/images/how-it-works.webp)',
      ].join(', '),
      backgroundSize: 'auto, cover',
      backgroundPosition: 'center, center 30%',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        {/* Section label */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(0,181,168,0.15)', color: '#00B5A8',
            border: '1px solid rgba(0,181,168,0.35)',
            borderRadius: 20, padding: '5px 14px',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            {t('label')}
          </div>
        </div>

        <h2 style={{
          fontSize: 36, fontWeight: 800, color: '#f1f5f9',
          textAlign: 'center', margin: '0 0 64px', letterSpacing: '-0.02em',
        }}>
          {t('title')}
        </h2>

        <div style={{ position: 'relative' }}>
          {/* Connector line */}
          <div style={{
            position: 'absolute', top: 36, left: '10%', right: '10%', height: 2,
            background: 'linear-gradient(90deg, transparent, #00B5A8 20%, rgba(255,255,255,0.5) 50%, #00B5A8 80%, transparent)',
          }} className="how-connector" />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 24 }} className="how-grid">
            {steps.map(({ label, desc }, i) => {
              const src = STEP_SRCS[i]
              return (
                <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                  {/* Step card — white background so SVG strokes are always visible */}
                  <div style={{
                    width: 72, height: 72, borderRadius: 16,
                    background: '#FFFFFF',
                    border: '1px solid rgba(11,29,58,0.15)',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 20, position: 'relative', zIndex: 1,
                    flexShrink: 0,
                  }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} width={44} height={44} alt="" />
                    {/* Step number */}
                    <div style={{
                      position: 'absolute', top: -6, right: -6,
                      width: 22, height: 22, borderRadius: '50%',
                      background: '#0f172a', border: '2px solid #00B5A8',
                      color: '#fff', fontSize: 11, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {i + 1}
                    </div>
                  </div>

                  <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', margin: '0 0 8px' }}>
                    {label}
                  </h3>
                  <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
                    {desc}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
