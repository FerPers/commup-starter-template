'use client'

import { useTranslations } from 'next-intl'

/**
 * Nombre de una persona con sufijo «(inactivo)» cuando ya no pertenece a la org.
 * El cálculo de `inactive` vive en el llamador (ver src/lib/people/inactive.ts);
 * aquí solo se pinta. Hereda color y tamaño del contenedor.
 */
export interface PersonNameProps {
  name: string | null | undefined
  inactive?: boolean
  /** Texto cuando no hay nombre (por defecto «—»). */
  fallback?: React.ReactNode
}

export function PersonName({ name, inactive = false, fallback = '—' }: PersonNameProps) {
  const tc = useTranslations('Common')
  if (!name) return <>{fallback}</>
  if (!inactive) return <>{name}</>
  return (
    <span title={tc('inactiveTitle')}>
      {name}
      <span style={{ marginLeft: 4, opacity: 0.7, fontStyle: 'italic', fontWeight: 400 }}>{tc('inactive')}</span>
    </span>
  )
}
