'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'
import type { Json } from '@/types/supabase.generated'
import {
  OPEN_STATUSES,
  REGISTER_KINDS,
  cleanRegisterData,
  missingFieldsFor,
  registerType,
  transitionBlockedReason,
  type RegisterKind,
  type RegisterStatus,
} from '@/lib/registers/catalog'
import { isRegisterNumber, packKey } from '@/lib/registers/test-packs'
import type { LineImportRow, PackImportRow } from '@/lib/registers/test-packs-import'

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
    input: { projectId: string; kind: RegisterKind; title: string; description?: string; systemId?: string | null; data?: Record<string, unknown>; tags?: TagRef[]; linkToId?: string },
  ): Promise<{ id?: string; error?: string }> => {
    if (!REGISTER_KINDS.includes(input.kind)) return { error: 'Tipo de registro no válido' }
    const linkTo = input.linkToId ? await loadItem(ctx.supabase, input.projectId, input.linkToId) : null
    if (input.linkToId && !linkTo) return { error: 'Registro a vincular no encontrado' }
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
    if (linkTo) {
      const link = await ctx.supabase.rpc('link_register_items', { p_item_id: linkTo.id, p_linked_item_id: data as string })
      if (link.error) return { id: data as string, error: link.error.message }
      revalidate(input.projectId, linkTo.id)
    }
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

/** Vincula/desvincula dos registros del mismo proyecto (ej. un test pack y sus ciegas). */
export const linkRegisterItems = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; itemId: string; linkedItemId: string; link: boolean }): Promise<{ error?: string }> => {
    const [a, b] = await Promise.all([
      loadItem(ctx.supabase, input.projectId, input.itemId),
      loadItem(ctx.supabase, input.projectId, input.linkedItemId),
    ])
    if (!a || !b) return { error: 'Registro no encontrado' }
    const { error } = await ctx.supabase.rpc('link_register_items', { p_item_id: a.id, p_linked_item_id: b.id, p_link: input.link })
    if (error) return { error: error.message }
    revalidate(input.projectId, a.id)
    revalidate(input.projectId, b.id)
    revalidatePath(`/projects/${input.projectId}/registers/test-packs`)
    return {}
  },
)

// ── Importación Excel de test packs y line list (§8.7) ───────────────────

export type TestPackImportResult = { created: number; updated: number; linesLinked: number; errors: string[]; error?: string }

const MAX_IMPORT_ROWS = 5000

/**
 * Crea packs nuevos o completa los que siguen abiertos (por número TPK-#### o por el número del
 * cliente en `pack_ref`). Las líneas se AGREGAN a las del pack (nunca se quitan) y deben existir
 * como tag del proyecto: las que no existen se reportan por fila.
 */
export const importTestPacks = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; packs: PackImportRow[]; lines: LineImportRow[] }): Promise<TestPackImportResult> => {
    const result: TestPackImportResult = { created: 0, updated: 0, linesLinked: 0, errors: [] }
    if (input.packs.length + input.lines.length > MAX_IMPORT_ROWS) return { ...result, error: `Máximo ${MAX_IMPORT_ROWS} filas por importación` }

    const [{ data: existing }, { data: systems }] = await Promise.all([
      ctx.supabase.from('register_items')
        .select('id, number, title, description, status, data, system_id, register_item_tags(tag_id, role)')
        .eq('project_id', input.projectId).eq('kind', 'test_pack').limit(5000),
      ctx.supabase.from('systems').select('id, code').eq('project_id', input.projectId),
    ])
    type Existing = { id: string; number: string; title: string; description: string | null; status: RegisterStatus; data: Record<string, unknown>; system_id: string | null; register_item_tags: TagRef[] }
    const byKey = new Map<string, Existing>()
    for (const p of (existing ?? []) as unknown as Existing[]) {
      byKey.set(packKey(p.number), p)
      const ref = typeof p.data?.pack_ref === 'string' ? packKey(p.data.pack_ref) : ''
      if (ref && !byKey.has(ref)) byKey.set(ref, p)
    }
    const systemByCode = new Map((systems ?? []).map(s => [s.code.trim().toUpperCase(), s.id as string]))

    // Tags de las líneas, por número (en lotes para no exceder la URL).
    const tagByNumber = new Map<string, string>()
    const numbers = [...new Set(input.lines.map(l => l.line))]
    for (let i = 0; i < numbers.length; i += 200) {
      const { data } = await ctx.supabase.from('tags').select('id, tag_number').eq('project_id', input.projectId).in('tag_number', numbers.slice(i, i + 200))
      for (const tg of data ?? []) tagByNumber.set(tg.tag_number.trim().toUpperCase(), tg.id)
    }
    const linesByPack = new Map<string, string[]>()
    for (const l of input.lines) {
      const tagId = tagByNumber.get(l.line)
      if (!tagId) { result.errors.push(`Líneas, fila ${l.row}: la línea ${l.line} no existe como tag del proyecto`); continue }
      linesByPack.set(l.pack, [...(linesByPack.get(l.pack) ?? []), tagId])
    }

    const packRows = new Map(input.packs.map(p => [p.pack, p]))
    for (const key of new Set([...packRows.keys(), ...linesByPack.keys()])) {
      const row = packRows.get(key)
      const where = row ? `Packs, fila ${row.row}` : `Pack ${key}`
      let systemId: string | null | undefined
      if (row?.system_code) {
        systemId = systemByCode.get(row.system_code)
        if (!systemId) { result.errors.push(`${where}: el sistema ${row.system_code} no existe en el proyecto`); continue }
      }
      const newLines = linesByPack.get(key) ?? []
      const rowData = cleanRegisterData('test_pack', { ...(row?.data ?? {}), ...(isRegisterNumber(key) ? {} : { pack_ref: key }) })
      const current = byKey.get(key)

      if (current) {
        if (!OPEN_STATUSES.includes(current.status)) { result.errors.push(`${where}: ${current.number} está cerrado y no se modifica`); continue }
        const tags = [...current.register_item_tags.map(({ tag_id, role }) => ({ tag_id, role })), ...newLines.map(tag_id => ({ tag_id, role: 'line' as const }))]
        const before = current.register_item_tags.filter(x => x.role === 'line').length
        const cleaned = cleanTags('test_pack', tags)
        const { error } = await ctx.supabase.rpc('update_register_item', {
          p_item_id: current.id,
          p_title: row?.title ?? current.title,
          p_description: current.description ?? '',
          p_system_id: nullable(systemId ?? current.system_id),
          p_data: cleanRegisterData('test_pack', { ...current.data, ...rowData }),
          p_tags: cleaned,
        })
        if (error) { result.errors.push(`${where}: ${error.message}`); continue }
        result.updated++
        result.linesLinked += cleaned.filter(x => x.role === 'line').length - before
      } else {
        if (isRegisterNumber(key)) { result.errors.push(`${where}: no existe el test pack ${key} (los números TPK los asigna CommUp)`); continue }
        const tags = cleanTags('test_pack', newLines.map(tag_id => ({ tag_id, role: 'line' as const })))
        const { error } = await ctx.supabase.rpc('create_register_item', {
          p_project_id: input.projectId,
          p_kind: 'test_pack',
          p_title: (row?.title ?? key).slice(0, 200),
          p_system_id: systemId ?? undefined,
          p_data: rowData,
          p_tags: tags,
        })
        if (error) { result.errors.push(`${where}: ${error.message}`); continue }
        result.created++
        result.linesLinked += tags.length
      }
    }

    revalidate(input.projectId)
    revalidatePath(`/projects/${input.projectId}/registers/test-packs`)
    return result
  },
)
