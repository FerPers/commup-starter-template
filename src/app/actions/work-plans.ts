'use server'

import { getActiveMembership as getCtx } from '@/lib/supabase/membership'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { revalidatePath } from 'next/cache'

// ── Create Work Plan ─────────────────────────────────────────────────

export async function createWorkPlan(input: {
  projectId: string
  disciplineId: string
  planDate: string
  notes?: string
}): Promise<{ id?: string; error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const { projectId, disciplineId, planDate, notes } = input

  // Verify project belongs to user's org
  const { data: project } = await ctx.supabase
    .from('projects')
    .select('org_id')
    .eq('id', projectId)
    .single()
  if (!project || project.org_id !== ctx.orgId) return { error: 'Proyecto no encontrado' }

  const { data, error } = await ctx.supabase
    .from('work_plans')
    .insert({
      project_id: projectId,
      discipline_id: disciplineId,
      leader_id: ctx.userId,
      plan_date: planDate,
      status: 'draft',
      notes: notes ?? null,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/work-plans')
  revalidatePath(`/projects/${projectId}`)
  revalidatePath(`/projects/${projectId}/work-plans`)
  return { id: data.id }
}

// ── Update Work Plan Status ──────────────────────────────────────────

export async function updateWorkPlanStatus(
  planId: string,
  status: 'draft' | 'published' | 'in_progress' | 'completed',
): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const { error } = await ctx.supabase
    .from('work_plans')
    .update({ status })
    .eq('id', planId)

  if (error) return { error: error.message }

  revalidatePath('/work-plans')
  return {}
}

// ── Add Item to Work Plan ────────────────────────────────────────────

export async function addWorkPlanItem(input: {
  workPlanId: string
  itrId: string
  assignedTo: string
  remarks?: string
}): Promise<{ id?: string; error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const { workPlanId, itrId, assignedTo, remarks } = input

  const { data, error } = await ctx.supabase
    .from('work_plan_items')
    .insert({
      work_plan_id: workPlanId,
      itr_id: itrId,
      assigned_to: assignedTo,
      status: 'not_started',
      remarks: remarks ?? null,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/work-plans')
  return { id: data.id }
}

// ── Update Work Plan Item Status ─────────────────────────────────────

export async function updateWorkPlanItemStatus(
  itemId: string,
  status: 'not_started' | 'in_progress' | 'completed' | 'on_hold',
): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }

  const { error } = await ctx.supabase
    .from('work_plan_items')
    .update({ status })
    .eq('id', itemId)

  if (error) return { error: error.message }

  revalidatePath('/work-plans')
  return {}
}

// ── Remove Item from Work Plan ───────────────────────────────────────

export async function removeWorkPlanItem(itemId: string): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const { error } = await ctx.supabase
    .from('work_plan_items')
    .delete()
    .eq('id', itemId)

  if (error) return { error: error.message }

  revalidatePath('/work-plans')
  return {}
}

// ── Delete Work Plan ─────────────────────────────────────────────────

export async function deleteWorkPlan(planId: string): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const { error } = await ctx.supabase
    .from('work_plans')
    .delete()
    .eq('id', planId)

  if (error) return { error: error.message }

  revalidatePath('/work-plans')
  return {}
}

// ── Get Project Plan Context (for AddToWorkPlanModal) ─────────────────

export async function getProjectPlanContext(projectId: string): Promise<{
  plans: Array<{ id: string; plan_date: string; status: string; disciplines: { code: string; name: string; color: string } | null }>
  disciplines: Array<{ id: string; code: string; name: string; color: string }>
  error?: string
}> {
  const ctx = await getCtx()
  if (!ctx) return { plans: [], disciplines: [], error: 'No autenticado' }

  const [plansRes, discRes] = await Promise.all([
    ctx.supabase
      .from('work_plans')
      .select('id, plan_date, status, disciplines(code, name, color)')
      .eq('project_id', projectId)
      .in('status', ['draft', 'published', 'in_progress'])
      .order('plan_date', { ascending: false })
      .limit(50),
    ctx.supabase
      .from('disciplines')
      .select('id, code, name, color')
      .eq('org_id', ctx.orgId)
      .order('code'),
  ])

  // Supabase returns disciplines as array from the join; normalize to object|null
  const plans = (plansRes.data ?? []).map(row => {
    const disc = Array.isArray(row.disciplines)
      ? (row.disciplines[0] ?? null)
      : (row.disciplines ?? null)
    return {
      id: row.id as string,
      plan_date: row.plan_date as string,
      status: row.status as string,
      disciplines: disc as { code: string; name: string; color: string } | null,
    }
  })

  return { plans, disciplines: discRes.data ?? [] }
}

// ── Bulk Add ITRs to Work Plan ────────────────────────────────────────

export async function addItrsToWorkPlan(
  planId: string,
  items: { itrId: string; assignedTo: string }[],
): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const { error } = await ctx.supabase
    .from('work_plan_items')
    .insert(items.map(item => ({
      work_plan_id: planId,
      itr_id: item.itrId,
      assigned_to: item.assignedTo,
      status: 'not_started',
    })))

  if (error) return { error: error.message }

  revalidatePath('/work-plans')
  return {}
}

// ── Create Work Plan and Add ITRs ─────────────────────────────────────

export async function createWorkPlanAndAddItrs(input: {
  projectId: string
  disciplineId: string
  planDate: string
  notes?: string
  items: { itrId: string; assignedTo: string }[]
}): Promise<{ id?: string; error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const { projectId, disciplineId, planDate, notes, items } = input

  const { data: project } = await ctx.supabase
    .from('projects')
    .select('org_id')
    .eq('id', projectId)
    .single()
  if (!project || project.org_id !== ctx.orgId) return { error: 'Proyecto no encontrado' }

  const { data, error } = await ctx.supabase
    .from('work_plans')
    .insert({
      project_id: projectId,
      discipline_id: disciplineId,
      leader_id: ctx.userId,
      plan_date: planDate,
      status: 'draft',
      notes: notes ?? null,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  if (items.length > 0) {
    const { error: itemsError } = await ctx.supabase
      .from('work_plan_items')
      .insert(items.map(item => ({
        work_plan_id: data.id,
        itr_id: item.itrId,
        assigned_to: item.assignedTo,
        status: 'not_started',
      })))
    if (itemsError) return { error: itemsError.message }
  }

  revalidatePath('/work-plans')
  revalidatePath(`/projects/${projectId}/work-plans`)
  return { id: data.id }
}
