'use server'

import { revalidatePath } from 'next/cache'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'
import { logActivity } from '@/lib/log-activity'
import { COSIGN_CAPACITIES, isEvidencePathFor, parseConditions } from '@/lib/readiness/gates'

// Motor de gates (fase 1 plan readiness). Toda escritura pasa por RPCs SECURITY DEFINER
// (approve/revoke/attest) que validan rol, org y criterios en la BD; aquí solo se verifica
// que el sistema pertenezca al proyecto del caller y se traducen errores.

const systemGuards = [
  { resource: 'project' as const, field: 'projectId' },
  { resource: 'system' as const, field: 'systemId', scopeField: 'projectId' },
]

function revalidate(projectId: string, systemId: string) {
  revalidatePath('/control-tower')
  revalidatePath(`/control-tower/${systemId}`)
  revalidatePath(`/projects/${projectId}`)
}

export const approveSystemGate = withAuth(
  { guards: systemGuards },
  async (
    ctx,
    input: { projectId: string; systemId: string; gateId: string; conditions?: string; notes?: string },
  ): Promise<{ approvalId?: string; error?: string }> => {
    const { data, error } = await ctx.supabase.rpc('approve_system_gate', {
      p_system_id: input.systemId,
      p_gate_id: input.gateId,
      p_conditions: parseConditions(input.conditions ?? ''),
      p_notes: input.notes?.trim() ? input.notes.trim() : undefined,
    })
    if (error) return { error: error.message }

    await logActivity(ctx.supabase, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: 'gate.approved',
      entityType: 'system',
      entityId: input.systemId,
      payload: { project_id: input.projectId, gate_id: input.gateId, approval_id: data },
    })
    revalidate(input.projectId, input.systemId)
    return { approvalId: data as string }
  },
)

/** Co-firma (Operaciones / HSE) de una aprobación pendiente; la RPC exige persona distinta y rol habilitado. */
export const signSystemGate = withAuth(
  { guards: systemGuards },
  async (
    ctx,
    input: { projectId: string; systemId: string; approvalId: string; capacity: string; comments?: string },
  ): Promise<{ status?: string; error?: string }> => {
    if (!(COSIGN_CAPACITIES as string[]).includes(input.capacity)) return { error: 'Firma no válida' }
    const { data, error } = await ctx.supabase.rpc('sign_system_gate', {
      p_approval_id: input.approvalId,
      p_capacity: input.capacity,
      p_comments: input.comments?.trim() ? input.comments.trim() : undefined,
    })
    if (error) return { error: error.message }

    await logActivity(ctx.supabase, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: 'gate.signed',
      entityType: 'system',
      entityId: input.systemId,
      payload: { project_id: input.projectId, approval_id: input.approvalId, capacity: input.capacity, status: data },
    })
    revalidate(input.projectId, input.systemId)
    return { status: data as string }
  },
)

export const revokeSystemGateApproval = withAuth(
  { guards: systemGuards },
  async (
    ctx,
    input: { projectId: string; systemId: string; approvalId: string; reason: string },
  ): Promise<{ error?: string }> => {
    if (!input.reason.trim()) return { error: 'Indica el motivo de la revocación' }
    const { error } = await ctx.supabase.rpc('revoke_system_gate_approval', {
      p_approval_id: input.approvalId,
      p_reason: input.reason,
    })
    if (error) return { error: error.message }

    await logActivity(ctx.supabase, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: 'gate.revoked',
      entityType: 'system',
      entityId: input.systemId,
      payload: { project_id: input.projectId, approval_id: input.approvalId, reason: input.reason.trim() },
    })
    revalidate(input.projectId, input.systemId)
    return {}
  },
)

export const attestGateCriterion = withAuth(
  { role: EDITOR_ROLES, guards: systemGuards },
  async (
    ctx,
    input: { projectId: string; systemId: string; criterionId: string; comment: string; filePath: string },
  ): Promise<{ error?: string }> => {
    if (!isEvidencePathFor(input.filePath, ctx.orgId, input.systemId)) {
      return { error: 'Adjunto de evidencia no válido' }
    }
    const { error } = await ctx.supabase.rpc('attest_gate_criterion', {
      p_system_id: input.systemId,
      p_criterion_id: input.criterionId,
      p_comment: input.comment,
      p_file_path: input.filePath,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.systemId)
    return {}
  },
)

export const revokeGateAttestation = withAuth(
  { role: EDITOR_ROLES, guards: systemGuards },
  async (
    ctx,
    input: { projectId: string; systemId: string; attestationId: string; reason: string },
  ): Promise<{ error?: string }> => {
    // S11 (D-21): con motivo (≥ 10), auditado en la BD y no con el gate aprobado.
    const { error } = await ctx.supabase.rpc('revoke_gate_attestation', {
      p_attestation_id: input.attestationId,
      p_reason: (input.reason ?? '').trim().slice(0, 2000),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.systemId)
    return {}
  },
)

/** URL firmada (5 min) para ver un adjunto de evidencia del sistema. */
export const getGateEvidenceUrl = withAuth(
  { guards: systemGuards },
  async (
    ctx,
    input: { projectId: string; systemId: string; path: string },
  ): Promise<{ url?: string; error?: string }> => {
    if (!isEvidencePathFor(input.path, ctx.orgId, input.systemId)) return { error: 'Ruta no válida' }
    const { data, error } = await ctx.supabase.storage.from('gate-evidence').createSignedUrl(input.path, 300)
    if (error || !data) return { error: error?.message ?? 'No se pudo abrir el adjunto' }
    return { url: data.signedUrl }
  },
)
