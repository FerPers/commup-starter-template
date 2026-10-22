import { redirect } from 'next/navigation'

/** Niveles de rol que piden las páginas (= ROLE_TIERS); van en `/home?denied=` para explicar el rebote. */
export type DeniedTier = 'admin' | 'privileged' | 'editor'

/**
 * N0 (H-23): rebote por rol con explicación. En vez de un `redirect('/dashboard')` silencioso, el usuario llega a su
 * inicio con un aviso de qué rol pide la página.
 */
export function denyAccess(tier: DeniedTier): never {
  redirect(`/home?denied=${tier}`)
}
