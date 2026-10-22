'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { NAV_STORAGE } from '@/lib/constants/navigation'
import { scopeAllHref, type ScopedList } from '@/lib/list/scope'

/**
 * N2c («Maquetas N2»): las listas globales (/itrs, /punch-list, /certificates, /work-plans, /preservation) son
 * ahora el alcance «Todos los proyectos» de la lista del proyecto. Sin `?project=` en la URL se abre desde el último
 * proyecto usado (el que recuerda el menú) o, si no hay, el primero; se conservan los filtros.
 */
export default function ScopeAllRedirect({ list, projectIds, query, emptyText }: {
  list: ScopedList
  projectIds: string[]
  query: string
  emptyText: string
}) {
  const router = useRouter()
  useEffect(() => {
    if (!projectIds.length) return
    let last: string | null = null
    try { last = window.localStorage.getItem(NAV_STORAGE.lastProject) } catch { /* sin almacenamiento */ }
    const pid = last && projectIds.includes(last) ? last : projectIds[0]
    router.replace(scopeAllHref(pid, list, new URLSearchParams(query)))
  }, [projectIds, list, query, router])
  return (
    <p role="status" style={{ padding: 32, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
      {projectIds.length ? '…' : emptyText}
    </p>
  )
}
