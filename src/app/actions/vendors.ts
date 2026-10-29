'use server'

import { getTranslations } from 'next-intl/server'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { withAuth } from '@/lib/auth/withAuth'
import type { Database } from '@/types/supabase.generated'
import { ADMIN_ROLES } from '@/lib/constants/roles'
import {
  ACTIVITY_KINDS, ACTIVITY_RESULTS, CHECKLIST_PHASES, INTERFACE_STATUSES, PUNCH_CATEGORIES, REPORT_KINDS, VENDOR_CHECKLIST,
  isVendorLead, type ActivityKind, type ActivityResult, type ChecklistPhase, type InterfaceStatus, type PunchCategory, type ReportKind,
} from '@/lib/vendors/catalog'
import { sqlArg } from '@/lib/supabase/casts'

// Paquetes de vendor (fase 8 plan readiness, sesión 2; migración 20261022120000). Toda escritura pasa por RPC
// SECURITY DEFINER (roles, estados del paquete, gate de movilización, checklists, Cat A, MOC). Aquí: guards del
// wrapper, verificación de que el registro es del proyecto, limpieza de entradas y revalidación.

const projectGuard = [{ resource: 'project' as const, field: 'projectId' }]
const txt = (v: string | null | undefined, max: number) => (v ?? '').trim().slice(0, max)
const opt = (v: string | null | undefined) => sqlArg<string>(((v ?? '') === '' ? null : v))
const DATE = /^\d{4}-\d{2}-\d{2}$/
const date = (v: string | null | undefined) => (v && DATE.test(v) ? v : (sqlArg<string>(null)))

function revalidate(projectId: string, packageId?: string) {
  revalidatePath(`/projects/${projectId}/vendors`)
  if (packageId) revalidatePath(`/projects/${projectId}/vendors/${packageId}`)
  revalidatePath('/projects/[id]', 'layout')
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
    const t = await getTranslations('ActionErrors')
    if (!txt(input.title, 200)) return { error: t('vendors.titleRequired') }
    if (!input.companyId) return { error: t('vendors.companyRequired') }
    if (!!input.mobSystemId !== !!input.mobGateId) return { error: t('vendors.mobilizationPair') }
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
    const t = await getTranslations('ActionErrors')
    if (!INTERFACE_STATUSES.includes(input.status)) return { error: t('vendors.invalidStatus') }
    if (!(await owned(ctx.supabase, 'vendor_packages', input.packageId, input.projectId))) return { error: t('vendors.packageNotFound') }
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
    const t = await getTranslations('ActionErrors')
    if (!CHECKLIST_PHASES.includes(input.phase) || !VENDOR_CHECKLIST[input.phase].includes(input.key)) return { error: t('vendors.invalidItem') }
    if (!(await owned(ctx.supabase, 'vendor_packages', input.packageId, input.projectId))) return { error: t('vendors.packageNotFound') }
    const { error } = await ctx.supabase.rpc('set_vendor_checklist_item', {
      p_package_id: input.packageId, p_phase: input.phase, p_key: input.key, p_done: input.done, p_note: opt(txt(input.note, 1000)),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.packageId)
    return {}
  },
)

/**
 * mobilize | demobilize | cancel (líder+; la RPC valida gate, checklist, interfaces, reporte final y Cat A).
 * S13 (F-34): `cancel` sobre un paquete movilizado = terminación anticipada (motivo ≥ 10).
 */
export const transitionVendorPackage = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; packageId: string; to: 'mobilize' | 'demobilize' | 'cancel'; note?: string }): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!(await owned(ctx.supabase, 'vendor_packages', input.packageId, input.projectId))) return { error: t('vendors.packageNotFound') }
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
    const t = await getTranslations('ActionErrors')
    if (!ACTIVITY_KINDS.includes(input.kind)) return { error: t('vendors.invalidKind') }
    if (!(await owned(ctx.supabase, 'vendor_packages', input.packageId, input.projectId))) return { error: t('vendors.packageNotFound') }
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
    const t = await getTranslations('ActionErrors')
    if (!ACTIVITY_RESULTS.includes(input.result) || input.result === 'pending') return { error: t('vendors.invalidResult') }
    if (!DATE.test(input.performedOn)) return { error: t('vendors.invalidPerformedOn') }
    if (!(await owned(ctx.supabase, 'vendor_activities', input.activityId, input.projectId))) return { error: t('vendors.activityNotFound') }
    const { error } = await ctx.supabase.rpc('record_vendor_activity_result', {
      p_activity_id: input.activityId, p_result: input.result, p_performed_on: input.performedOn, p_notes: opt(txt(input.notes, 4000)),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.packageId)
    return {}
  },
)

/** S13 (F-05): re-prueba de una FAT/SAT fallida o con hallazgos; el KPI cuenta la última de la cadena. */
export const createVendorRetest = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; packageId: string; activityId: string; plannedDate?: string | null }): Promise<{ id?: string; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!(await owned(ctx.supabase, 'vendor_activities', input.activityId, input.projectId))) return { error: t('vendors.activityNotFound') }
    const { data, error } = await ctx.supabase.rpc('create_vendor_retest', { p_activity_id: input.activityId, p_planned_date: date(input.plannedDate) })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.packageId)
    return { id: data as string }
  },
)

/** Con tag → punch (categoría obligatoria); sin tag → acción ACC (responsable y fecha opcionales). */
export const addVendorFinding = withAuth(
  { guards: projectGuard },
  async (ctx, input: {
    projectId: string; packageId: string; activityId: string; description: string; tagId?: string | null
    category?: PunchCategory | null; ownerId?: string | null; dueDate?: string | null
  }): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!txt(input.description, 2000)) return { error: t('vendors.findingRequired') }
    if (input.tagId && (!input.category || !PUNCH_CATEGORIES.includes(input.category))) return { error: t('vendors.punchCategoryRequired') }
    if (!(await owned(ctx.supabase, 'vendor_activities', input.activityId, input.projectId))) return { error: t('vendors.activityNotFound') }
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
    const t = await getTranslations('ActionErrors')
    if (!REPORT_KINDS.includes(input.kind)) return { error: t('vendors.invalidKind') }
    if (!DATE.test(input.reportDate)) return { error: t('vendors.invalidDate') }
    if (!txt(input.activities, 8000)) return { error: t('vendors.activitiesRequired') }
    if (!(await owned(ctx.supabase, 'vendor_packages', input.packageId, input.projectId))) return { error: t('vendors.packageNotFound') }
    const num = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? (sqlArg<number>(null)) : v)
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
    const t = await getTranslations('ActionErrors')
    if (!txt(input.description, 4000)) return { error: t('vendors.recommendationRequired') }
    if (!(await owned(ctx.supabase, 'vendor_packages', input.packageId, input.projectId))) return { error: t('vendors.packageNotFound') }
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
    const t = await getTranslations('ActionErrors')
    if (input.decision !== 'approved' && input.decision !== 'rejected') return { error: t('vendors.invalidDecision') }
    if (!(await owned(ctx.supabase, 'vendor_recommendations', input.id, input.projectId))) return { error: t('vendors.recommendationNotFound') }
    const { error } = await ctx.supabase.rpc('decide_vendor_recommendation', {
      p_id: input.id, p_decision: input.decision, p_reason: opt(txt(input.reason, 2000)),
      p_requires_moc: sqlArg<boolean>((input.requiresMoc ?? null)),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.packageId)
    return {}
  },
)

export const implementVendorRecommendation = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; packageId: string; id: string; mocReference?: string; note?: string }): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!(await owned(ctx.supabase, 'vendor_recommendations', input.id, input.projectId))) return { error: t('vendors.recommendationNotFound') }
    const { error } = await ctx.supabase.rpc('implement_vendor_recommendation', {
      p_id: input.id, p_moc_reference: opt(txt(input.mocReference, 80)), p_note: opt(txt(input.note, 2000)),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.packageId)
    return {}
  },
)

// ── Importar paquetes desde la lista de equipos tipo paquete (decisión de Luis, 2026-10-29) ──
// La lectura del Excel es del cliente (src/lib/vendors/package-list.ts); aquí cada paquete se crea o, si ya hay uno
// abierto con el mismo título, se actualiza (alcance y tags del archivo; empresa, límites y movilización se conservan).
// Los sistemas salen de los tags (sin el general) y se suman a los que el paquete ya tenía.

export type PackageImportItem = { title: string; scope: string; tagNumbers: string[] }
export type PackageImportResult = { created: number; updated: number; missingTags: string[]; errors: { title: string; reason: string }[] }

/** Empresa provisional para paquetes sin proveedor adjudicado (FEED). */
const TBD_COMPANY = 'Proveedor por definir'
const titleKey = (v: string) => v.replace(/\s+/g, ' ').trim().toUpperCase()

export const importVendorPackages = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; companyId: string; packages: PackageImportItem[] }): Promise<{ error?: string; result?: PackageImportResult }> => {
    const t = await getTranslations('ActionErrors')
    if (!isVendorLead(ctx.role)) return { error: t('vendors.leadOnly') }
    const packages = (input.packages ?? []).slice(0, 200).filter(p => txt(p.title, 200))
    if (!packages.length) return { error: t('vendors.nothingToImport') }

    // Empresa: una de la org o la provisional (se crea una vez; crear empresas es de Propietario/Administrador).
    let companyId = input.companyId
    if (companyId === 'tbd') {
      const { data: found } = await ctx.supabase.from('companies').select('id').eq('org_id', ctx.orgId).eq('name', TBD_COMPANY).maybeSingle()
      if (found) companyId = found.id
      else {
        if (!ADMIN_ROLES.includes(ctx.role)) return { error: t('vendors.tbdCompanyAdmin') }
        const { data, error } = await ctx.supabase.rpc('save_company', {
          p_org_id: ctx.orgId, p_id: sqlArg<string>(null), p_name: TBD_COMPANY, p_short_name: sqlArg<string>(null), p_kind: 'vendor',
          p_tax_id: sqlArg<string>(null), p_notes: 'Creada al importar paquetes de vendor: cámbiala en cada paquete al adjudicar.', p_is_active: true,
        })
        if (error || !data) return { error: error?.message ?? t('vendors.companyRequired') }
        companyId = data as string
      }
    }
    if (!companyId) return { error: t('vendors.companyRequired') }

    // Tags del archivo → id y sistema (el general no cuenta como sistema del paquete).
    const numbers = [...new Set(packages.flatMap(p => p.tagNumbers.map(n => n.trim()).filter(Boolean)))]
    const tagInfo = new Map<string, { id: string; systemId: string | null }>()
    for (let i = 0; i < numbers.length; i += 200) {
      const { data, error } = await ctx.supabase.from('tags').select('id, tag_number, subsystems(systems(id, code))') // bounded: lote de 200 números
        .eq('project_id', input.projectId).in('tag_number', numbers.slice(i, i + 200))
      if (error) return { error: error.message }
      for (const tg of data ?? []) {
        const sys = tg.subsystems?.systems
        tagInfo.set(tg.tag_number, { id: tg.id, systemId: sys && sys.code !== 'GEN-SYS' ? sys.id : null })
      }
    }

    const { data: existing, error: exErr } = await ctx.supabase.from('vendor_packages') // bounded: paquetes del proyecto (decenas)
      .select('id, title, status, company_id, boundaries, mob_system_id, mob_gate_id, planned_mobilization, vendor_package_systems(system_id)')
      .eq('project_id', input.projectId)
    if (exErr) return { error: exErr.message }
    const open = new Map((existing ?? []).filter(p => !['demobilized', 'cancelled'].includes(p.status)).map(p => [titleKey(p.title), p]))

    const result: PackageImportResult = { created: 0, updated: 0, missingTags: numbers.filter(n => !tagInfo.has(n)), errors: [] }
    for (const p of packages) {
      const title = txt(p.title, 200)
      const tags = p.tagNumbers.map(n => tagInfo.get(n.trim())).filter((x): x is { id: string; systemId: string | null } => !!x)
      const prev = open.get(titleKey(title))
      const systems = [...new Set([...tags.map(x => x.systemId).filter((s): s is string => !!s), ...(prev?.vendor_package_systems ?? []).map(s => s.system_id)])]
      const { error } = await ctx.supabase.rpc('save_vendor_package', {
        p_project_id: input.projectId, p_id: opt(prev?.id), p_company_id: prev?.company_id ?? companyId, p_title: title,
        p_scope: opt(txt(p.scope, 8000)), p_boundaries: opt(prev?.boundaries), p_systems: systems.slice(0, 200), p_tags: [...new Set(tags.map(x => x.id))].slice(0, 500),
        p_mob_system_id: opt(prev?.mob_system_id), p_mob_gate_id: opt(prev?.mob_gate_id), p_planned_mobilization: date(prev?.planned_mobilization),
      })
      if (error) { result.errors.push({ title, reason: error.message }); continue }
      if (prev) result.updated++
      else result.created++
    }
    revalidate(input.projectId)
    return { result }
  },
)
