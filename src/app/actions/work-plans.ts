'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const EDITOR_ROLES = ['owner', 'admin', 'architect', 'leader']

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
