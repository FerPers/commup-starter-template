import { getTranslations } from 'next-intl/server'

export default async function IndustriesSection() {
  const t = await getTranslations('Landing.industries')

  const industries = [
    { key: 'og',         label: t('og'),         src: '/icons/3d/oil-gas.webp' },
    { key: 'renewables', label: t('renewables'),  src: '/icons/3d/renewables.webp' },
    { key: 'lng',        label: t('lng'),         src: '/icons/3d/lng.webp' },
    { key: 'offshore',   label: t('offshore'),    src: '/icons/3d/offshore.webp' },
    { key: 'mining',     label: t('mining'),      src: '/icons/3d/mining.webp' },
    { key: 'industrial', label: t('industrial'),  src: '/icons/3d/industrial.webp' },
    { key: 'refining',   label: t('refining'),    src: '/icons/3d/refining.webp' },
  ]

  return (
    <section id="industries" style={{
      background: '#FFFFFF',
      padding: '100px 24px',
      borderTop: '1px solid #E9EDF1',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
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
          {industries.map(({ key, label, src }) => (
            <div key={key} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 16, padding: '32px 24px',
              background: '#FFFFFF',
              border: '1px solid #E9EDF1',
              boxShadow: '0 2px 8px rgba(11,29,58,0.06)',
              borderRadius: 16,
              transition: 'border-color 0.2s, background 0.2s',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src} width={112} height={112} alt="" loading="lazy"
                style={{ width: 112, height: 112, borderRadius: 20, border: '1px solid #E9EDF1', objectFit: 'cover', display: 'block' }}
              />
              <span style={{
                fontSize: 16, fontWeight: 700, color: '#0B1D3A',
                textAlign: 'center', lineHeight: 1.3,
              }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
