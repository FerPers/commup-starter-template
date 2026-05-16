import { getTranslations } from 'next-intl/server'
import { Tag, QrCode, ClipboardCheck, FileCheck2, FolderArchive } from 'lucide-react'

const STEP_ICONS = [Tag, QrCode, ClipboardCheck, FileCheck2, FolderArchive]
const STEP_COLORS = ['#0B1D3A', '#0e3561', '#005A8D', '#00B5A8', '#009e92']

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
    <section style={{
      padding: '100px 24px',
      borderTop: '1px solid rgba(255,255,255,0.05)',
      position: 'relative', overflow: 'hidden',
      backgroundImage: [
        'linear-gradient(to bottom, rgba(8,8,18,0.78) 0%, rgba(8,8,18,0.65) 50%, rgba(8,8,18,0.80) 100%)',
        'url(/images/how-it-works.jpg)',
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
            position: 'absolute', top: 36, left: '10%', right: '10%', height: 2,
            background: 'linear-gradient(90deg, #0B1D3A, #00B5A8)',
            opacity: 0.5,
          }} className="how-connector" />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 24 }} className="how-grid">
            {steps.map(({ label, desc }, i) => {
              const Icon = STEP_ICONS[i]
              const color = STEP_COLORS[i]
              return (
                <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                  {/* Step circle — solid background so icon always reads */}
                  <div style={{
                    width: 72, height: 72, borderRadius: '50%',
                    background: color,
                    boxShadow: `0 0 24px ${color}66`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 20, position: 'relative', zIndex: 1,
                    flexShrink: 0,
                  }}>
                    <Icon size={28} color="#fff" strokeWidth={1.75} />
                    {/* Step number */}
                    <div style={{
                      position: 'absolute', top: -6, right: -6,
                      width: 22, height: 22, borderRadius: '50%',
                      background: '#0f172a', border: `2px solid ${color}`,
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
