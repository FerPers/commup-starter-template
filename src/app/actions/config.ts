'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const ADMIN_ROLES = ['owner', 'admin']

async function getCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: m } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!m) return null
  return { supabase, orgId: m.org_id as string, userId: user.id, role: m.role as string }
}

// ═══════════════════════════════════════════════════════════
// PROJECT PHASES
// ═══════════════════════════════════════════════════════════

export async function createPhase(input: {
  code: string
  name: string
  color: string
  certificateName?: string
}): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!ADMIN_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

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
}

export async function updatePhase(input: {
  phaseId: string
  code: string
  name: string
  color: string
  certificateName?: string
}): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!ADMIN_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

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
}

export async function deletePhase(phaseId: string): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!ADMIN_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

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
}

// ═══════════════════════════════════════════════════════════
// DISCIPLINES
// ═══════════════════════════════════════════════════════════

export async function createDiscipline(input: {
  code: string
  name: string
  color: string
}): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!ADMIN_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const { error } = await ctx.supabase.from('disciplines').insert({
    org_id: ctx.orgId,
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    color: input.color,
  })

  if (error) return { error: error.message }
  revalidatePath('/admin/config')
  return {}
}

export async function updateDiscipline(input: {
  disciplineId: string
  code: string
  name: string
  color: string
}): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!ADMIN_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

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
}

export async function deleteDiscipline(disciplineId: string): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!ADMIN_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

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
}
