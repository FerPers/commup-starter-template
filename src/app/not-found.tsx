import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

/** N0 (H-04/H-05): 404 de rutas que no existen (fuera del dashboard), con salida al inicio. */
export default async function RootNotFound() {
  const t = await getTranslations('Errors')
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'var(--bg, #f8fafc)' }}>
      <div style={{ maxWidth: 480, background: 'var(--surface, #fff)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{t('notFoundTitle')}</h1>
        <p style={{ margin: 0, color: 'var(--text-muted, #64748b)', fontSize: 14 }}>{t('pageMissing')}</p>
        <Link href="/home" style={{ alignSelf: 'flex-start', padding: '10px 16px', borderRadius: 8, background: '#4f46e5', color: '#fff', fontWeight: 600, textDecoration: 'none' }}>{t('goHome')}</Link>
      </div>
    </main>
  )
}
