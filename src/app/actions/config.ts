'use server'

import { ADMIN_ROLES, OWNER_ROLES } from '@/lib/auth/permissions'
import { withAuth, withAuthOnly } from '@/lib/auth/withAuth'
import { EQUIPMENT_TYPE_DEFAULTS } from '@/lib/equipment-types'
import { revalidatePath } from 'next/cache'

// ═══════════════════════════════════════════════════════════
// PROJECT PHASES
// ═══════════════════════════════════════════════════════════

export const createPhase = withAuth(
  { role: ADMIN_ROLES },
  async (
    ctx,
    input: {
      code: string
      name: string
      color: string
      certificateName?: string
    },
  ): Promise<{ error?: string }> => {
    // Get current max order_index
    const { data: existing } = await ctx.supabase
      .from('project_phases')
      .select('order_index')
      .eq('org_id', ctx.orgId)
      .order('order_index', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextIndex = (existing?.order_index ?? 0) + 1

    const { error } = await ctx.supabase.from('project_phases').insert({
      org_id: ctx.orgId,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      color: input.color,
      certificate_name: input.certificateName?.trim() ?? null,
      order_index: nextIndex,
    })

    if (error) return { error: error.message }
    revalidatePath('/admin/config')
    return {}
  },
)

export const updatePhase = withAuth(
  { role: ADMIN_ROLES },
  async (
    ctx,
    input: {
      phaseId: string
      code: string
      name: string
      color: string
      certificateName?: string
    },
  ): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase
      .from('project_phases')
      .update({
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        color: input.color,
        certificate_name: input.certificateName?.trim() ?? null,
      })
      .eq('id', input.phaseId)
      .eq('org_id', ctx.orgId)

    if (error) return { error: error.message }
    revalidatePath('/admin/config')
    return {}
  },
)

export const deletePhase = withAuthOnly(
  { role: ADMIN_ROLES },
  async (ctx, phaseId: string): Promise<{ error?: string }> => {
    // Block if ITRs reference this phase
    const { count } = await ctx.supabase
      .from('itrs')
      .select('id', { count: 'exact', head: true })
      .eq('phase_id', phaseId)

    if ((count ?? 0) > 0) {
      return { error: `No se puede eliminar: ${count} ITR(s) usan esta fase` }
    }

    const { error } = await ctx.supabase
      .from('project_phases')
      .delete()
      .eq('id', phaseId)
      .eq('org_id', ctx.orgId)

    if (error) return { error: error.message }
    revalidatePath('/admin/config')
    return {}
  },
)

// ═══════════════════════════════════════════════════════════
// DISCIPLINES
// ═══════════════════════════════════════════════════════════

export const createDiscipline = withAuth(
  { role: ADMIN_ROLES },
  async (
    ctx,
    input: {
      code: string
      name: string
      color: string
    },
  ): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.from('disciplines').insert({
      org_id: ctx.orgId,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      color: input.color,
    })

    if (error) return { error: error.message }
    revalidatePath('/admin/config')
    return {}
  },
)

export const updateDiscipline = withAuth(
  { role: ADMIN_ROLES },
  async (
    ctx,
    input: {
      disciplineId: string
      code: string
      name: string
      color: string
    },
  ): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase
      .from('disciplines')
      .update({
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        color: input.color,
      })
      .eq('id', input.disciplineId)
      .eq('org_id', ctx.orgId)

    if (error) return { error: error.message }
    revalidatePath('/admin/config')
    return {}
  },
)

export const deleteDiscipline = withAuthOnly(
  { role: ADMIN_ROLES },
  async (ctx, disciplineId: string): Promise<{ error?: string }> => {
    // Block if tags reference this discipline
    const { count } = await ctx.supabase
      .from('tags')
      .select('id', { count: 'exact', head: true })
      .eq('discipline_id', disciplineId)

    if ((count ?? 0) > 0) {
      return { error: `No se puede eliminar: ${count} tag(s) usan esta disciplina` }
    }

    const { error } = await ctx.supabase
      .from('disciplines')
      .delete()
      .eq('id', disciplineId)
      .eq('org_id', ctx.orgId)

    if (error) return { error: error.message }
    revalidatePath('/admin/config')
    return {}
  },
)

// ═══════════════════════════════════════════════════════════
// EQUIPMENT TYPES (catálogo por org: bombas, filtros, tanques, transmisores…)
// ═══════════════════════════════════════════════════════════

/** Siembra el catálogo estándar (solo los códigos que la org aún no tiene). */
export const seedEquipmentTypes = withAuthOnly(
  { role: ADMIN_ROLES },
  async (ctx): Promise<{ error?: string; created?: number }> => {
    const { data: existing, error: exErr } = await ctx.supabase
      .from('equipment_types')
      .select('code')
      .eq('org_id', ctx.orgId)
    if (exErr) return { error: exErr.message }
    const have = new Set((existing ?? []).map(e => e.code.toUpperCase()))
    const rows = EQUIPMENT_TYPE_DEFAULTS
      .filter(t => !have.has(t.code))
      .map(t => ({ org_id: ctx.orgId, code: t.code, name: t.name, category: t.category }))
    if (rows.length === 0) return { created: 0 }
    const { error } = await ctx.supabase.from('equipment_types').insert(rows)
    if (error) return { error: error.message }
    revalidatePath('/admin/config')
    return { created: rows.length }
  },
)

export const createEquipmentType = withAuth(
  { role: ADMIN_ROLES },
  async (
    ctx,
    input: { code: string; name: string; category: string },
  ): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.from('equipment_types').insert({
      org_id: ctx.orgId,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      category: input.category.trim() || null,
    })
    if (error) return { error: error.message }
    revalidatePath('/admin/config')
    return {}
  },
)

export const updateEquipmentType = withAuth(
  { role: ADMIN_ROLES },
  async (
    ctx,
    input: { equipmentTypeId: string; code: string; name: string; category: string },
  ): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase
      .from('equipment_types')
      .update({
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        category: input.category.trim() || null,
      })
      .eq('id', input.equipmentTypeId)
      .eq('org_id', ctx.orgId)
    if (error) return { error: error.message }
    revalidatePath('/admin/config')
    return {}
  },
)

export const deleteEquipmentType = withAuthOnly(
  { role: ADMIN_ROLES },
  async (ctx, equipmentTypeId: string): Promise<{ error?: string }> => {
    const { count } = await ctx.supabase
      .from('tags')
      .select('id', { count: 'exact', head: true })
      .eq('equipment_type_id', equipmentTypeId)
    if ((count ?? 0) > 0) {
      return { error: `No se puede eliminar: ${count} tag(s) usan este tipo de equipo` }
    }
    const { error } = await ctx.supabase
      .from('equipment_types')
      .delete()
      .eq('id', equipmentTypeId)
      .eq('org_id', ctx.orgId)
    if (error) return { error: error.message }
    revalidatePath('/admin/config')
    return {}
  },
)

// ═══════════════════════════════════════════════════════════
// ORG PROFILE
// ═══════════════════════════════════════════════════════════

export const updateOrgProfile = withAuth(
  { role: ADMIN_ROLES },
  async (
    ctx,
    input: {
      orgId: string
      name: string
      logoUrl: string | null
    },
  ): Promise<{ error?: string }> => {
    if (ctx.orgId !== input.orgId) return { error: 'Organización no válida' }

    const { error } = await ctx.supabase
      .from('organizations')
      .update({ name: input.name.trim(), logo_url: input.logoUrl })
      .eq('id', input.orgId)

    if (error) return { error: error.message }
    revalidatePath('/admin/config')
    revalidatePath('/')
    return {}
  },
)

/**
 * Toggle whether the active org is a public template catalog. When true, its
 * templates (ITR, preservation, PSSR) become readable by any authenticated
 * user via the catalog RLS policies, enabling cross-org template browsing
 * without explicit membership.
 */
export const setOrgTemplateCatalog = withAuthOnly(
  { role: OWNER_ROLES },
  async (ctx, value: boolean): Promise<{ error?: string }> => {
    // Read current settings, merge the flag, write back. settings is jsonb.
    const { data: org, error: fetchErr } = await ctx.supabase
      .from('organizations')
      .select('settings')
      .eq('id', ctx.orgId)
      .single()
    if (fetchErr) return { error: fetchErr.message }

    const settings = (org?.settings as Record<string, unknown> | null) ?? {}
    const next = { ...settings, is_template_catalog: value }

    const { error } = await ctx.supabase
      .from('organizations')
      .update({ settings: next })
      .eq('id', ctx.orgId)

    if (error) return { error: error.message }
    revalidatePath('/admin/config')
    revalidatePath('/admin/templates')
    return {}
  },
)

/** Glosario EN → ES para la traducción de ITRs (texto "en = es" por línea). */
export const saveOrgGlossary = withAuthOnly(
  { role: ADMIN_ROLES },
  async (ctx, text: string): Promise<{ error?: string }> => {
    const { data: org, error: fetchErr } = await ctx.supabase
      .from('organizations')
      .select('settings')
      .eq('id', ctx.orgId)
      .single()
    if (fetchErr) return { error: fetchErr.message }
    const settings = (org?.settings as Record<string, unknown> | null) ?? {}
    const next = { ...settings, itr_glossary: text.trim().slice(0, 20000) }
    const { error } = await ctx.supabase.from('organizations').update({ settings: next }).eq('id', ctx.orgId)
    if (error) return { error: error.message }
    revalidatePath('/admin/config')
    return {}
  },
)

export const uploadOrgLogo = withAuthOnly(
  { role: ADMIN_ROLES },
  async (
    ctx,
    orgId: string,
    formData: FormData,
  ): Promise<{ url?: string; error?: string }> => {
    if (ctx.orgId !== orgId) return { error: 'Organización no válida' }

    const file = formData.get('file') as File | null
    if (!file) return { error: 'No se adjuntó archivo' }
    if (file.size > 2 * 1024 * 1024) return { error: 'El archivo supera 2 MB' }

    const ext = file.name.split('.').pop() ?? 'png'
    const path = `${orgId}/logo.${ext}`

    const { error: upErr } = await ctx.supabase.storage
      .from('org-assets')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (upErr) return { error: upErr.message }

    const { data } = ctx.supabase.storage.from('org-assets').getPublicUrl(path)
    return { url: data.publicUrl }
  },
)
