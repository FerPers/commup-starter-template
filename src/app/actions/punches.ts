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

// ── createPunch ────────────────────────────────────────────────────────────

export async function createPunch(input: {
  projectId: string
  tagId?: string | null
  itrId?: string | null
  category: 'A' | 'B' | 'C'
  description: string
  assignedTo?: string | null
  targetDate?: string | null
  priority?: 'critical' | 'major' | 'minor'
}): Promise<{ punchId?: string; punchNumber?: string; error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }

  const { supabase, orgId, userId } = ctx

  // Verify project belongs to user's org
  const { data: project } = await supabase
    .from('projects')
    .select('org_id')
    .eq('id', input.projectId)
    .single()
  if (!project || project.org_id !== orgId) return { error: 'Proyecto no encontrado' }

  // Resolve subsystem_id and discipline_id from tag
  let subsystemId: string | null = null
  let disciplineId: string | null = null

  if (input.tagId) {
    const { data: tag } = await supabase
      .from('tags')
      .select('subsystem_id, discipline_id')
      .eq('id', input.tagId)
      .single()
    if (!tag) return { error: 'Tag no encontrado' }
    subsystemId = tag.subsystem_id
    disciplineId = tag.discipline_id
  }

  if (!subsystemId || !disciplineId) {
    return { error: 'No se puede resolver subsistema o disciplina del tag' }
  }

  const { data: punch, error } = await supabase
    .from('punches')
    .insert({
      project_id: input.projectId,
      subsystem_id: subsystemId,
      tag_id: input.tagId ?? null,
      itr_id: input.itrId ?? null,
      category: input.category,
      description: input.description,
      discipline_id: disciplineId,
      raised_by: userId,
      assigned_to: input.assignedTo ?? null,
      status: 'open',
      priority: input.priority ?? 'major',
      target_date: input.targetDate ?? null,
    })
    .select('id, punch_number')
    .single()

  if (error) return { error: error.message }

  revalidatePath(`/projects/${input.projectId}/punches`)
  if (input.tagId) {
    revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}`)
  }

  return { punchId: punch.id, punchNumber: punch.punch_number }
}

// ── updatePunchStatus ──────────────────────────────────────────────────────

export async function updatePunchStatus(input: {
  punchId: string
  status: 'open' | 'in_progress' | 'closed' | 'cancelled'
  projectId: string
  tagId?: string | null
}): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }

  const { supabase } = ctx

  const update: Record<string, unknown> = { status: input.status }
  if (input.status === 'closed' || input.status === 'cancelled') {
    update.closed_date = new Date().toISOString().split('T')[0]
  }

  const { error } = await supabase
    .from('punches')
    .update(update)
    .eq('id', input.punchId)

  if (error) return { error: error.message }

  revalidatePath(`/projects/${input.projectId}/punches`)
  if (input.tagId) {
    revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}`)
  }

  return {}
}

// ── closePunch ─────────────────────────────────────────────────────────────

export async function closePunch(input: {
  punchId: string
  projectId: string
  tagId?: string | null
  resolutionComment?: string
}): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos para cerrar punch' }

  const { supabase, userId } = ctx
  const today = new Date().toISOString().split('T')[0]

  const { error } = await supabase
    .from('punches')
    .update({ status: 'closed', closed_date: today })
    .eq('id', input.punchId)

  if (error) return { error: error.message }

  if (input.resolutionComment) {
    await supabase.from('punch_comments').insert({
      punch_id: input.punchId,
      user_id: userId,
      comment: input.resolutionComment,
    })
  }

  revalidatePath(`/projects/${input.projectId}/punches`)
  if (input.tagId) {
    revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}`)
  }

  return {}
}

// ── addPunchComment ────────────────────────────────────────────────────────

export async function addPunchComment(input: {
  punchId: string
  comment: string
  projectId: string
  tagId?: string | null
}): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }

  const { supabase, userId } = ctx

  const { error } = await supabase.from('punch_comments').insert({
    punch_id: input.punchId,
    user_id: userId,
    comment: input.comment,
  })

  if (error) return { error: error.message }

  revalidatePath(`/projects/${input.projectId}/punches`)
  if (input.tagId) {
    revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}`)
  }

  return {}
}

// ── deletePunch ────────────────────────────────────────────────────────────

export async function deletePunch(input: {
  punchId: string
  projectId: string
  tagId?: string | null
}): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos para eliminar punch' }

  const { supabase } = ctx

  const { error } = await supabase
    .from('punches')
    .delete()
    .eq('id', input.punchId)

  if (error) return { error: error.message }

  revalidatePath(`/projects/${input.projectId}/punches`)
  if (input.tagId) {
    revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}`)
  }

  return {}
}
