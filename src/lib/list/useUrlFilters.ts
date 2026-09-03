'use client'

import { useCallback, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

type Patch = Record<string, string | number | null | undefined>

/**
 * Filtros/orden/página en la URL (Sprint E): la página se recarga en servidor
 * con router.replace, así los enlaces son compartibles y el servidor pagina.
 */
export function useUrlFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const get = useCallback((key: string): string => sp.get(key) ?? '', [sp])

  const set = useCallback((patch: Patch, opts: { resetPage?: boolean } = {}) => {
    const next = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined || v === '') next.delete(k)
      else next.set(k, String(v))
    }
    if (opts.resetPage !== false) next.delete('page')
    const qs = next.toString()
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    })
  }, [sp, pathname, router])

  const clear = useCallback((keys: string[]) => {
    const patch: Patch = {}
    for (const k of keys) patch[k] = null
    set(patch)
  }, [set])

  return { get, set, clear, isPending }
}
