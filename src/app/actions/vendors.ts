'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { withAuth } from '@/lib/auth/withAuth'
import type { Database } from '@/types/supabase.generated'
import {
  ACTIVITY_KINDS, ACTIVITY_RESULTS, CHECKLIST_PHASES, INTERFACE_STATUSES, PUNCH_CATEGORIES, REPORT_KINDS, VENDOR_CHECKLIST,
  type ActivityKind, type ActivityResult, type ChecklistPhase, type InterfaceStatus, type PunchCategory, type ReportKind,
} from '@/lib/vendors/catalog'

// Paquetes de vendor (fase 8 plan readiness, sesión 2; migración 20261022120000). Toda escritura pasa por RPC
// SECURITY DEFINER (roles, estados del paquete, gate de movilización, checklists, Cat A, MOC). Aquí: guards del
// wrapper, verificación de que el registro es del proyecto, limpieza de entradas y revalidación.

const projectGuard = [{ resource: 'project' as const, field: 'projectId' }]
const txt = (v: string | null | undefined, max: number) => (v ?? '').trim().slice(0, max)
const opt = (v: string | null | undefined) => ((v ?? '') === '' ? null : v) as unknown as string
const DATE = /^\d{4}-\d{2}-\d{2}$/
const date = (v: string | null | undefined) => (v && DATE.test(v) ? v : (null as unknown as string))

function revalidate(projectId: string, packageId?: string) {
  revalidatePath(`/projects/${projectId}/vendors`)
  if (packageId) revalidatePath(`/projects/${projectId}/vendors/${packageId}`)
  revalidatePath('/control-tower', 'layout')
}

type Db = SupabaseClient<Database>
async function owned(db: Db, table: 'vendor_packages' | 'vendor_activities' | 'vendor_recommendations', id: string, projectId: string) {
  const { data } = await db.from(table).select('id').eq('id', id).eq('project_id', projectId).maybeSingle()
  return !!data
}

// ── Paquete ─────────────────────────────────────────────────────────────
export const saveVendorPackage = withAuth(
  { guards: projectGuard },
  async (ctx, input: {
    projectId: string; id?: string; companyId: string; title: string; scope?: string; boundaries?: string
    systemIds: string[]; tagIds: string[]; mobSystemId?: string | null; mobGateId?: string | null; plannedMobilization?: string | null
  }): Promise<{ id?: string; error?: string }> => {
    if (!txt(input.title, 200)) return { error: 'El título es obligatorio' }
    if (!input.companyId) return { error: 'Elige la empresa del vendor' }
    if (!!input.mobSystemId !== !!input.mobGateId) return { error: 'Indica sistema y gate de movilización juntos' }
    const { data, error } = await ctx.supabase.rpc('save_vendor_package', {
      p_project_id: input.projectId, p_id: opt(input.id), p_company_id: input.companyId, p_title: txt(input.title, 200),
      p_scope: opt(txt(input.scope, 8000)), p_boundaries: opt(txt(input.boundaries, 8000)),
      p_systems: (input.systemIds ?? []).slice(0, 200), p_tags: (input.tagIds ?? []).slice(0, 500),
      p_mob_system_id: opt(input.mobSystemId), p_mob_gate_id: opt(input.mobGateId), p_planned_mobilization: date(input.plannedMobilization),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, data as string)
    return { id: data as string }
  },
)

export const saveVendorInterface = withAuth(
  { guards: projectGuard },
  async (ctx, input: {
    projectId: string; packageId: string; id?: string; counterpartCompanyId?: string | null; counterpart?: string
    description: string; responsible?: string; status: InterfaceStatus
  }): Promise<{ error?: string }> => {
    if (!INTERFACE_STATUSES.includes(input.status)) return { error: 'Estado no válido' }
    if (!(await owned(ctx.supabase, 'vendor_packages', input.packageId, input.projectId))) return { error: 'Paquete no encontrado' }
    const { error } = await ctx.supabase.rpc('save_vendor_interface', {
      p_package_id: input.packageId, p_id: opt(input.id), p_counterpart_company_id: opt(input.counterpartCompanyId),
      p_counterpart: opt(txt(input.counterpart, 160)), p_description: txt(input.description, 2000),
      p_responsible: opt(txt(input.responsible, 160)), p_status: input.status,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.packageId)
    return {}
  },
)

export const setVendorChecklistItem = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; packageId: string; phase: ChecklistPhase; key: string; done: boolean; note?: string }): Promise<{ error?: string }> => {
    if (!CHECKLIST_PHASES.includes(input.phase) || !VENDOR_CHECKLIST[input.phase].includes(input.key)) return { error: 'Ítem no válido' }
    if (!(await owned(ctx.supabase, 'vendor_packages', input.packageId, input.projectId))) return { error: 'Paquete no encontrado' }
    const { error } = await ctx.supabase.rpc('set_vendor_checklist_item', {
      p_package_id: input.packageId, p_phase: input.phase, p_key: input.key, p_done: input.done, p_note: opt(txt(input.note, 1000)),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.packageId)
    return {}
  },
)

/** mobilize | demobilize | cancel (líder+; la RPC valida gate, checklist, interfaces, reporte final y Cat A). */
export const transitionVendorPackage = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; packageId: string; to: 'mobilize' | 'demobilize' | 'cancel'; note?: string }): Promise<{ error?: string }> => {
    if (!(await owned(ctx.supabase, 'vendor_packages', input.packageId, input.projectId))) return { error: 'Paquete no encontrado' }
    const note = txt(input.note, 2000)
    const { error } = input.to === 'mobilize'
      ? await ctx.supabase.rpc('mobilize_vendor_package', { p_package_id: input.packageId, p_note: opt(note) })
      : input.to === 'demobilize'
        ? await ctx.supabase.rpc('demobilize_vendor_package', { p_package_id: input.packageId, p_note: opt(note) })
        : await ctx.supabase.rpc('cancel_vendor_package', { p_package_id: input.packageId, p_reason: note })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.packageId)
    return {}
  },
)

// ── FAT / SAT ───────────────────────────────────────────────────────────
export const saveVendorActivity = withAuth(
  { guards: projectGuard },
  async (ctx, input: {
    projectId: string; packageId: string; id?: string; kind: ActivityKind; title: string; plannedDate?: string | null; location?: string; notes?: string
  }): Promise<{ id?: string; error?: string }> => {
    if (!ACTIVITY_KINDS.includes(input.kind)) return { error: 'Tipo no válido' }
    if (!(await owned(ctx.supabase, 'vendor_packages', input.packageId, input.projectId))) return { error: 'Paquete no encontrado' }
    const { data, error } = await ctx.supabase.rpc('save_vendor_activity', {
      p_package_id: input.packageId, p_id: opt(input.id), p_kind: input.kind, p_title: txt(input.title, 200),
      p_planned_date: date(input.plannedDate), p_location: opt(txt(input.location, 200)), p_notes: opt(txt(input.notes, 4000)),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.packageId)
    return { id: data as string }
  },
)

export const recordVendorActivityResult = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; packageId: string; activityId: string; result: ActivityResult; performedOn: string; notes?: string }): Promise<{ error?: string }> => {
    if (!ACTIVITY_RESULTS.includes(input.result) || input.result === 'pending') return { error: 'Resultado no válido' }
    if (!DATE.test(input.performedOn)) return { error: 'Fecha de ejecución no válida' }
    if (!(await owned(ctx.supabase, 'vendor_activities', input.activityId, input.projectId))) return { error: 'Actividad no encontrada' }
    const { error } = await ctx.supabase.rpc('record_vendor_activity_result', {
      p_activity_id: input.activityId, p_result: input.result, p_performed_on: input.performedOn, p_notes: opt(txt(input.notes, 4000)),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.packageId)
    return {}
  },
)

/** Con tag → punch (categoría obligatoria); sin tag → acción ACC (responsable y fecha opcionales). */
export const addVendorFinding = withAuth(
  { guards: projectGuard },
  async (ctx, input: {
    projectId: string; packageId: string; activityId: string; description: string; tagId?: string | null
    category?: PunchCategory | null; ownerId?: string | null; dueDate?: string | null
  }): Promise<{ error?: string }> => {
    if (!txt(input.description, 2000)) return { error: 'Describe el hallazgo' }
    if (input.tagId && (!input.category || !PUNCH_CATEGORIES.includes(input.category))) return { error: 'Indica la categoría del punch' }
    if (!(await owned(ctx.supabase, 'vendor_activities', input.activityId, input.projectId))) return { error: 'Actividad no encontrada' }
    const { error } = await ctx.supabase.rpc('add_vendor_finding', {
      p_activity_id: input.activityId, p_description: txt(input.description, 2000), p_tag_id: opt(input.tagId),
      p_category: opt(input.tagId ? input.category : null), p_owner_id: opt(input.ownerId), p_due_date: date(input.dueDate),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.packageId)
    revalidatePath(`/projects/${input.projectId}/punches`)
    revalidatePath(`/projects/${input.projectId}/daily`)
    return {}
  },
)

// ── Reportes y recomendaciones ──────────────────────────────────────────
export const addVendorReport = withAuth(
  { guards: projectGuard },
  async (ctx, input: {
    projectId: string; packageId: string; kind: ReportKind; reportDate: string; headcount?: number | null; hours?: number | null; activities: string; issues?: string
  }): Promise<{ id?: string; error?: string }> => {
    if (!REPORT_KINDS.includes(input.kind)) return { error: 'Tipo no válido' }
    if (!DATE.test(input.reportDate)) return { error: 'Fecha no válida' }
    if (!txt(input.activities, 8000)) return { error: 'Describe las actividades' }
    if (!(await owned(ctx.supabase, 'vendor_packages', input.packageId, input.projectId))) return { error: 'Paquete no encontrado' }
    const num = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? (null as unknown as number) : v)
    const { data, error } = await ctx.supabase.rpc('add_vendor_report', {
      p_package_id: input.packageId, p_kind: input.kind, p_report_date: input.reportDate,
      p_headcount: num(input.headcount), p_hours: num(input.hours), p_activities: txt(input.activities, 8000), p_issues: opt(txt(input.issues, 8000)),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.packageId)
    return { id: data as string }
  },
)

export const proposeVendorRecommendation = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; packageId: string; description: string; rationale?: string; requiresMoc: boolean }): Promise<{ error?: string }> => {
    if (!txt(input.description, 4000)) return { error: 'Describe la recomendación' }
    if (!(await owned(ctx.supabase, 'vendor_packages', input.packageId, input.projectId))) return { error: 'Paquete no encontrado' }
    const { error } = await ctx.supabase.rpc('propose_vendor_recommendation', {
      p_package_id: input.packageId, p_description: txt(input.description, 4000), p_rationale: opt(txt(input.rationale, 4000)), p_requires_moc: input.requiresMoc,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.packageId)
    return {}
  },
)

export const decideVendorRecommendation = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; packageId: string; id: string; decision: 'approved' | 'rejected'; reason?: string; requiresMoc?: boolean }): Promise<{ error?: string }> => {
    if (input.decision !== 'approved' && input.decision !== 'rejected') return { error: 'Decisión no válida' }
    if (!(await owned(ctx.supabase, 'vendor_recommendations', input.id, input.projectId))) return { error: 'Recomendación no encontrada' }
    const { error } = await ctx.supabase.rpc('decide_vendor_recommendation', {
      p_id: input.id, p_decision: input.decision, p_reason: opt(txt(input.reason, 2000)),
      p_requires_moc: (input.requiresMoc ?? null) as unknown as boolean,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.packageId)
    return {}
  },
)

export const implementVendorRecommendation = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; packageId: string; id: string; mocReference?: string; note?: string }): Promise<{ error?: string }> => {
    if (!(await owned(ctx.supabase, 'vendor_recommendations', input.id, input.projectId))) return { error: 'Recomendación no encontrada' }
    const { error } = await ctx.supabase.rpc('implement_vendor_recommendation', {
      p_id: input.id, p_moc_reference: opt(txt(input.mocReference, 80)), p_note: opt(txt(input.note, 2000)),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.packageId)
    return {}
  },
)
