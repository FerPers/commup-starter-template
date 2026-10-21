'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { NAV_STORAGE } from '@/lib/constants/navigation'

/**
 * S23 (H-12): Control Tower recuerda el proyecto (igual que el sidebar). Sin `projectId` en la URL abre el último
 * proyecto visitado en vez del primero por código; con la URL, ese pasa a ser el último.
 */
export default function RememberProject({ projectId, fromUrl }: { projectId: string; fromUrl: boolean }) {
  const router = useRouter()
  useEffect(() => {
    let last: string | null = null
    try { last = window.localStorage.getItem(NAV_STORAGE.lastProject) } catch { /* sin almacenamiento */ }
    if (!fromUrl && last && last !== projectId) {
      router.replace(`/control-tower?projectId=${encodeURIComponent(last)}`)
      return
    }
    try { window.localStorage.setItem(NAV_STORAGE.lastProject, projectId) } catch { /* sin almacenamiento */ }
  }, [projectId, fromUrl, router])
  return null
}
