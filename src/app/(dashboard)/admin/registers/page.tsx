import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import { PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { REGISTER_KINDS, type RegisterKind } from '@/lib/registers/catalog'
import RegisterTypesAdmin from './RegisterTypesAdmin'

// Configuración de los tipos de registro controlado de la org (fase 3): activo y gate que bloquea.
export default async function AdminRegistersPage() {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  if (!PRIVILEGED_ROLES.includes(ctx.role)) redirect('/dashboard')
  const supabase = ctx.supabase

  await supabase.rpc('ensure_register_types', { p_org_id: ctx.orgId })
  const [{ data: types }, { data: gates }] = await Promise.all([
    supabase.from('register_types').select('id, kind, prefix, is_active, blocks_gate_id').eq('org_id', ctx.orgId),
    supabase.from('readiness_gates').select('id, code, name, is_active').eq('org_id', ctx.orgId).order('order_index'),
  ])
  const order = (k: string) => REGISTER_KINDS.indexOf(k as RegisterKind)

  return (
    <RegisterTypesAdmin
      types={(types ?? []).map(t => ({ ...t, kind: t.kind as RegisterKind })).sort((a, b) => order(a.kind) - order(b.kind))}
      gates={gates ?? []}
    />
  )
}
