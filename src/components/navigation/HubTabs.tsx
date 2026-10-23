import Link from 'next/link'

/**
 * N2c (H-18): pestañas de un hub basadas en RUTA (cada una se enlaza, el «atrás» funciona y se recarga solo lo suyo).
 * El título del hub es el h1 (= etiqueta del menú); cada subpágina titula su contenido con h2.
 */
export type HubTab = { key: string; href: string; label: string; count?: number | null }

export default function HubTabs({ title, tabs, current, aside }: { title: string; tabs: HubTab[]; current: string; aside?: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: '-0.5px', margin: 0, flex: '1 1 260px' }}>{title}</h1>
        {aside}
      </div>
      <nav aria-label={title} style={{ display: 'flex', gap: 2, flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
        {tabs.map(tab => {
          const active = tab.key === current
          return (
            <Link key={tab.key} href={tab.href} aria-current={active ? 'page' : undefined}
              style={{
                minHeight: 44, padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none',
                fontSize: 'var(--text-sm)', fontWeight: active ? 700 : 500, color: active ? 'var(--text-strong)' : 'var(--text-muted)',
                borderBottom: `3px solid ${active ? 'var(--brand-orange)' : 'transparent'}`, marginBottom: -1,
              }}>
              {tab.label}
              {tab.count != null && <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>{tab.count}</span>}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
