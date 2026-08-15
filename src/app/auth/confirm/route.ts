import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

// Procesa enlaces de email de Supabase Auth (invitación, recovery, magic link).
// Soporta ambos formatos: token_hash (plantillas apuntando directo a la app)
// y code (PKCE). Si el enlace llega con tokens en el fragmento (#access_token),
// este route nunca los ve — ese caso lo consume el browser client en
// /auth/set-password vía detectSessionInUrl.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next')

  const supabase = await createClient()

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) {
      const dest = next ?? (type === 'invite' || type === 'recovery' ? '/auth/set-password' : '/dashboard')
      return NextResponse.redirect(new URL(dest, url.origin))
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(next ?? '/dashboard', url.origin))
    }
  }

  return NextResponse.redirect(new URL('/auth/link-error', url.origin))
}
