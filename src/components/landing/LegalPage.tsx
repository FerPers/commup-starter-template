import Link from 'next/link'

export type LegalSection = { heading: string; body: string[] }

/**
 * Layout compartido de /privacy y /terms — páginas públicas referenciadas
 * desde el footer del landing.
 */
export default function LegalPage({ title, updated, sections, backLabel }: {
  title: string
  updated: string
  sections: LegalSection[]
  backLabel: string
}) {
  return (
    <div style={{ background: '#FFFFFF', minHeight: '100vh', color: '#0B1D3A' }}>
      <header style={{ background: '#0B1D3A', padding: '20px 24px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/isotipo-white.png" height={30} alt="" aria-hidden="true" style={{ display: 'block', height: 30, width: 'auto' }} />
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, color: '#FFFFFF' }}>
              Comm<span style={{ color: '#F47A20' }}>UP</span>
            </span>
          </Link>
          <Link href="/" style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'none' }}>
            ← {backLabel}
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '56px 24px 80px' }}>
        <h1 style={{ fontSize: 'clamp(26px, 6vw, 34px)', fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
          {title}
        </h1>
        <p style={{ fontSize: 13, color: '#64707C', margin: '0 0 40px' }}>{updated}</p>

        {sections.map(({ heading, body }) => (
          <section key={heading} style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 10px' }}>{heading}</h2>
            {body.map((p, i) => (
              <p key={i} style={{ fontSize: 15, color: '#3D4854', lineHeight: 1.75, margin: '0 0 10px' }}>{p}</p>
            ))}
          </section>
        ))}

        <p style={{ fontSize: 14, color: '#64707C', marginTop: 48, borderTop: '1px solid #E9EDF1', paddingTop: 24 }}>
          contacto@commup.app · commup.app
        </p>
      </main>
    </div>
  )
}
