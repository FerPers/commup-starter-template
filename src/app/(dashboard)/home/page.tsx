import { redirect } from 'next/navigation'
import { getActiveMembership } from '@/lib/supabase/membership'
import { homeForRole } from '@/lib/constants/navigation'

/**
 * Punto de entrada tras login: decide el inicio según el rol
 * (inspector/leader → «Mi trabajo»; el resto → Dashboard). Nunca renderiza.
 */
export default async function HomePage() {
  const ctx = await getActiveMembership()
  redirect(homeForRole(ctx?.role))
}
