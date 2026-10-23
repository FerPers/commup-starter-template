import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

/** N0 (H-05): 404 dentro del shell (menú y migas visibles), con salida a Mi trabajo y a Proyectos. */
export default async function DashboardNotFound() {
  const t = await getTranslations('Errors')
  return <ErrorCard title={t('notFoundTitle')} body={t('notFoundBody')} home={t('goMyWork')} projects={t('goProjects')} />
}

function ErrorCard({ title, body, home, projects, children }: { title: string; body: string; home: string; projects: string; children?: React.ReactNode }) {
  return (
    <div style={{ padding: '48px 16px', maxWidth: 560, margin: '0 auto' }}>
      <div style={{ background: 'var(--surface, var(--card-bg))', border: '1px solid var(--border)', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-strong)' }}>{title}</h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>{body}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {children}
          <Link href="/home" style={{ padding: '10px 16px', borderRadius: 8, background: 'var(--primary-600)', color: '#fff', fontWeight: 600, textDecoration: 'none' }}>{home}</Link>
          <Link href="/projects" style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text-strong)', fontWeight: 600, textDecoration: 'none' }}>{projects}</Link>
        </div>
      </div>
    </div>
  )
}
