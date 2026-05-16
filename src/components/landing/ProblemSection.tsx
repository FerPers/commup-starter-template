import { getTranslations } from 'next-intl/server'
import { FolderOpen, ListX, AlertOctagon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export default async function ProblemSection() {
  const t = await getTranslations('Landing.problem')

  const cards: { Icon: LucideIcon; title: string; desc: string; accent: string }[] = [
    {
      Icon: FolderOpen,
      title: t('card1Title'),
      desc: t('card1Desc'),
      accent: '#ef4444',
    },
    {
      Icon: ListX,
      title: t('card2Title'),
      desc: t('card2Desc'),
      accent: '#f59e0b',
    },
    {
      Icon: AlertOctagon,
      title: t('card3Title'),
      desc: t('card3Desc'),
      accent: '#0B1D3A',
    },
  ]

  return (
    <section id="features" style={{
      padding: '100px 24px',
      borderTop: '1px solid #E9EDF1',
      background: '#F8FAFC',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h2 style={{
          fontSize: 36, fontWeight: 800, color: '#0B1D3A',
          textAlign: 'center', margin: '0 0 56px', letterSpacing: '-0.02em',
        }}>
          {t('title')}
        </h2>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24,
        }}>
          {cards.map(({ Icon, title, desc, accent }) => (
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
                width: 52, height: 52, borderRadius: 14,
                background: `${accent}12`, border: `1px solid ${accent}25`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 16,
              }}>
                <Icon size={26} color={accent} strokeWidth={1.75} />
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
