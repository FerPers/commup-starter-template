import { getTranslations } from 'next-intl/server'
import { ClipboardList, AlertOctagon, BarChart2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export default async function SocialProofSection() {
  const t = await getTranslations('Landing.socialProof')

  const scenarios: { Icon: LucideIcon; color: string; title: string; desc: string; module: string }[] = [
    {
      Icon: ClipboardList,
      color: '#0B1D3A',
      title: t('s1Title'),
      desc: t('s1Desc'),
      module: t('s1Module'),
    },
    {
      Icon: AlertOctagon,
      color: '#ef4444',
      title: t('s2Title'),
      desc: t('s2Desc'),
      module: t('s2Module'),
    },
    {
      Icon: BarChart2,
      color: '#10b981',
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
          {scenarios.map(({ Icon, color, title, desc, module }) => (
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
              {/* Icon */}
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: `${color}18`,
                border: `1px solid ${color}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Icon size={24} color={color} strokeWidth={1.75} />
              </div>

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
                background: `${color}15`, color,
                border: `1px solid ${color}30`,
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
