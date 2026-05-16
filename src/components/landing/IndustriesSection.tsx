import { getTranslations } from 'next-intl/server'
import { Flame, Wind, Factory, Anchor, Pickaxe, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const INDUSTRY_ICONS: LucideIcon[] = [Flame, Wind, Factory, Anchor, Pickaxe, Wrench]

export default async function IndustriesSection() {
  const t = await getTranslations('Landing.industries')

  const industries = [
    { key: 'og', label: t('og') },
    { key: 'renewables', label: t('renewables') },
    { key: 'lng', label: t('lng') },
    { key: 'offshore', label: t('offshore') },
    { key: 'mining', label: t('mining') },
    { key: 'industrial', label: t('industrial') },
  ]

  return (
    <section id="industries" style={{
      background: '#080810',
      padding: '80px 24px',
      borderTop: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <p style={{
          fontSize: 12, fontWeight: 600, color: '#475569',
          textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.1em',
          margin: '0 0 28px',
        }}>
          {t('title')}
        </p>

        <div style={{
          display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center',
        }}>
          {industries.map(({ key, label }, i) => {
            const Icon = INDUSTRY_ICONS[i]
            return (
              <div key={key} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 10, padding: '12px 20px',
                transition: 'border-color 0.2s, background 0.2s',
              }}>
                <Icon size={18} color="#7c3aed" strokeWidth={1.75} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>{label}</span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
