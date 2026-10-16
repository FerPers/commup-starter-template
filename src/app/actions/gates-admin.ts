'use server'

import { revalidatePath } from 'next/cache'
import { ADMIN_ROLES } from '@/lib/auth/permissions'
import { withAuthOnly } from '@/lib/auth/withAuth'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, TablesUpdate } from '@/types/supabase.generated'
import { checkPhaseAccess } from '@/lib/auth/access'
import { COSIGN_CAPACITIES, CONFIGURABLE_CRITERIA } from '@/lib/readiness/gates'
import { GATE_APPROVAL_ROLES, READINESS_GATE_CATALOG } from '@/lib/constants/readiness-gates'

// Configuración de gates por org (fase 1 plan readiness). Solo owner/admin; RLS
// (is_org_admin) vuelve a exigirlo en la BD.

type Result = { error?: string }

function revalidate() {
  revalidatePath('/admin/gates')
  revalidatePath('/control-tower')
}

function cleanCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '-').slice(0, 20)
}

async function nextOrder(supabase: SupabaseClient<Database>, orgId: string) {
  const { data } = await supabase
    .from('readiness_gates')
    .select('order_index')
    .eq('org_id', orgId)
    .order('order_index', { ascending: false })
    .limit(1)
  return (data?.[0]?.order_index ?? 0) + 10
}

export const createGate = withAuthOnly(
  { role: ADMIN_ROLES },
  async (ctx, input: { code: string; name: string; phaseId?: string | null }): Promise<Result> => {
    const code = cleanCode(input.code)
    const name = input.name.trim()
    if (!code || !name) return { error: 'Código y nombre son obligatorios' }
    if (input.phaseId) {
      const access = await checkPhaseAccess(ctx.supabase, ctx.orgId, input.phaseId)
      if (!access.ok) return { error: access.error }
    }

    const { data: gate, error } = await ctx.supabase
      .from('readiness_gates')
      .insert({
        org_id: ctx.orgId,
        code,
        name,
        phase_id: input.phaseId ?? null,
        order_index: await nextOrder(ctx.supabase, ctx.orgId),
        requires_previous: false,
      })
      .select('id')
      .single()
    if (error) return { error: error.code === '23505' ? `Ya existe un gate con código ${code}` : error.message }

    const criteria = input.phaseId
      ? [
          { kind: 'itr_phase_approved', params: {}, order_index: 10 },
          { kind: 'critical_tags_ready', params: { levels: ['safety', 'process'] }, order_index: 20 },
        ]
      : [{ kind: 'manual_attestation', params: { label: 'Declaración de cumplimiento con evidencia' }, order_index: 10 }]
    await ctx.supabase.from('gate_criteria').insert(criteria.map(c => ({ ...c, gate_id: gate.id, org_id: ctx.orgId })))

    revalidate()
    return {}
  },
)

export const addCatalogGate = withAuthOnly(
  { role: ADMIN_ROLES },
  async (ctx, key: string): Promise<Result> => {
    const item = READINESS_GATE_CATALOG.find(c => c.key === key)
    if (!item) return { error: 'Gate de catálogo no encontrado' }

    const { data: gate, error } = await ctx.supabase
      .from('readiness_gates')
      .insert({
        org_id: ctx.orgId,
        code: item.code,
        name: item.name,
        description: item.description,
        order_index: await nextOrder(ctx.supabase, ctx.orgId),
        requires_previous: false,
      })
      .select('id')
      .single()
    if (error) return { error: error.code === '23505' ? `El gate ${item.code} ya existe en la organización` : error.message }

    await ctx.supabase.from('gate_criteria').insert(
      item.criteria.map((c, i) => ({
        gate_id: gate.id,
        org_id: ctx.orgId,
        kind: c.kind,
        params: c.kind === 'critical_tags_ready' ? { levels: ['safety', 'process'] } : c.label ? { label: c.label } : {},
        order_index: (i + 1) * 10,
      })),
    )
    revalidate()
    return {}
  },
)

export const updateGate = withAuthOnly(
  { role: ADMIN_ROLES },
  async (
    ctx,
    gateId: string,
    patch: {
      name?: string
      description?: string | null
      phaseId?: string | null
      requiresPrevious?: boolean
      requiresLineup?: boolean
      isActive?: boolean
      approvalRoles?: string[]
      requiredSignatures?: string[]
      cosignRoles?: string[]
    },
  ): Promise<Result> => {
    const row: TablesUpdate<'readiness_gates'> = {}
    if ('name' in patch) {
      if (!patch.name?.trim()) return { error: 'El nombre es obligatorio' }
      row.name = patch.name.trim()
    }
    if ('description' in patch) row.description = patch.description?.trim() ? patch.description.trim() : null
    if ('phaseId' in patch) {
      if (patch.phaseId) {
        const access = await checkPhaseAccess(ctx.supabase, ctx.orgId, patch.phaseId)
        if (!access.ok) return { error: access.error }
      }
      row.phase_id = patch.phaseId ?? null
    }
    if ('requiresPrevious' in patch) row.requires_previous = !!patch.requiresPrevious
    if ('requiresLineup' in patch) row.requires_lineup = !!patch.requiresLineup
    if ('isActive' in patch) row.is_active = !!patch.isActive
    if ('approvalRoles' in patch) {
      const roles = (patch.approvalRoles ?? []).filter(r => (GATE_APPROVAL_ROLES as readonly string[]).includes(r))
      if (roles.length === 0) return { error: 'Al menos un rol debe poder aprobar el gate' }
      row.approval_roles = roles
    }

    if ('requiredSignatures' in patch) {
      row.required_signatures = (patch.requiredSignatures ?? []).filter(c => (COSIGN_CAPACITIES as string[]).includes(c))
    }
    if ('cosignRoles' in patch) {
      const roles = (patch.cosignRoles ?? []).filter(r => (GATE_APPROVAL_ROLES as readonly string[]).includes(r))
      if (roles.length === 0) return { error: 'Al menos un rol debe poder co-firmar el gate' }
      row.cosign_roles = roles
    }

    const { error } = await ctx.supabase.from('readiness_gates').update(row).eq('id', gateId).eq('org_id', ctx.orgId)
    if (error) return { error: error.message }
    revalidate()
    return {}
  },
)

/** Sube o baja un gate intercambiando su orden con el vecino. */
export const moveGate = withAuthOnly(
  { role: ADMIN_ROLES },
  async (ctx, gateId: string, direction: 'up' | 'down'): Promise<Result> => {
    const { data: gates } = await ctx.supabase
      .from('readiness_gates')
      .select('id, order_index')
      .eq('org_id', ctx.orgId)
      .order('order_index')
      .order('code')
    const list = gates ?? []
    const i = list.findIndex(g => g.id === gateId)
    const j = direction === 'up' ? i - 1 : i + 1
    if (i < 0 || j < 0 || j >= list.length) return {}

    // Reasigna un orden limpio (10, 20, …) con el par intercambiado.
    ;[list[i], list[j]] = [list[j], list[i]]
    for (let k = 0; k < list.length; k++) {
      const order = (k + 1) * 10
      if (list[k].order_index !== order) {
        const { error } = await ctx.supabase.from('readiness_gates').update({ order_index: order }).eq('id', list[k].id).eq('org_id', ctx.orgId)
        if (error) return { error: error.message }
      }
    }
    revalidate()
    return {}
  },
)

export const deleteGate = withAuthOnly(
  { role: ADMIN_ROLES },
  async (ctx, gateId: string): Promise<Result> => {
    const { count } = await ctx.supabase
      .from('system_gate_approvals')
      .select('id', { count: 'exact', head: true })
      .eq('gate_id', gateId)
    if ((count ?? 0) > 0) return { error: 'El gate tiene aprobaciones registradas: desactívalo en lugar de borrarlo' }

    const { error } = await ctx.supabase.from('readiness_gates').delete().eq('id', gateId).eq('org_id', ctx.orgId)
    if (error) return { error: error.message }
    revalidate()
    return {}
  },
)

export const addGateCriterion = withAuthOnly(
  { role: ADMIN_ROLES },
  async (
    ctx,
    input: { gateId: string; kind: string; label?: string; isBlocking?: boolean },
  ): Promise<Result> => {
    if (!(CONFIGURABLE_CRITERIA as string[]).includes(input.kind)) return { error: 'Tipo de criterio no válido' }
    const label = input.label?.trim().slice(0, 300) ?? ''
    if (input.kind === 'manual_attestation' && !label) return { error: 'La declaración necesita un texto' }

    const { data: last } = await ctx.supabase
      .from('gate_criteria')
      .select('order_index')
      .eq('gate_id', input.gateId)
      .order('order_index', { ascending: false })
      .limit(1)

    const params: { label?: string; levels?: string[] } = {}
    if (label) params.label = label
    if (input.kind === 'critical_tags_ready') params.levels = ['safety', 'process']

    const { error } = await ctx.supabase.from('gate_criteria').insert({
      gate_id: input.gateId,
      org_id: ctx.orgId,
      kind: input.kind,
      params,
      is_blocking: input.isBlocking ?? true,
      order_index: (last?.[0]?.order_index ?? 0) + 10,
    })
    if (error) return { error: error.message }
    revalidate()
    return {}
  },
)

export const updateGateCriterion = withAuthOnly(
  { role: ADMIN_ROLES },
  async (ctx, criterionId: string, patch: { isBlocking: boolean }): Promise<Result> => {
    const { error } = await ctx.supabase
      .from('gate_criteria')
      .update({ is_blocking: patch.isBlocking })
      .eq('id', criterionId)
      .eq('org_id', ctx.orgId)
    if (error) return { error: error.message }
    revalidate()
    return {}
  },
)

export const deleteGateCriterion = withAuthOnly(
  { role: ADMIN_ROLES },
  async (ctx, criterionId: string): Promise<Result> => {
    const { error } = await ctx.supabase.from('gate_criteria').delete().eq('id', criterionId).eq('org_id', ctx.orgId)
    if (error) return { error: error.message }
    revalidate()
    return {}
  },
)
