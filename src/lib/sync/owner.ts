'use client'

import { createClient } from '@/lib/supabase/client'

/**
 * S18: usuario en sesión en este dispositivo, sin red (getSession lee la sesión guardada localmente).
 * null si no hay sesión: lo encolado así queda «sin autor» y exige confirmación antes de enviarse.
 */
export async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await createClient().auth.getSession()
    return data.session?.user.id ?? null
  } catch {
    return null
  }
}
