import { getTranslations } from 'next-intl/server'
import { Flame, Wind, Factory, Anchor, Pickaxe, Wrench, FlaskConical } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const INDUSTRY_ICONS: LucideIcon[] = [Flame, Wind, Factory, Anchor, Pickaxe, Wrench, FlaskConical]
const INDUSTRY_COLORS = ['#f59e0b', '#10b981', '#0ea5e9', '#6366f1', '#f97316', '#0B1D3A', '#06b6d4']

export default async function IndustriesSection() {
  const t = await getTranslations('Landing.industries')

  const industries = [
    { key: 'og', label: t('og') },
    { key: 'renewables', label: t('renewables') },
    { key: 'lng', label: t('lng') },
    { key: 'offshore', label: t('offshore') },
    { key: 'mining', label: t('mining') },
    { key: 'industrial', label: t('industrial') },
    { key: 'refining', label: t('refining') },
  ]

  return (
    <section id="industries" style={{
      background: '#FFFFFF',
      padding: '100px 24px',
      borderTop: '1px solid #E9EDF1',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{
          fontSize: 36, fontWeight: 800, color: '#0B1D3A',
          textAlign: 'center', margin: '0 0 16px', letterSpacing: '-0.02em',
        }}>
          {t('title')}
        </h2>
        <p style={{
          fontSize: 16, color: '#64707C', textAlign: 'center',
          margin: '0 0 64px', lineHeight: 1.6,
        }}>
          Oil &amp; Gas · LNG · Refinación · Renovables · Offshore · Minería · Industria
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 20,
        }} className="industries-grid">
          {industries.map(({ key, label }, i) => {
            const Icon = INDUSTRY_ICONS[i]
            const color = INDUSTRY_COLORS[i]
            return (
              <div key={key} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 16, padding: '32px 24px',
                background: '#FFFFFF',
                border: '1px solid #E9EDF1',
                boxShadow: '0 2px 8px rgba(11,29,58,0.06)',
                borderRadius: 16,
                transition: 'border-color 0.2s, background 0.2s',
              }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 18,
                  background: `${color}18`,
                  border: `1px solid ${color}35`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={28} color={color} strokeWidth={1.75} />
                </div>
                <span style={{
                  fontSize: 16, fontWeight: 700, color: '#0B1D3A',
                  textAlign: 'center', lineHeight: 1.3,
                }}>
                  {label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
