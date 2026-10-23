import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getManual, publicManual, renderSection, sectionText } from '@/lib/help/manual'
import HelpSearch from '@/app/(dashboard)/ayuda/HelpSearch'

// N3b (decisión de Luis 2026-10-22): la guía pública es la versión pública del mismo manual por rol que alimenta
// /ayuda (sin las secciones internas). Reemplaza al HTML estático de la guía de arranque del 2-sep.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('PublicGuide')
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    robots: { index: true, follow: true },
  }
}

export default async function PublicGuidePage() {
  const t = await getTranslations('PublicGuide')
  const manual = publicManual(getManual())
  const ids = new Set(manual.sections.map(s => s.id))
  const href = (id: string) => (ids.has(id) ? `#s-${id}` : null)
  const label = (s: { id: string; title: string }) => `${/^\d+(\.\d+)?$/.test(s.id) ? `${s.id} ` : ''}${s.title}`
  const tops = manual.sections.filter(s => s.level === 2)

  return (
    <div className="help-public" style={{ background: '#FFFFFF', minHeight: '100vh', color: '#0B1D3A' }}>
      <header style={{ background: '#0B1D3A', padding: '20px 24px' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/isotipo-white.png" height={30} alt="" aria-hidden="true" style={{ display: 'block', height: 30, width: 'auto' }} />
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, color: '#FFFFFF' }}>
              Comm<span style={{ color: '#F47A20' }}>UP</span>
            </span>
          </Link>
          <nav style={{ display: 'flex', gap: 16, fontSize: 13 }}>
            <Link href="/" style={{ color: '#94a3b8', textDecoration: 'none' }}>← commup.app</Link>
            <Link href="/login" style={{ color: '#FFFFFF', textDecoration: 'none', fontWeight: 600 }}>{t('login')}</Link>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1160, margin: '0 auto', padding: '40px 24px 80px' }}>
        <h1 style={{ fontSize: 'clamp(26px, 6vw, 34px)', fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.02em' }}>{manual.title}</h1>
        <p style={{ fontSize: 13, color: '#64707C', margin: '0 0 32px' }}>
          {t('versionLine', { version: manual.version ?? '—' })}
        </p>

        <div className="help-layout">
          <aside aria-label={t('index')} className="help-index">
            <HelpSearch sections={manual.sections.map(s => ({ id: s.id, title: label(s), text: sectionText(s) }))} base="#s-" />
            <nav aria-label={t('chapters')} style={{ marginTop: 12 }}>
              {tops.map(s => (
                <a key={s.id} href={`#s-${s.id}`} style={{ display: 'block', padding: '6px 10px', borderRadius: 6, fontSize: 13, color: '#0B1D3A', textDecoration: 'none' }}>{label(s)}</a>
              ))}
            </nav>
          </aside>
          <article style={{ minWidth: 0 }}>
            {manual.sections.map(s => {
              const H = s.level === 2 ? 'h2' : 'h3'
              return (
                <section key={s.id} id={`s-${s.id}`} style={{ scrollMarginTop: 16, marginBottom: s.level === 2 ? 12 : 24 }}>
                  <H style={{ fontSize: s.level === 2 ? 24 : 18, fontWeight: 700, margin: s.level === 2 ? '32px 0 12px' : '20px 0 8px' }}>{label(s)}</H>
                  {/* Contenido del manual del repositorio, convertido y escapado en src/lib/help/markdown.ts */}
                  <div className="help-content" dangerouslySetInnerHTML={{ __html: renderSection(s, href) }} />
                </section>
              )
            })}
          </article>
        </div>

        <p style={{ fontSize: 14, color: '#64707C', marginTop: 48, borderTop: '1px solid #E9EDF1', paddingTop: 24 }}>
          contacto@commup.app · commup.app
        </p>
      </main>
    </div>
  )
}
