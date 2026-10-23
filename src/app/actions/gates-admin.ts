'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { accessError } from '@/lib/i18n/action-errors'
import { ADMIN_ROLES } from '@/lib/auth/permissions'
import { withAuthOnly } from '@/lib/auth/withAuth'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, TablesUpdate } from '@/types/supabase.generated'
import { checkPhaseAccess } from '@/lib/auth/access'
import { COSIGN_CAPACITIES, CONFIGURABLE_CRITERIA, gatePolicy, type GatePolicy } from '@/lib/readiness/gates'
import { TRANSFER_CHECK_KEYS, transferNonDispensable } from '@/lib/startup/catalog'
import { logActivity } from '@/lib/log-activity'
import { GATE_APPROVAL_ROLES, READINESS_GATE_CATALOG } from '@/lib/constants/readiness-gates'

// Configuración de gates por org (fase 1 plan readiness). Solo owner/admin; RLS
// (is_org_admin) vuelve a exigirlo en la BD. S11 (D-20): cada cambio en readiness_gates / gate_criteria queda
// en activity_log por trigger; un criterio con declaraciones se borra lógico (trigger gate_criteria_soft_delete).

type Result = { error?: string }

function revalidate() {
  revalidatePath('/admin/gates')
  revalidatePath('/projects/[id]/readiness', 'page')
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
    const t = await getTranslations('ActionErrors')
    const code = cleanCode(input.code)
    const name = input.name.trim()
    if (!code || !name) return { error: t('gatesAdmin.codeNameRequired') }
    if (input.phaseId) {
      const access = await checkPhaseAccess(ctx.supabase, ctx.orgId, input.phaseId)
      if (!access.ok) return { error: await accessError(access) }
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
    if (error) return { error: error.code === '23505' ? t('gatesAdmin.codeExists', { code }) : error.message }

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
    const t = await getTranslations('ActionErrors')
    const item = READINESS_GATE_CATALOG.find(c => c.key === key)
    if (!item) return { error: t('gatesAdmin.catalogNotFound') }

    const { data: gate, error } = await ctx.supabase
      .from('readiness_gates')
      .insert({
        org_id: ctx.orgId,
        code: item.code,
        name: item.name,
        description: item.description,
        order_index: await nextOrder(ctx.supabase, ctx.orgId),
        requires_previous: false,
        requires_lineup: item.requiresLineup ?? false,
      })
      .select('id')
      .single()
    if (error) return { error: error.code === '23505' ? t('gatesAdmin.codeExists', { code: item.code }) : error.message }

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
      requiresPerformance?: boolean
      isStartupGate?: boolean
      isActive?: boolean
      approvalRoles?: string[]
      requiredSignatures?: string[]
      cosignRoles?: string[]
    },
  ): Promise<Result> => {
    const t = await getTranslations('ActionErrors')
    const row: TablesUpdate<'readiness_gates'> = {}
    if ('name' in patch) {
      if (!patch.name?.trim()) return { error: t('gatesAdmin.nameRequired') }
      row.name = patch.name.trim()
    }
    if ('description' in patch) row.description = patch.description?.trim() ? patch.description.trim() : null
    if ('phaseId' in patch) {
      if (patch.phaseId) {
        const access = await checkPhaseAccess(ctx.supabase, ctx.orgId, patch.phaseId)
        if (!access.ok) return { error: await accessError(access) }
      }
      row.phase_id = patch.phaseId ?? null
    }
    if ('requiresPrevious' in patch) row.requires_previous = !!patch.requiresPrevious
    if ('requiresLineup' in patch) row.requires_lineup = !!patch.requiresLineup
    if ('requiresPerformance' in patch) row.requires_performance = !!patch.requiresPerformance
    if ('isActive' in patch) row.is_active = !!patch.isActive
    if ('approvalRoles' in patch) {
      const roles = (patch.approvalRoles ?? []).filter(r => (GATE_APPROVAL_ROLES as readonly string[]).includes(r))
      if (roles.length === 0) return { error: t('gatesAdmin.approvalRoleRequired') }
      row.approval_roles = roles
    }

    if ('requiredSignatures' in patch) {
      row.required_signatures = (patch.requiredSignatures ?? []).filter(c => (COSIGN_CAPACITIES as string[]).includes(c))
    }
    if ('cosignRoles' in patch) {
      const roles = (patch.cosignRoles ?? []).filter(r => (GATE_APPROVAL_ROLES as readonly string[]).includes(r))
      if (roles.length === 0) return { error: t('gatesAdmin.cosignRoleRequired') }
      row.cosign_roles = roles
    }

    // S11 (E-07): un solo gate de arranque por org (índice único): primero se desmarca el actual.
    if (patch.isStartupGate) {
      const { error: clearErr } = await ctx.supabase.from('readiness_gates').update({ is_startup_gate: false })
        .eq('org_id', ctx.orgId).eq('is_startup_gate', true).neq('id', gateId)
      if (clearErr) return { error: clearErr.message }
      row.is_startup_gate = true
    } else if ('isStartupGate' in patch) {
      row.is_startup_gate = false
    }

    const { error } = await ctx.supabase.from('readiness_gates').update(row).eq('id', gateId).eq('org_id', ctx.orgId)
    if (error) return { error: error.message }
    revalidate()
    return {}
  },
)

/** S11 (D13): política de regresión de la org (`organizations.settings.gate_policy`). */
export const updateGatePolicy = withAuthOnly(
  { role: ADMIN_ROLES },
  async (ctx, patch: Partial<GatePolicy>): Promise<Result> => {
    const { data: org, error: fetchErr } = await ctx.supabase.from('organizations').select('settings').eq('id', ctx.orgId).single()
    if (fetchErr) return { error: fetchErr.message }
    const settings = (org?.settings as Record<string, unknown> | null) ?? {}
    const before = gatePolicy(settings)
    const next = gatePolicy({ gate_policy: { ...before, ...patch } })
    const { error } = await ctx.supabase.from('organizations').update({ settings: { ...settings, gate_policy: next } }).eq('id', ctx.orgId)
    if (error) return { error: error.message }
    await logActivity(ctx.supabase, {
      orgId: ctx.orgId, userId: ctx.userId, action: 'gate_policy.updated', entityType: 'organization', entityId: ctx.orgId,
      payload: { before, after: next },
    })
    revalidate()
    return {}
  },
)

/** S25 (E-13): ítems del checklist de traspaso que no se pueden dispensar (`organizations.settings.transfer_policy`). */
export const updateTransferPolicy = withAuthOnly(
  { role: ADMIN_ROLES },
  async (ctx, nonDispensable: string[]): Promise<Result> => {
    const { data: org, error: fetchErr } = await ctx.supabase.from('organizations').select('settings').eq('id', ctx.orgId).single()
    if (fetchErr) return { error: fetchErr.message }
    const settings = (org?.settings as Record<string, unknown> | null) ?? {}
    const before = transferNonDispensable(settings)
    const next = TRANSFER_CHECK_KEYS.filter(k => nonDispensable.includes(k))
    const { error } = await ctx.supabase.from('organizations').update({ settings: { ...settings, transfer_policy: { non_dispensable: next } } }).eq('id', ctx.orgId)
    if (error) return { error: error.message }
    await logActivity(ctx.supabase, {
      orgId: ctx.orgId, userId: ctx.userId, action: 'transfer_policy.updated', entityType: 'organization', entityId: ctx.orgId,
      payload: { before, after: next },
    })
    revalidate()
    return {}
  },
)

/** S11 (D-20): impacto de quitar un criterio, para la confirmación (declaraciones y sistemas afectados). */
export const gateCriterionImpact = withAuthOnly(
  { role: ADMIN_ROLES },
  async (ctx, criterionId: string): Promise<{ attestations?: number; systems?: number; error?: string }> => {
    const { data, error } = await ctx.supabase.from('system_gate_attestations').select('system_id, revoked_at')
      .eq('criterion_id', criterionId).eq('org_id', ctx.orgId).limit(1000)  // bounded: confirmación, un criterio
    if (error) return { error: error.message }
    const live = (data ?? []).filter(a => !a.revoked_at)
    return { attestations: live.length, systems: new Set(live.map(a => a.system_id)).size }
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
    const t = await getTranslations('ActionErrors')
    const { count } = await ctx.supabase
      .from('system_gate_approvals')
      .select('id', { count: 'exact', head: true })
      .eq('gate_id', gateId)
    if ((count ?? 0) > 0) return { error: t('gatesAdmin.hasApprovals') }
    // S11 (D-20): tampoco si alguno de sus criterios tiene declaraciones (se perdería la evidencia).
    const { count: atts } = await ctx.supabase
      .from('system_gate_attestations')
      .select('id, gate_criteria!inner(gate_id)', { count: 'exact', head: true })
      .eq('gate_criteria.gate_id', gateId)
    if ((atts ?? 0) > 0) return { error: t('gatesAdmin.hasAttestations') }

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
    const t = await getTranslations('ActionErrors')
    if (!(CONFIGURABLE_CRITERIA as string[]).includes(input.kind)) return { error: t('gatesAdmin.invalidCriterion') }
    const label = input.label?.trim().slice(0, 300) ?? ''
    if (input.kind === 'manual_attestation' && !label) return { error: t('gatesAdmin.attestationLabelRequired') }

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
