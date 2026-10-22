import { redirect } from 'next/navigation'
import { getActiveMembership } from '@/lib/supabase/membership'
import { homeForRole } from '@/lib/constants/navigation'

/**
 * Punto de entrada tras login: decide el inicio según el rol
 * (inspector/leader → «Mi trabajo»; el resto → Dashboard). Nunca renderiza.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const ctx = await getActiveMembership()
  // N0 (H-23): el aviso de un rebote por permisos viaja hasta el inicio del rol.
  const { denied } = await searchParams
  const tier = denied && /^(admin|privileged|editor)$/.test(denied) ? `?denied=${denied}` : ''
  redirect(`${homeForRole(ctx?.role)}${tier}`)
}
