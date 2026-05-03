'use server'

import { getActiveMembership as getCtx } from '@/lib/supabase/membership'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/log-activity'

const EDITOR_ROLES = ['owner', 'admin', 'architect', 'leader']

// ── checkSubsystemEligibility ──────────────────────────────────────────────
// Returns eligibility for a subsystem+phase pair. Used server-side and in actions.

export async function checkSubsystemEligibility(input: {
  projectId: string
  subsystemId: string
  phaseId: string
}): Promise<{
  eligible: 'green' | 'yellow' | 'red'
  totalItrs: number
  approvedItrs: number
  openCatA: number
  openCatBPunches: { id: string; punch_number: string; description: string }[]
  error?: string
}> {
  const ctx = await getCtx()
  if (!ctx) return { eligible: 'red', totalItrs: 0, approvedItrs: 0, openCatA: 0, openCatBPunches: [], error: 'No autenticado' }

  const { supabase } = ctx

  const [{ data: itrs }, { data: punches }] = await Promise.all([
    supabase
      .from('itrs')
      .select('id, status')
      .eq('project_id', input.projectId)
      .eq('subsystem_id', input.subsystemId)
      .eq('phase_id', input.phaseId),
    supabase
      .from('punches')
      .select('id, punch_number, description, category, status')
      .eq('project_id', input.projectId)
      .eq('subsystem_id', input.subsystemId)
      .not('status', 'in', '(closed,cancelled)'),
  ])

  const totalItrs = itrs?.length ?? 0
  const approvedItrs = itrs?.filter(i => i.status === 'approved').length ?? 0
  const openCatA = punches?.filter(p => p.category === 'A').length ?? 0
  const openCatBPunches = (punches ?? [])
    .filter(p => p.category === 'B')
    .map(p => ({ id: p.id, punch_number: p.punch_number, description: p.description }))

  let eligible: 'green' | 'yellow' | 'red'
  if (openCatA > 0 || totalItrs === 0 || approvedItrs < totalItrs) {
    eligible = 'red'
  } else if (openCatBPunches.length > 0) {
    eligible = 'yellow'
  } else {
    eligible = 'green'
  }

  return { eligible, totalItrs, approvedItrs, openCatA, openCatBPunches }
}

// ── issueCertificate ───────────────────────────────────────────────────────

export async function issueCertificate(input: {
  projectId: string
  subsystemId: string
  phaseId: string
  notes?: string
  catBExceptions?: { punchId: string; justification: string }[]
}): Promise<{ certId?: string; certNumber?: string; error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos para emitir certificados' }

  const { supabase, userId } = ctx
  const { projectId, subsystemId, phaseId } = input

  // Verify eligibility
  const el = await checkSubsystemEligibility({ projectId, subsystemId, phaseId })
  if (el.openCatA > 0) return { error: `Hay ${el.openCatA} punch(es) Cat A abiertos — deben cerrarse antes de emitir` }
  if (el.totalItrs === 0) return { error: 'No hay ITRs asignados en esta fase para el subsistema' }
  if (el.approvedItrs < el.totalItrs) {
    return { error: `Faltan ${el.totalItrs - el.approvedItrs} ITR(s) por aprobar` }
  }

  // Check that every open Cat B has a justification
  const exceptions = input.catBExceptions ?? []
  const catBIds = el.openCatBPunches.map(p => p.id)
  const missingJustification = catBIds.filter(id => {
    const exc = exceptions.find(e => e.punchId === id)
    return !exc || !exc.justification.trim()
  })
  if (missingJustification.length > 0) {
    return { error: `Deben justificarse todos los punches Cat B abiertos (${missingJustification.length} sin justificación)` }
  }

  // Fetch subsystem + phase info
  const [{ data: subsystem }, { data: phase }] = await Promise.all([
    supabase.from('subsystems').select('id, code, name').eq('id', subsystemId).single(),
    supabase.from('project_phases').select('id, code, name, certificate_name').eq('id', phaseId).single(),
  ])
  if (!subsystem || !phase) return { error: 'Subsistema o fase no encontrados' }

  const certType = phase.certificate_name ?? phase.code
  const baseNumber = `${certType}/${subsystem.code}`

  const { count } = await supabase
    .from('certificates')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .like('certificate_number', `${baseNumber}%`)

  const certNumber = (count ?? 0) === 0 ? baseNumber : `${baseNumber}-R${(count ?? 0) + 1}`
  const title = `${certType} — ${subsystem.code}: ${subsystem.name}`

  const { data: cert, error: certErr } = await supabase
    .from('certificates')
    .insert({
      project_id: projectId,
      subsystem_id: subsystemId,
      phase_id: phaseId,
      certificate_number: certNumber,
      title,
      status: 'issued',
      issued_date: new Date().toISOString().split('T')[0],
      issued_by: userId,
      notes: input.notes ?? null,
    } as never)
    .select('id, certificate_number')
    .single()

  if (certErr) return { error: certErr.message }

  // Insert Cat B exceptions
  const validExceptions = exceptions.filter(e => catBIds.includes(e.punchId) && e.justification.trim())
  if (validExceptions.length > 0) {
    await supabase.from('certificate_punch_exceptions').insert(
      validExceptions.map(e => ({
        certificate_id: cert.id,
        punch_id: e.punchId,
        justification: e.justification.trim(),
        approved_by: userId,
      })) as never[]
    )
  }

  await logActivity(supabase, {
    orgId: ctx.orgId,
    userId,
    entityType: 'certificate',
    entityId: cert.id,
    action: 'issued',
    payload: {
      certNumber: cert.certificate_number,
      subsystemId,
      phaseId,
      catBExceptions: validExceptions.length,
    },
  })

  revalidatePath(`/projects/${projectId}/certificates`)
  return { certId: cert.id, certNumber: cert.certificate_number }
}

// ── addPunchException ──────────────────────────────────────────────────────

export async function addPunchException(input: {
  certificateId: string
  punchId: string
  justification: string
  projectId: string
}): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const { supabase, userId } = ctx

  const { error } = await supabase
    .from('certificate_punch_exceptions')
    .insert({
      certificate_id: input.certificateId,
      punch_id: input.punchId,
      justification: input.justification.trim(),
      approved_by: userId,
    } as never)

  if (error) return { error: error.message }
  revalidatePath(`/projects/${input.projectId}/certificates`)
  return {}
}

// ── removePunchException ───────────────────────────────────────────────────

export async function removePunchException(input: {
  exceptionId: string
  projectId: string
  certId: string
}): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const { supabase } = ctx

  const { error } = await supabase
    .from('certificate_punch_exceptions')
    .delete()
    .eq('id', input.exceptionId)

  if (error) return { error: error.message }
  revalidatePath(`/projects/${input.projectId}/certificates/${input.certId}`)
  return {}
}

// ── revokeCertificate ──────────────────────────────────────────────────────

export async function revokeCertificate(input: {
  certId: string
  projectId: string
}): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!['owner', 'admin'].includes(ctx.role)) return { error: 'Solo admin/owner puede revocar certificados' }

  const { supabase } = ctx

  const { error } = await supabase
    .from('certificates')
    .update({ status: 'rejected' })
    .eq('id', input.certId)

  if (error) return { error: error.message }

  await logActivity(supabase, {
    orgId: ctx.orgId,
    userId: ctx.userId,
    entityType: 'certificate',
    entityId: input.certId,
    action: 'revoked',
    payload: { projectId: input.projectId },
  })

  revalidatePath(`/projects/${input.projectId}/certificates`)
  revalidatePath(`/projects/${input.projectId}/certificates/${input.certId}`)
  return {}
}
