import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// S15 (I-21): pantallas para quien tiene sesión pero ninguna membresía activa (invitaciones por aceptar,
// acceso suspendido o vencido). Fuera de (dashboard) porque allí se exige una membresía activa.
export default async function AccessLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return (
    <div style={{ minHeight: '100vh', background: 'var(--page-bg, #f8fafc)', display: 'flex', justifyContent: 'center', padding: '48px 16px' }}>
      <div style={{ width: '100%', maxWidth: 560 }}>{children}</div>
    </div>
  )
}
