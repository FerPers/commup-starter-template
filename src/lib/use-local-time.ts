'use client'

import { useSyncExternalStore } from 'react'
import { useLocale } from 'next-intl'
import { formatInZone } from '@/lib/time/zone'

const noopSubscribe = () => () => {}
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/**
 * S10 (E-15b): formatea instantes en la zona del navegador y con la zona visible («20:30 GMT-5»), la misma
 * en que trabajan los campos datetime-local. Durante el SSR y la hidratación usa UTC (rotulado): el
 * servidor corre en UTC y `toLocaleString()` con suppressHydrationWarning dejaba la hora UTC sin aviso.
 */
export function useLocalTime(): (iso: string | null | undefined) => string {
  const locale = useLocale()
  const zone = useSyncExternalStore(noopSubscribe, browserZone, () => 'UTC')
  return iso => (iso ? formatInZone(iso, zone, locale) : '')
}
