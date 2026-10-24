import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getActiveMembership } from '@/lib/supabase/membership'
import { ROLE_HELP, getManual, renderSection, sectionText } from '@/lib/help/manual'
import HelpSearch from './HelpSearch'

// N3b: ayuda dentro de la app, generada del manual por rol. Índice con «Tu rol» primero, buscador y una sección
// por vez (`?s=<id>`); el menú de usuario abre la sección de la pantalla donde estás («Ayuda de esta página»).
export default async function HelpPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const sp = await searchParams
  const t = await getTranslations('Help')
  const manual = getManual()
  const byId = new Map(manual.sections.map(s => [s.id, s]))
  const roleIds = (ROLE_HELP[ctx.role] ?? []).filter(id => byId.has(id))
  const current = byId.get(sp.s ?? '') ?? byId.get(roleIds[0] ?? '') ?? manual.sections[0]
  const href = (id: string) => (byId.has(id) ? `/ayuda?s=${encodeURIComponent(id)}` : null)
  const children = current.level === 2 ? manual.sections.filter(s => s.parent === current.id) : []
  const idx = manual.sections.indexOf(current)
  const prev = manual.sections[idx - 1]
  const next = manual.sections[idx + 1]
  const tops = manual.sections.filter(s => s.level === 2)
  const label = (id: string) => { const s = byId.get(id); return s ? `${/^\d+(\.\d+)?$/.test(s.id) ? `${s.id} ` : ''}${s.title}` : id }
  const navLink = (id: string, sub?: boolean) => (
    <Link key={id} href={href(id) ?? '/ayuda'} aria-current={id === current.id ? 'page' : undefined}
      style={{ display: 'block', padding: sub ? '5px 10px 5px 22px' : '6px 10px', borderRadius: 6, fontSize: sub ? 12 : 13, textDecoration: 'none',
        color: id === current.id ? 'var(--primary-700)' : 'var(--text-strong)', background: id === current.id ? 'var(--primary-50)' : 'transparent', fontWeight: id === current.id ? 600 : 400 }}>
      {label(id)}
    </Link>
  )

  return (
    <div style={{ padding: 'clamp(12px, 4vw, 28px) clamp(12px, 4vw, 32px)', maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('title')}</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 16px' }}>
        {t('subtitle', { version: manual.version ?? '—' })}
      </p>

      <div className="help-layout">
        <aside aria-label={t('index')} className="help-index">
          <HelpSearch sections={manual.sections.map(s => ({ id: s.id, title: label(s.id), text: sectionText(s) }))} />
          {roleIds.length > 0 && (
            <>
              <div style={sideLabel}>{t('yourRole', { role: t(`role.${ctx.role}`) })}</div>
              <nav aria-label={t('yourRoleNav')}>{roleIds.map(id => navLink(id))}</nav>
            </>
          )}
          <div style={sideLabel}>{t('manual')}</div>
          <nav aria-label={t('manualNav')}>
            {tops.map(s => (
              <div key={s.id}>
                {navLink(s.id)}
                {(current.id === s.id || current.parent === s.id) && manual.sections.filter(c => c.parent === s.id).map(c => navLink(c.id, true))}
              </div>
            ))}
          </nav>
        </aside>

        <article style={{ minWidth: 0 }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 'clamp(16px, 3vw, 28px)' }}>
            {current.parent && (
              <Link href={href(current.parent) ?? '/ayuda'} style={{ fontSize: 12, color: 'var(--primary-700)', textDecoration: 'none' }}>
                {label(current.parent)}
              </Link>
            )}
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-strong)', margin: '4px 0 12px' }}>{label(current.id)}</h2>
            {/* Contenido del manual del repositorio, convertido y escapado en src/lib/help/markdown.ts */}
            <div className="help-content" dangerouslySetInnerHTML={{ __html: renderSection(current, href) }} />
            {children.length > 0 && (
              <ul style={{ margin: '16px 0 0', paddingLeft: 18 }}>
                {children.map(c => <li key={c.id} style={{ margin: '4px 0' }}><Link href={href(c.id) ?? '/ayuda'} style={{ color: 'var(--primary-700)' }}>{label(c.id)}</Link></li>)}
              </ul>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 12, flexWrap: 'wrap', fontSize: 13 }}>
            {prev ? <Link href={href(prev.id) ?? '/ayuda'} style={{ color: 'var(--primary-700)', textDecoration: 'none' }}>← {label(prev.id)}</Link> : <span />}
            {next && <Link href={href(next.id) ?? '/ayuda'} style={{ color: 'var(--primary-700)', textDecoration: 'none' }}>{label(next.id)} →</Link>}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16 }}>{t('pageHelpHint')}</p>
        </article>
      </div>
    </div>
  )
}

const sideLabel: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: '.05em', color: 'var(--text-muted)', margin: '14px 10px 6px', textTransform: 'uppercase' }
