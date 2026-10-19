import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import { ADMIN_ROLES, EDITOR_ROLES } from '@/lib/auth/permissions'
import TestEquipmentAdmin, { type EquipmentRow } from './TestEquipmentAdmin'

// Inventario de equipos de prueba de la org con su calibración (fase 4 · bloque B).
export default async function AdminTestEquipmentPage() {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  if (!EDITOR_ROLES.includes(ctx.role)) redirect('/dashboard')

  const { data: companies } = await ctx.supabase.from('companies').select('name').eq('org_id', ctx.orgId).eq('is_active', true).order('name')
  const { data } = await ctx.supabase
    .from('test_equipment')
    .select('id, code, kind, make, model, serial_number, owner_company, certificate_number, calibrated_on, calibration_due, certificate_path, notes, is_active')
    .eq('org_id', ctx.orgId)
    .order('code')
    .limit(2000)

  return (
    <TestEquipmentAdmin
      orgId={ctx.orgId}
      rows={(data ?? []) as EquipmentRow[]}
      canDelete={ADMIN_ROLES.includes(ctx.role)}
      companies={(companies ?? []).map(c => c.name)}
    />
  )
}
