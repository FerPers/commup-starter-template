import { getTranslations } from 'next-intl/server'
import type { AccessFail } from '@/lib/auth/access'
import { assignmentDbErrorKey } from '@/lib/itr/signatures'

/**
 * V3: los errores de las acciones salen traducidos del servidor (namespace `ActionErrors`, idioma de quien llama).
 * Las acciones declaran `const t = await getTranslations('ActionErrors')` para que `keys.test` revise sus claves;
 * aquí viven solo las traducciones compartidas.
 */

/** Falla de un guard de `src/lib/auth/access.ts` en el idioma del usuario (la API v1 sigue con `fail.error`). */
export async function accessError(fail: AccessFail): Promise<string> {
  const t = await getTranslations('ActionErrors')
  return fail.reason === 'not_found' ? t('access.notFound', { resource: fail.resource }) : t('access.invalid', { resource: fail.resource })
}

/** Error de la BD al asignar firmantes de un ITR, en el idioma del usuario (lo desconocido sale tal cual). */
export async function assignmentDbError(message: string): Promise<string> {
  const key = assignmentDbErrorKey(message)
  if (!key) return message
  const t = await getTranslations('ActionErrors')
  return t(`itrAssign.${key}`)
}
