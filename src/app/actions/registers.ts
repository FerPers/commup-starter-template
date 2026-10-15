'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'
import type { Json } from '@/types/supabase.generated'
import {
  REGISTER_KINDS,
  cleanRegisterData,
  missingFieldsFor,
  registerType,
  transitionBlockedReason,
  type RegisterKind,
  type RegisterStatus,
} from '@/lib/registers/catalog'

// Registros controlados (fase 3 plan readiness). Toda escritura pasa por RPC SECURITY DEFINER
// (migración 20261015200000), que aplica rol, ciclo de vida y «otra persona». Aquí: propiedad de
// los ids, limpieza de campos según el catálogo y campos requeridos por estado (la BD no los conoce).

const projectGuard = [{ resource: 'project' as const, field: 'projectId' }]

// Los tipos generados no admiten null en parámetros de RPC sin DEFAULT, aunque SQL sí (null = quitar).
const nullable = (v: string | null | undefined) => (v ?? null) as unknown as string

type TagRef = { tag_id: string; role: 'subject' | 'line' | 'gauge' }

function revalidate(projectId: string, itemId?: string) {
  revalidatePath(`/projects/${projectId}/registers`)
  if (itemId) revalidatePath(`/projects/${projectId}/registers/${itemId}`)
  revalidatePath('/control-tower')
}

async function loadItem(db: SupabaseClient, projectId: string, itemId: string) {
  const { data } = await db
    .from('register_items')
    .select('id, kind, status, data')
    .eq('id', itemId)
    .eq('project_id', projectId)
    .maybeSingle()
  return data as { id: string; kind: RegisterKind; status: RegisterStatus; data: Record<string, unknown> } | null
}

function cleanTags(kind: RegisterKind, tags: TagRef[] | undefined): TagRef[] {
  const roles = registerType(kind).tagRoles
  const seen = new Set<string>()
  return (tags ?? [])
    .filter(t => typeof t.tag_id === 'string' && roles.includes(t.role))
    .filter(t => { const k = `${t.tag_id}:${t.role}`; if (seen.has(k)) return false; seen.add(k); return true })
    .slice(0, 2000)
}

export const createRegisterItem = withAuth(
  { guards: [...projectGuard, { resource: 'system' as const, field: 'systemId', scopeField: 'projectId', optional: true }] },
  async (
    ctx,
    input: { projectId: string; kind: RegisterKind; title: string; description?: string; systemId?: string | null; data?: Record<string, unknown>; tags?: TagRef[] },
  ): Promise<{ id?: string; error?: string }> => {
    if (!REGISTER_KINDS.includes(input.kind)) return { error: 'Tipo de registro no válido' }
    const title = input.title?.trim()
    if (!title) return { error: 'El título es obligatorio' }
    const { data, error } = await ctx.supabase.rpc('create_register_item', {
      p_project_id: input.projectId,
      p_kind: input.kind,
      p_title: title.slice(0, 200),
      p_description: input.description?.trim().slice(0, 2000) ?? undefined,
      p_system_id: input.systemId ?? undefined,
      p_data: cleanRegisterData(input.kind, input.data ?? {}),
      p_tags: cleanTags(input.kind, input.tags),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId)
    return { id: data as string }
  },
)

export const updateRegisterItem = withAuth(
  { guards: [...projectGuard, { resource: 'system' as const, field: 'systemId', scopeField: 'projectId', optional: true }] },
  async (
    ctx,
    input: { projectId: string; itemId: string; title: string; description?: string; systemId?: string | null; data: Record<string, unknown>; tags?: TagRef[] },
  ): Promise<{ error?: string }> => {
    const item = await loadItem(ctx.supabase, input.projectId, input.itemId)
    if (!item) return { error: 'Registro no encontrado' }
    const title = input.title?.trim()
    if (!title) return { error: 'El título es obligatorio' }
    const { error } = await ctx.supabase.rpc('update_register_item', {
      p_item_id: item.id,
      p_title: title.slice(0, 200),
      p_description: input.description?.trim().slice(0, 2000) ?? '',
      p_system_id: nullable(input.systemId),
      p_data: cleanRegisterData(item.kind, input.data),
      p_tags: input.tags ? cleanTags(item.kind, input.tags) : undefined,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, item.id)
    return {}
  },
)

/** Avanza el ciclo (o cancela). `data` opcional: lo capturado en el mismo paso (ej. resultado de la prueba). */
export const transitionRegisterItem = withAuth(
  { guards: projectGuard },
  async (
    ctx,
    input: { projectId: string; itemId: string; to: RegisterStatus; comment?: string; data?: Record<string, unknown> },
  ): Promise<{ error?: string; missing?: string[] }> => {
    const item = await loadItem(ctx.supabase, input.projectId, input.itemId)
    if (!item) return { error: 'Registro no encontrado' }
    const data = input.data ? cleanRegisterData(item.kind, { ...item.data, ...input.data }) : item.data
    if (input.to !== 'cancelled') {
      const missing = missingFieldsFor(item.kind, input.to, data)
      if (missing.length) return { error: 'Faltan campos obligatorios para este paso', missing }
      if (transitionBlockedReason(item.kind, input.to, data) === 'test_rejected') {
        return { error: 'La prueba fue rechazada: repite la prueba antes de restituir o verificar' }
      }
    }
    const { error } = await ctx.supabase.rpc('transition_register_item', {
      p_item_id: item.id,
      p_to: input.to,
      p_comment: input.comment?.trim() ?? undefined,
      p_data: input.data ? (data as Json) : undefined,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, item.id)
    return {}
  },
)

export const deleteRegisterItem = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; itemId: string }): Promise<{ error?: string }> => {
    const item = await loadItem(ctx.supabase, input.projectId, input.itemId)
    if (!item) return { error: 'Registro no encontrado' }
    const { error } = await ctx.supabase.rpc('delete_register_item', { p_item_id: item.id })
    if (error) return { error: error.message }
    revalidate(input.projectId)
    return {}
  },
)

/** Admin: activar/desactivar un tipo y elegir qué gate bloquea (null = no bloquea). */
export const configureRegisterType = withAuth(
  { role: PRIVILEGED_ROLES },
  async (ctx, input: { typeId: string; isActive: boolean; blocksGateId: string | null }): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.rpc('configure_register_type', {
      p_type_id: input.typeId,
      p_is_active: input.isActive,
      p_blocks_gate_id: nullable(input.blocksGateId),
    })
    if (error) return { error: error.message }
    revalidatePath('/admin/registers')
    revalidatePath('/control-tower')
    return {}
  },
)
