'use client'

import { useEffect } from 'react'
import { rememberRecent } from './CommandPalette'
import type { RecentItem } from '@/lib/search/catalog'

// N3a: las fichas (tag, sistema, punch, ITR, documento, gestión diaria…) se anotan en los «recientes» de ⌘K al abrirse.
// La prop es `code` y no `ref` (en React 19 `ref` es reservada).
export default function RememberRecent({ kind, code, title, href, projectCode }: Omit<RecentItem, 'ref'> & { code: string }) {
  useEffect(() => { rememberRecent({ kind, ref: code, title, href, projectCode }) }, [kind, code, title, href, projectCode])
  return null
}
