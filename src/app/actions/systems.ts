'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'
import { logActivity } from '@/lib/log-activity'
import {
  DEPENDENCY_KINDS,
  SYSTEM_TYPES,
  cleanBatteryLimits,
  defaultDependencyGates,
  type DependencyKind,
  type SystemType,
} from '@/lib/systems/dependencies'
import { normalizeSystemColor } from '@/lib/systems/colors'
import type { DependencyImportRow, SystemImportRow } from '@/lib/systems/import'
import type { TablesUpdate } from '@/types/supabase.generated'

// Sistematización (fase 2 plan readiness). La BD valida coherencia, ciclos y quién congela
// (triggers de la migración 20261015120000); aquí: rol editor, propiedad de los ids y defaults.

const systemGuards = [
  { resource: 'project' as const, field: 'projectId' },
  { resource: 'system' as const, field: 'systemId', scopeField: 'projectId' },
]

function revalidate(projectId: string, systemId?: string) {
  revalidatePath(`/projects/${projectId}/systems`)
  if (systemId) revalidatePath(`/projects/${projectId}/systems/${systemId}`)
  revalidatePath(`/projects/${projectId}/readiness`)
  if (systemId) revalidatePath(`/projects/${projectId}/systems/${systemId}`)
}

/** Errores de Postgres → mensaje para el usuario (los de nuestros triggers ya vienen en español). */
async function dbError(err: { code?: string; message: string }): Promise<string> {
  const t = await getTranslations('ActionErrors')
  if (err.code === '23505') return t('systems.dependencyExists')
  if (err.code === '23514' && /priority/.test(err.message)) return t('systems.priorityRange')
  if (err.code === '23514' && /systems_color_hex/.test(err.message)) return t('systems.colorInvalid')
  if (err.code === '23514' && /battery_limits/.test(err.message)) return t('systems.batteryLimitsInvalid')
  return err.message
}

/** '' → undefined, para que el formulario vacío caiga al valor por defecto con `??`. */
function blank(s: string | null | undefined): string | undefined {
  return s?.trim().length ? s : undefined
}

async function orgGates(ctx: { supabase: SupabaseClient<Database>; orgId: string }) {
  const { data } = await ctx.supabase
    .from('readiness_gates')
    .select('id, code, order_index, is_active')
    .eq('org_id', ctx.orgId)
  return data ?? []
}

// ── Atributos ────────────────────────────────────────────────────────────

export const updateSystem = withAuth(
  { role: EDITOR_ROLES, guards: systemGuards },
  async (
    ctx,
    input: {
      projectId: string
      systemId: string
      name?: string
      system_type?: SystemType | null
      priority?: number | null
      battery_limits?: Record<string, unknown>
      /** P1: color en el P&ID; null = que la BD asigne el menos usado del proyecto. */
      color?: string | null
    },
  ): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    // Parche parcial: solo se toca lo que viene en el input.
    const patch: TablesUpdate<'systems'> = {}
    if ('name' in input) {
      const name = (input.name ?? '').trim()
      if (!name) return { error: t('systems.nameRequired') }
      patch.name = name.slice(0, 200)
    }
    if ('system_type' in input) {
      if (input.system_type != null && !SYSTEM_TYPES.includes(input.system_type)) return { error: t('systems.typeInvalid') }
      patch.system_type = input.system_type ?? null
    }
    if ('priority' in input) {
      if (input.priority != null && !(Number.isInteger(input.priority) && input.priority >= 1 && input.priority <= 5)) return { error: t('systems.priorityRange') }
      patch.priority = input.priority ?? null
    }
    if ('color' in input) {
      const color = input.color == null ? '' : normalizeSystemColor(input.color)
      if (color === null) return { error: t('systems.colorInvalid') }
      // '' = que el trigger system_assign_color ponga el menos usado del proyecto.
      patch.color = color
    }
    if ('battery_limits' in input) patch.battery_limits = cleanBatteryLimits(input.battery_limits ?? {})
    if (!Object.keys(patch).length) return {}

    const { error } = await ctx.supabase.from('systems').update(patch).eq('id', input.systemId).eq('project_id', input.projectId)
    if (error) return { error: await dbError(error) }
    revalidate(input.projectId, input.systemId)
    return {}
  },
)

/** Congelar/descongelar límites: informativo; la BD fija quién y audita cambios posteriores. */
export const setSystemBoundaryFrozen = withAuth(
  { role: EDITOR_ROLES, guards: systemGuards },
  async (ctx, input: { projectId: string; systemId: string; frozen: boolean }): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase
      .from('systems')
      .update({ boundary_frozen_at: input.frozen ? new Date().toISOString() : null })
      .eq('id', input.systemId)
      .eq('project_id', input.projectId)
    if (error) return { error: await dbError(error) }
    revalidate(input.projectId, input.systemId)
    return {}
  },
)

// ── Dependencias ─────────────────────────────────────────────────────────

export const addSystemDependency = withAuth(
  {
    role: EDITOR_ROLES,
    guards: [...systemGuards, { resource: 'system' as const, field: 'providerId', scopeField: 'projectId' }],
  },
  async (
    ctx,
    input: {
      projectId: string
      systemId: string
      providerId: string
      kind: DependencyKind
      requiredGateId?: string | null
      blockedGateId?: string | null
      notes?: string | null
    },
  ): Promise<{ id?: string; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!DEPENDENCY_KINDS.includes(input.kind)) return { error: t('systems.dependencyKindInvalid') }
    if (input.systemId === input.providerId) return { error: t('systems.selfDependency') }

    const gates = await orgGates(ctx)
    const def = defaultDependencyGates(input.kind, gates)
    // '' o null en el formulario = usar el valor por defecto del tipo.
    const requiredGateId = blank(input.requiredGateId) ?? def?.requiredGateId
    const blockedGateId = blank(input.blockedGateId) ?? def?.blockedGateId
    const notes = input.notes?.trim().slice(0, 1000)
    if (!requiredGateId || !blockedGateId) return { error: t('systems.noActiveGates') }
    const ids = new Set(gates.map(g => g.id))
    if (!ids.has(requiredGateId) || !ids.has(blockedGateId)) return { error: t('systems.gateInvalid') }

    const { data, error } = await ctx.supabase
      .from('system_dependencies')
      .insert({
        org_id: ctx.orgId,
        project_id: input.projectId,
        system_id: input.systemId,
        depends_on_system_id: input.providerId,
        kind: input.kind,
        required_gate_id: requiredGateId,
        blocked_gate_id: blockedGateId,
        notes: blank(notes) ?? null,
        source: 'manual',
      })
      .select('id')
      .single()
    if (error) return { error: await dbError(error) }

    await logActivity(ctx.supabase, {
      orgId: ctx.orgId, userId: ctx.userId, action: 'system.dependency_added', entityType: 'system', entityId: input.systemId,
      payload: { project_id: input.projectId, depends_on_system_id: input.providerId, kind: input.kind },
    })
    revalidate(input.projectId, input.systemId)
    revalidatePath(`/projects/${input.projectId}/systems/${input.providerId}`)
    return { id: data.id }
  },
)

export const removeSystemDependency = withAuth(
  { role: EDITOR_ROLES, guards: systemGuards },
  async (ctx, input: { projectId: string; systemId: string; dependencyId: string }): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    const { data, error } = await ctx.supabase
      .from('system_dependencies')
      .delete()
      .eq('id', input.dependencyId)
      .eq('system_id', input.systemId)
      .eq('project_id', input.projectId)
      .select('depends_on_system_id')
    if (error) return { error: await dbError(error) }
    if (!data?.length) return { error: t('systems.dependencyNotFound') }

    await logActivity(ctx.supabase, {
      orgId: ctx.orgId, userId: ctx.userId, action: 'system.dependency_removed', entityType: 'system', entityId: input.systemId,
      payload: { project_id: input.projectId, depends_on_system_id: data[0].depends_on_system_id },
    })
    revalidate(input.projectId, input.systemId)
    revalidatePath(`/projects/${input.projectId}/systems/${data[0].depends_on_system_id}`)
    return {}
  },
)

// ── Importación Excel ────────────────────────────────────────────────────

export type SystemsImportResult = {
  systemsUpdated: number
  dependenciesCreated: number
  dependenciesExisting: number
  errors: string[]
  error?: string
}

const MAX_IMPORT_ROWS = 2000

export const importSystemsWorkbook = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project' as const, field: 'projectId' }] },
  async (
    ctx,
    input: { projectId: string; systems: SystemImportRow[]; dependencies: DependencyImportRow[] },
  ): Promise<SystemsImportResult> => {
    const t = await getTranslations('ActionErrors')
    const result: SystemsImportResult = { systemsUpdated: 0, dependenciesCreated: 0, dependenciesExisting: 0, errors: [] }
    if (input.systems.length + input.dependencies.length > MAX_IMPORT_ROWS) {
      return { ...result, error: t('systems.maxRows', { max: MAX_IMPORT_ROWS }) }
    }

    const [{ data: systems }, gates] = await Promise.all([
      ctx.supabase.from('systems').select('id, code').eq('project_id', input.projectId),
      orgGates(ctx),
    ])
    const idByCode = new Map((systems ?? []).map(s => [s.code.trim().toUpperCase(), s.id as string]))
    const gateByCode = new Map(gates.filter(g => g.is_active).map(g => [g.code.trim().toUpperCase(), g.id]))

    // 1) Atributos de sistemas existentes (el importador de jerarquía es quien los crea).
    for (const r of input.systems) {
      const id = idByCode.get(r.system_code)
      if (!id) { result.errors.push(t('systems.importSystemMissing', { row: r.row, code: r.system_code })); continue }
      // Celdas vacías no borran lo ya cargado: solo se escribe lo que trae el Excel.
      const patch: TablesUpdate<'systems'> = {}
      const limits = cleanBatteryLimits(r.battery_limits ?? {})
      if (Object.keys(limits).length) patch.battery_limits = limits
      if (r.name?.trim()) patch.name = r.name.trim().slice(0, 200)
      if (r.system_type && SYSTEM_TYPES.includes(r.system_type)) patch.system_type = r.system_type
      if (r.priority != null && Number.isInteger(r.priority) && r.priority >= 1 && r.priority <= 5) patch.priority = r.priority
      if (!Object.keys(patch).length) continue
      const { error } = await ctx.supabase.from('systems').update(patch).eq('id', id).eq('project_id', input.projectId)
      if (error) result.errors.push(t('systems.importSystemRowError', { row: r.row, error: await dbError(error) }))
      else result.systemsUpdated++
    }

    // 2) Dependencias, una por una para reportar ciclos y duplicados por fila.
    for (const r of input.dependencies) {
      const systemId = idByCode.get(r.system_code)
      const providerId = idByCode.get(r.depends_on_code)
      if (!systemId || !providerId) {
        result.errors.push(t('systems.importDepSystemMissing', { row: r.row, code: !systemId ? r.system_code : r.depends_on_code }))
        continue
      }
      if (!DEPENDENCY_KINDS.includes(r.kind)) { result.errors.push(t('systems.importDepKindInvalid', { row: r.row })); continue }
      const def = defaultDependencyGates(r.kind, gates)
      const requiredGateId = r.required_gate_code ? gateByCode.get(r.required_gate_code) : def?.requiredGateId
      const blockedGateId = r.blocked_gate_code ? gateByCode.get(r.blocked_gate_code) : def?.blockedGateId
      if (!requiredGateId || !blockedGateId) {
        result.errors.push(t('systems.importDepGateMissing', { row: r.row, gate: (!requiredGateId ? r.required_gate_code : r.blocked_gate_code) ?? '—' }))
        continue
      }
      const { error } = await ctx.supabase.from('system_dependencies').insert({
        org_id: ctx.orgId,
        project_id: input.projectId,
        system_id: systemId,
        depends_on_system_id: providerId,
        kind: r.kind,
        required_gate_id: requiredGateId,
        blocked_gate_id: blockedGateId,
        notes: r.notes ? r.notes.slice(0, 1000) : null,
        source: 'import',
      })
      if (error?.code === '23505') result.dependenciesExisting++
      else if (error) result.errors.push(t('systems.importDepRowError', { row: r.row, system: r.system_code, provider: r.depends_on_code, error: await dbError(error) }))
      else result.dependenciesCreated++
    }

    await logActivity(ctx.supabase, {
      orgId: ctx.orgId, userId: ctx.userId, action: 'system.import', entityType: 'project', entityId: input.projectId,
      payload: { systems_updated: result.systemsUpdated, dependencies_created: result.dependenciesCreated, errors: result.errors.length },
    })
    revalidate(input.projectId)
    return result
  },
)
