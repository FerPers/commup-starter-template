'use client'

import { useSyncExternalStore } from 'react'

const noopSubscribe = () => () => {}
const localToday = () => new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD en la zona del navegador

/**
 * Fecha local del navegador (YYYY-MM-DD), o null durante el SSR y la hidratación: el servidor corre en
 * UTC y otro día haría fallar la hidratación (en Colombia, desde las 19:00). Tras hidratar, React vuelve
 * a renderizar con la fecha local.
 */
export function useLocalToday(): string | null {
  return useSyncExternalStore(noopSubscribe, localToday, () => null)
}
