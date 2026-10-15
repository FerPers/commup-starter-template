'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ADMIN_ROLES, EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuth, withAuthOnly } from '@/lib/auth/withAuth'
import { TEST_EQUIPMENT_KINDS, type TestEquipmentKind } from '@/lib/test-equipment/calibration'

// Equipos de prueba calibrados (fase 4 · bloque B, migración 20261016150000). Inventario por org
// (RLS: escriben owner/admin/architect/leader) y uso en el ITR (el trigger copia la calibración del
// momento; sign_itr_atomic bloquea la firma con equipos vencidos en la fecha de uso).

export type TestEquipmentInput = {
  id?: string
  code: string
  kind: TestEquipmentKind
  make?: string | null
  model?: string | null
  serialNumber: string
  ownerCompany?: string | null
  certificateNumber: string
  calibratedOn: string
  calibrationDue: string
  notes?: string | null
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const txt = (v: string | null | undefined, max: number) => (v ?? '').trim().slice(0, max) || null

function revalidateInventory() {
  revalidatePath('/admin/test-equipment')
}

/** Alta o edición de un equipo. Las fechas y el n.º de certificado son obligatorios (§10.11). */
export const saveTestEquipment = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, input: TestEquipmentInput): Promise<{ id?: string; error?: string }> => {
    const code = txt(input.code, 60)?.toUpperCase()
    const serial = txt(input.serialNumber, 100)
    const cert = txt(input.certificateNumber, 100)
    if (!code || !serial || !cert) return { error: 'Código, serie y n.º de certificado son obligatorios' }
    if (!TEST_EQUIPMENT_KINDS.includes(input.kind)) return { error: 'Tipo de equipo no válido' }
    if (!DATE.test(input.calibratedOn) || !DATE.test(input.calibrationDue)) return { error: 'Fechas de calibración no válidas' }
    if (input.calibrationDue < input.calibratedOn) return { error: 'El vencimiento no puede ser anterior a la calibración' }

    const row = {
      code, kind: input.kind, make: txt(input.make, 100), model: txt(input.model, 100), serial_number: serial,
      owner_company: txt(input.ownerCompany, 150), certificate_number: cert,
      calibrated_on: input.calibratedOn, calibration_due: input.calibrationDue, notes: txt(input.notes, 1000),
    }
    const q = input.id
      ? ctx.supabase.from('test_equipment').update(row).eq('id', input.id).eq('org_id', ctx.orgId).select('id').single()
      : ctx.supabase.from('test_equipment').insert({ ...row, org_id: ctx.orgId }).select('id').single()
    const { data, error } = await q
    if (error?.code === '23505') return { error: `Ya existe un equipo con el código ${code}` }
    if (error || !data) return { error: error?.message ?? 'No se pudo guardar' }
    revalidateInventory()
    return { id: data.id }
  },
)

export const setTestEquipmentActive = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, input: { id: string; active: boolean }): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.from('test_equipment').update({ is_active: input.active }).eq('id', input.id).eq('org_id', ctx.orgId)
    if (error) return { error: error.message }
    revalidateInventory()
    return {}
  },
)

/** Solo si nunca se usó en un ITR; si no, se da de baja (la evidencia se conserva). */
export const deleteTestEquipment = withAuthOnly(
  { role: ADMIN_ROLES },
  async (ctx, input: { id: string }): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.from('test_equipment').delete().eq('id', input.id).eq('org_id', ctx.orgId)
    if (error?.code === '23503') return { error: 'El equipo ya se usó en ITRs: dalo de baja en lugar de borrarlo' }
    if (error) return { error: error.message }
    revalidateInventory()
    return {}
  },
)

/** El cliente sube el PDF a test-equipment/<org>/<equipo>/…; aquí se valida y se registra la ruta. */
export const setTestEquipmentCertificate = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, input: { id: string; path: string }): Promise<{ error?: string }> => {
    if (!input.path.startsWith(`${ctx.orgId}/${input.id}/`) || input.path.includes('..')) return { error: 'Ruta no válida' }
    const { error } = await ctx.supabase.from('test_equipment').update({ certificate_path: input.path }).eq('id', input.id).eq('org_id', ctx.orgId)
    if (error) return { error: error.message }
    revalidateInventory()
    return {}
  },
)

/** URL firmada (5 min) del certificado; la RLS del bucket limita a la org del usuario. */
export const getTestEquipmentCertificateUrl = withAuthOnly(
  {},
  async (ctx, input: { path: string }): Promise<{ url?: string; error?: string }> => {
    if (!input.path.startsWith(`${ctx.orgId}/`) || input.path.includes('..')) return { error: 'Ruta no válida' }
    const { data, error } = await ctx.supabase.storage.from('test-equipment').createSignedUrl(input.path, 300)
    if (error || !data) return { error: error?.message ?? 'No se pudo abrir el certificado' }
    return { url: data.signedUrl }
  },
)

// ── Uso en el ITR ────────────────────────────────────────────────────────

async function itrInProject(ctx: { supabase: SupabaseClient }, itrId: string, projectId: string) {
  const { data } = await ctx.supabase.from('itrs').select('id, tag_id').eq('id', itrId).eq('project_id', projectId).maybeSingle()
  return data as { id: string; tag_id: string } | null
}

export const addItrTestEquipment = withAuth(
  { guards: [{ resource: 'project', field: 'projectId' }] },
  async (ctx, input: { projectId: string; itrId: string; equipmentId: string }): Promise<{ error?: string }> => {
    if (ctx.role === 'client') return { error: 'Sin permiso' }
    const itr = await itrInProject(ctx, input.itrId, input.projectId)
    if (!itr) return { error: 'ITR no encontrado' }
    // project_id y la calibración los completa el trigger; RLS exige un proyecto propio.
    const { error } = await ctx.supabase.from('itr_test_equipment').insert({
      itr_id: itr.id, equipment_id: input.equipmentId, project_id: input.projectId,
      calibrated_on: '1900-01-01', calibration_due: '1900-01-01', certificate_number: '-',
    })
    if (error?.code === '23505') return { error: 'Ese equipo ya está registrado en este ITR' }
    if (error) return { error: error.message }
    revalidatePath(`/projects/${input.projectId}/tags/${itr.tag_id}/itrs/${itr.id}`)
    return {}
  },
)

export const removeItrTestEquipment = withAuth(
  { guards: [{ resource: 'project', field: 'projectId' }] },
  async (ctx, input: { projectId: string; itrId: string; equipmentId: string }): Promise<{ error?: string }> => {
    const itr = await itrInProject(ctx, input.itrId, input.projectId)
    if (!itr) return { error: 'ITR no encontrado' }
    const { error } = await ctx.supabase.from('itr_test_equipment').delete().eq('itr_id', itr.id).eq('equipment_id', input.equipmentId)
    if (error) return { error: error.message }
    revalidatePath(`/projects/${input.projectId}/tags/${itr.tag_id}/itrs/${itr.id}`)
    return {}
  },
)
