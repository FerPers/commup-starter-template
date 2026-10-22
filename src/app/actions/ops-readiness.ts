'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { withAuth } from '@/lib/auth/withAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateHandoverPackage } from '@/lib/handover/generate'
import { logActivity } from '@/lib/log-activity'
import type { Json } from '@/types/supabase.generated'
import { EVIDENCE_KINDS, OWNERSHIP_STAGES, SPARE_STATUSES, type EvidenceKind, type OwnershipStage, type SpareStatus } from '@/lib/startup/catalog'

// Readiness de operaciones (fase 6 plan readiness, sesión 3): personal, competencias, repuestos y traspaso de
// propiedad del sistema. Escritura por RPC SECURITY DEFINER (migración 20261018150000); aquí: guards,
// validación y la generación del paquete de handover al completarse un traspaso a Operaciones (§12.23).

const projectGuard = [{ resource: 'project' as const, field: 'projectId' }]
const systemGuard = { resource: 'system' as const, field: 'systemId', scopeField: 'projectId' }
const opt = (v: string | null | undefined) => ((v ?? '') === '' ? undefined : v!)

function revalidate(projectId: string, transferId?: string) {
  revalidatePath(`/projects/${projectId}/startup/operations`)
  if (transferId) revalidatePath(`/projects/${projectId}/startup/transfers/${transferId}`)
  revalidatePath('/my-work')
  revalidatePath('/control-tower', 'layout')
}

async function transferOf(db: SupabaseClient, id: string, projectId: string) {
  const { data } = await db.from('ownership_transfers').select('id, system_id, to_stage, is_reversal, status, handover_package_id')
    .eq('id', id).eq('project_id', projectId).maybeSingle()
  return data
}

// ── Personal y competencias ─────────────────────────────────────────────
export const upsertOpsPerson = withAuth(
  { guards: projectGuard },
  async (
    ctx,
    input: { projectId: string; personId?: string | null; fullName: string; company?: string; position?: string; shift?: string; userId?: string | null; active?: boolean },
  ): Promise<{ id?: string; error?: string }> => {
    if (!input.fullName?.trim()) return { error: 'El nombre es obligatorio' }
    const { data, error } = await ctx.supabase.rpc('upsert_ops_person', {
      p_project_id: input.projectId, p_person_id: (opt(input.personId) ?? null) as unknown as string, p_full_name: input.fullName.trim().slice(0, 200),
      p_company: opt(input.company?.trim()), p_position: opt(input.position?.trim()), p_shift: opt(input.shift?.trim()),
      p_user_id: opt(input.userId), p_active: input.active ?? true,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId)
    return { id: data as string }
  },
)

export const recordCompetency = withAuth(
  { guards: [...projectGuard, systemGuard] },
  async (
    ctx,
    input: { projectId: string; systemId: string; personId: string; level: number; evidenceKind: EvidenceKind; evidence?: string; assessedAt?: string; expiresAt?: string | null },
  ): Promise<{ error?: string }> => {
    if (!Number.isInteger(input.level) || input.level < 0 || input.level > 4) return { error: 'Nivel no válido (0–4)' }
    if (!EVIDENCE_KINDS.includes(input.evidenceKind)) return { error: 'Tipo de evidencia no válido' }
    const { data: person } = await ctx.supabase.from('ops_personnel').select('id').eq('id', input.personId).eq('project_id', input.projectId).maybeSingle()
    if (!person) return { error: 'Persona no encontrada' }
    const { error } = await ctx.supabase.rpc('record_competency', {
      p_person_id: input.personId, p_system_id: input.systemId, p_level: input.level, p_evidence_kind: input.evidenceKind,
      p_evidence: opt(input.evidence?.trim()), p_assessed_at: opt(input.assessedAt), p_expires_at: opt(input.expiresAt),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId)
    return {}
  },
)

/** S25 (E-12): anula un registro de competencia erróneo (líder+ o quien lo registró), con motivo. */
export const voidCompetencyRecord = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; recordId: string; reason: string }): Promise<{ error?: string }> => {
    const { data: rec } = await ctx.supabase.from('competency_records').select('id').eq('id', input.recordId).eq('project_id', input.projectId).maybeSingle()
    if (!rec) return { error: 'Registro no encontrado' }
    const { error } = await ctx.supabase.rpc('void_competency_record', { p_record_id: input.recordId, p_reason: input.reason.trim().slice(0, 2000) })
    if (error) return { error: error.message }
    revalidate(input.projectId)
    return {}
  },
)

export const setCompetencyTarget = withAuth(
  { guards: [...projectGuard, systemGuard] },
  async (ctx, input: { projectId: string; systemId: string; required: number }): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.rpc('set_competency_target', { p_system_id: input.systemId, p_required: input.required })
    if (error) return { error: error.message }
    revalidate(input.projectId)
    return {}
  },
)

// ── Repuestos ───────────────────────────────────────────────────────────
export const upsertCriticalSpare = withAuth(
  { guards: [...projectGuard, systemGuard] },
  async (
    ctx,
    input: {
      projectId: string; systemId: string; spareId?: string | null; item: string; kind: 'spare' | 'special_tool'; partNumber?: string; tagId?: string | null
      isCritical: boolean; qtyRequired: number; qtyAvailable: number; status: SpareStatus; eta?: string | null; notes?: string
    },
  ): Promise<{ id?: string; error?: string }> => {
    if (!SPARE_STATUSES.includes(input.status)) return { error: 'Estado no válido' }
    if (!input.item?.trim()) return { error: 'El ítem es obligatorio' }
    if (!(input.qtyRequired >= 0) || !(input.qtyAvailable >= 0)) return { error: 'Cantidades no válidas' }
    const { data, error } = await ctx.supabase.rpc('upsert_critical_spare', {
      p_project_id: input.projectId, p_spare_id: (opt(input.spareId) ?? null) as unknown as string, p_system_id: input.systemId, p_item: input.item.trim().slice(0, 200),
      p_kind: input.kind, p_part_number: opt(input.partNumber?.trim()), p_tag_id: opt(input.tagId), p_is_critical: input.isCritical,
      p_qty_required: input.qtyRequired, p_qty_available: input.qtyAvailable, p_status: input.status, p_eta: opt(input.eta),
      p_notes: opt(input.notes?.trim()),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId)
    return { id: data as string }
  },
)

export const deleteCriticalSpare = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; spareId: string }): Promise<{ error?: string }> => {
    const { data } = await ctx.supabase.from('critical_spares').select('id').eq('id', input.spareId).eq('project_id', input.projectId).maybeSingle()
    if (!data) return { error: 'Repuesto no encontrado' }
    const { error } = await ctx.supabase.rpc('delete_critical_spare', { p_spare_id: input.spareId })
    if (error) return { error: error.message }
    revalidate(input.projectId)
    return {}
  },
)

// ── Traspasos ───────────────────────────────────────────────────────────
export const requestOwnershipTransfer = withAuth(
  { guards: [...projectGuard, systemGuard] },
  async (
    ctx,
    input: { projectId: string; systemId: string; toStage: OwnershipStage; exceptions?: { key: string; justification: string }[]; reason?: string },
  ): Promise<{ id?: string; error?: string }> => {
    if (!OWNERSHIP_STAGES.includes(input.toStage)) return { error: 'Etapa no válida' }
    const exceptions = (input.exceptions ?? []).filter(e => e.justification?.trim()).slice(0, 20)
      .map(e => ({ key: e.key.slice(0, 60), justification: e.justification.trim().slice(0, 2000) }))
    const { data, error } = await ctx.supabase.rpc('request_ownership_transfer', {
      p_system_id: input.systemId, p_to_stage: input.toStage, p_exceptions: exceptions as Json, p_reason: opt(input.reason?.trim()),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, data as string)
    return { id: data as string }
  },
)

/** Genera el paquete de handover del sistema y lo enlaza al traspaso (service role; el traspaso ya se verificó). */
async function generateForTransfer(orgId: string, projectId: string, transferId: string, systemId: string, actorId: string): Promise<{ error?: string }> {
  const admin = createAdminClient()
  try {
    const res = await generateHandoverPackage(admin, { orgId, projectId, systemIds: [systemId], formats: ['pdf', 'json', 'zip'], actorId, source: 'ui', keyId: null })
    const { error } = await admin.rpc('link_transfer_handover', { p_transfer_id: transferId, p_package_id: res.packageId })
    return error ? { error: error.message } : {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export const signOwnershipTransfer = withAuth(
  { guards: projectGuard },
  async (
    ctx,
    /** S25 (E-13): `acknowledged` = claves de las excepciones que el firmante reconoció una por una. */
    input: { projectId: string; transferId: string; capacity: 'commissioning' | 'operations'; acknowledged: string[] },
  ): Promise<{ status?: string; handoverError?: string; error?: string }> => {
    const tr = await transferOf(ctx.supabase, input.transferId, input.projectId)
    if (!tr) return { error: 'Traspaso no encontrado' }
    const { data, error } = await ctx.supabase.rpc('sign_ownership_transfer', {
      p_transfer_id: input.transferId, p_capacity: input.capacity, p_acknowledged: input.acknowledged.slice(0, 20).map(k => k.slice(0, 60)),
    })
    if (error) return { error: error.message }
    let handoverError: string | undefined
    if (data === 'completed') {
      await logActivity(ctx.supabase, {
        orgId: ctx.orgId, userId: ctx.userId, action: 'system.ownership_transferred', entityType: 'system', entityId: tr.system_id,
        payload: { project_id: input.projectId, transfer_id: tr.id, to_stage: tr.to_stage, reversal: tr.is_reversal },
      })
      if (tr.to_stage === 'operations' && !tr.is_reversal) {
        handoverError = (await generateForTransfer(ctx.orgId, input.projectId, tr.id, tr.system_id, ctx.userId)).error
      }
    }
    revalidate(input.projectId, input.transferId)
    return { status: data as string, handoverError }
  },
)

/** Reintento manual si la generación automática del paquete falló. */
export const generateTransferHandover = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; transferId: string }): Promise<{ error?: string }> => {
    const tr = await transferOf(ctx.supabase, input.transferId, input.projectId)
    if (!tr) return { error: 'Traspaso no encontrado' }
    if (tr.status !== 'completed' || tr.to_stage !== 'operations' || tr.is_reversal) return { error: 'Solo para traspasos completados a Operaciones' }
    if (tr.handover_package_id) return { error: 'El traspaso ya tiene paquete de handover' }
    if (ctx.role === 'client') return { error: 'Access denied' }
    const res = await generateForTransfer(ctx.orgId, input.projectId, tr.id, tr.system_id, ctx.userId)
    revalidate(input.projectId, input.transferId)
    return res
  },
)

export const cancelOwnershipTransfer = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; transferId: string; reason: string }): Promise<{ error?: string }> => {
    if (!(await transferOf(ctx.supabase, input.transferId, input.projectId))) return { error: 'Traspaso no encontrado' }
    const { error } = await ctx.supabase.rpc('cancel_ownership_transfer', { p_transfer_id: input.transferId, p_reason: input.reason.slice(0, 2000) })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.transferId)
    return {}
  },
)

export const getOwnershipChecklist = withAuth(
  { guards: [...projectGuard, systemGuard] },
  async (ctx, input: { projectId: string; systemId: string; toStage: OwnershipStage }): Promise<{ items?: { key: string; ok: boolean; detail: Record<string, unknown> }[]; error?: string }> => {
    if (!OWNERSHIP_STAGES.includes(input.toStage)) return { error: 'Etapa no válida' }
    const { data, error } = await ctx.supabase.rpc('ownership_checklist', { p_system_id: input.systemId, p_to_stage: input.toStage })
    if (error) return { error: error.message }
    return { items: (data ?? []) as never }
  },
)
