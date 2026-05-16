import { getTranslations } from 'next-intl/server'
import { Smartphone, Cloud, Zap, ShieldCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export default async function DifferentiatorsSection() {
  const t = await getTranslations('Landing.differentiators')

  const items: { Icon: LucideIcon; title: string; desc: string; color: string; highlight: string }[] = [
    {
      Icon: Smartphone,
      title: t('nfcTitle'),
      desc: t('nfcDesc'),
      color: '#0B1D3A',
      highlight: 'NFC + QR',
    },
    {
      Icon: Cloud,
      title: t('cloudTitle'),
      desc: t('cloudDesc'),
      color: '#0ea5e9',
      highlight: 'Zero-install',
    },
    {
      Icon: Zap,
      title: t('realtimeTitle'),
      desc: t('realtimeDesc'),
      color: '#10b981',
      highlight: 'Live',
    },
    {
      Icon: ShieldCheck,
      title: t('securityTitle'),
      desc: t('securityDesc'),
      color: '#f59e0b',
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
        <h2 style={{
          fontSize: 36, fontWeight: 800, color: '#0B1D3A',
          textAlign: 'center', margin: '0 0 56px', letterSpacing: '-0.02em',
        }}>
          {t('title')}
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>
          {items.map(({ Icon, title, desc, color, highlight }) => (
            <div key={title} style={{
              background: '#FFFFFF',
              border: '1px solid #E9EDF1',
              boxShadow: '0 2px 12px rgba(11,29,58,0.06)',
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
              }}>
                <Icon size={24} color={color} strokeWidth={1.75} />
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
