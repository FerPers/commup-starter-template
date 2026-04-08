'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function setLocale(locale: 'es' | 'en') {
  const cookieStore = await cookies()
  cookieStore.set('locale', locale, { path: '/', maxAge: 60 * 60 * 24 * 365 })

  // Best-effort: update profile if authenticated
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('profiles').update({ locale }).eq('id', user.id)
    }
  } catch {
    // Not authenticated — cookie-only is fine
  }
}