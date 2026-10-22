import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { scopeAllHref, type ScopedList } from '@/lib/list/scope'

// N2c («Maquetas N2»): una sola lista por objeto; el alcance se elige aquí (no hay entradas «Todos los…» en el menú).
export default async function ScopeToggle({ projectId, list, all, bare = false }: { projectId: string; list: ScopedList; all: boolean; /** Dentro de un contenedor que ya tiene márgenes (hubs). */ bare?: boolean }) {
  const t = await getTranslations('Scope')
  const seg = (on: boolean): React.CSSProperties => ({
    minHeight: 38, padding: '0 16px', display: 'inline-flex', alignItems: 'center', borderRadius: 8, textDecoration: 'none',
    fontSize: 'var(--text-sm)', fontWeight: 600, color: on ? 'var(--text-strong)' : 'var(--text-muted)',
    background: on ? 'var(--card-bg)' : 'transparent', boxShadow: on ? '0 1px 3px rgba(20,33,61,.15)' : 'none',
  })
  return (
    <div style={{ padding: bare ? '0 0 16px' : 'clamp(12px, 4vw, 32px) clamp(12px, 4vw, 32px) 0' }}>
    <div role="group" aria-label={t('label')} style={{ display: 'inline-flex', padding: 3, borderRadius: 10, background: 'var(--gray-100)' }}>
      <Link href={`/projects/${projectId}/${list}`} aria-current={!all ? 'page' : undefined} style={seg(!all)}>{t('project')}</Link>
      <Link href={scopeAllHref(projectId, list)} aria-current={all ? 'page' : undefined} style={seg(all)}>{t('all')}</Link>
    </div>
    </div>
  )
}
