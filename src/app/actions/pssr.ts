'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  requireAuth,
  requireRole,
  isAuthError,
  EDITOR_ROLES,
  type ActiveContext,
} from '@/lib/auth/permissions'
import { withAuthOnly } from '@/lib/auth/withAuth'
import { logActivity } from '@/lib/log-activity'
import { DEFAULT_PSSR_ITEMS, PSSR_ALREADY_SIGNED } from '@/lib/constants/pssr'
import {
  notifyPssrSubmittedForApproval,
  notifyPssrApproved,
  notifyPssrRejected,
} from '@/lib/notifications/pssr'

// CONVENCIÓN DE ESTE ARCHIVO: las actions PSSR lanzan (throw) en vez de devolver
// { error } — los callers (PssrReviewForm, PssrListView, etc.) usan try/catch.
// El wrapper withAuth devuelve { error } en fallo de auth, lo que aquí pasaría
// silenciosamente como éxito. requireCtx centraliza auth+rol preservando throw.
// Pendiente: convertir archivo+callers al contrato { error } cuando se descomponga
// PssrReviewForm. Las 2 fns que ya usan { error } (list/clone) sí van con wrapper.
//
// Roles: la EJECUCIÓN del review (items, firmas, submit) es auth-only — los
// representantes de disciplina que firman pueden ser inspectores (no EDITOR).
// Template CRUD y aprobación/rechazo exigen EDITOR.

async function requireCtx(roles?: readonly string[]): Promise<ActiveContext> {
  const res = roles ? await requireRole(roles) : await requireAuth()
  if (isAuthError(res)) throw new Error(res.error)
  return res
}

// ── Template CRUD ─────────────────────────────────────────────

export async function createPssrTemplate(data: { name: string; description?: string }) {
  const ctx = await requireCtx(EDITOR_ROLES)

  const { data: template, error } = await ctx.supabase.from('pssr_templates').insert({
    org_id: ctx.orgId,
    name: data.name,
    description: data.description ?? null,
    created_by: ctx.userId,
  }).select().single()
  if (error) throw new Error(error.message)

  revalidatePath('/admin/templates/pssr')
  return template
}

export async function seedDefaultPssrTemplate(templateId: string) {
  const ctx = await requireCtx(EDITOR_ROLES)
  const items = DEFAULT_PSSR_ITEMS.map((item, i) => ({
    template_id: templateId,
    item_order: i + 1,
    ...item,
  }))
  const { error } = await ctx.supabase.from('pssr_template_items').insert(items)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/templates/pssr/${templateId}`)
}

export async function upsertPssrTemplateItem(data: {
  id?: string
  templateId: string
  itemOrder: number
  category: string
  element: string
  requirement: string
  notesHint?: string
  isRequired?: boolean
}) {
  const ctx = await requireCtx(EDITOR_ROLES)
  const payload = {
    template_id: data.templateId,
    item_order: data.itemOrder,
    category: data.category,
    element: data.element,
    requirement: data.requirement,
    notes_hint: data.notesHint ?? null,
    is_required: data.isRequired ?? true,
  }
  const { error } = data.id
    ? await ctx.supabase.from('pssr_template_items').update(payload).eq('id', data.id)
    : await ctx.supabase.from('pssr_template_items').insert(payload)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/templates/pssr/${data.templateId}`)
}

export async function deletePssrTemplateItem(itemId: string, templateId: string) {
  const ctx = await requireCtx(EDITOR_ROLES)
  const { error } = await ctx.supabase.from('pssr_template_items').delete().eq('id', itemId)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/templates/pssr/${templateId}`)
}

export async function deletePssrTemplate(templateId: string) {
  const ctx = await requireCtx(EDITOR_ROLES)
  const { error } = await ctx.supabase.from('pssr_templates').delete().eq('id', templateId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/templates/pssr')
}

// ── Review CRUD ───────────────────────────────────────────────

export async function createPssrReview(data: {
  projectId: string
  systemId: string
  templateId: string
  title?: string
  reviewDueDate?: string | null
}) {
  // Antes no exigía rol — política 2026-05-24: crear un review es planificación → EDITOR
  const ctx = await requireCtx(EDITOR_ROLES)
  const supabase = ctx.supabase

  // Verify project belongs to the active org
  const { data: project } = await supabase
    .from('projects').select('org_id').eq('id', data.projectId).eq('org_id', ctx.orgId).single()
  if (!project) throw new Error('Proyecto no encontrado')

  // Auto-number per system: PSSR-001, PSSR-002...
  const { count } = await supabase
    .from('pssr_reviews')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', data.projectId)
    .eq('system_id', data.systemId)
  const reviewNumber = `PSSR-${String((count ?? 0) + 1).padStart(3, '0')}`

  const insertRow: Record<string, unknown> = {
    org_id: ctx.orgId,
    project_id: data.projectId,
    system_id: data.systemId,
    template_id: data.templateId,
    review_number: reviewNumber,
    title: data.title ?? 'Pre-Startup Safety Review',
    created_by: ctx.userId,
  }
  if (data.reviewDueDate) insertRow.review_due_date = data.reviewDueDate

  const { data: review, error: reviewError } = await supabase.from('pssr_reviews').insert(insertRow).select().single()
  if (reviewError) throw new Error(reviewError.message)

  // Copy template items to review items
  const { data: templateItems } = await supabase
    .from('pssr_template_items')
    .select('*')
    .eq('template_id', data.templateId)
    .order('item_order')

  if (templateItems && templateItems.length > 0) {
    const reviewItems = templateItems.map(item => ({
      review_id: review.id,
      template_item_id: item.id,
      item_order: item.item_order,
      category: item.category,
      element: item.element,
      requirement: item.requirement,
      notes_hint: item.notes_hint,
    }))
    const { error: itemsError } = await supabase.from('pssr_review_items').insert(reviewItems)
    if (itemsError) throw new Error(itemsError.message)
  }

  revalidatePath(`/projects/${data.projectId}/pssr`)
  return review
}

export async function updatePssrReviewItem(data: {
  itemId: string
  reviewId: string
  projectId: string
  status?: 'pending' | 'si' | 'no' | 'na'
  responsible?: string
  actions?: string
  completionDate?: string | null
}) {
  const ctx = await requireCtx()
  const supabase = ctx.supabase

  const payload: Record<string, unknown> = { updated_by: ctx.userId, updated_at: new Date().toISOString() }
  if (data.status !== undefined)         payload.status = data.status
  if (data.responsible !== undefined)    payload.responsible = data.responsible
  if (data.actions !== undefined)        payload.actions = data.actions
  if (data.completionDate !== undefined) payload.completion_date = data.completionDate

  const { error } = await supabase.from('pssr_review_items').update(payload).eq('id', data.itemId)
  if (error) throw new Error(error.message)

  // Auto-advance review status to in_progress when first item is touched
  await supabase
    .from('pssr_reviews')
    .update({ status: 'in_progress', updated_at: new Date().toISOString() })
    .eq('id', data.reviewId)
    .eq('status', 'draft')

  revalidatePath(`/projects/${data.projectId}/pssr/${data.reviewId}`)
}

export async function updatePssrReviewNotes(reviewId: string, projectId: string, notes: string) {
  const ctx = await requireCtx()
  const { error } = await ctx.supabase
    .from('pssr_reviews')
    .update({ notes, updated_at: new Date().toISOString() })
    .eq('id', reviewId)
  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}/pssr/${reviewId}`)
}

export async function updatePssrReviewDueDate(reviewId: string, projectId: string, reviewDueDate: string | null) {
  // Antes no exigía rol — fecha límite es planificación → EDITOR
  const ctx = await requireCtx(EDITOR_ROLES)
  const { error } = await ctx.supabase
    .from('pssr_reviews')
    .update({ review_due_date: reviewDueDate, last_overdue_notif_at: null, updated_at: new Date().toISOString() })
    .eq('id', reviewId)
  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}/pssr/${reviewId}`)
  revalidatePath(`/projects/${projectId}/pssr`)
}

export async function submitPssrForApproval(reviewId: string, projectId: string) {
  const ctx = await requireCtx()
  const supabase = ctx.supabase

  // Verify all items are si or na
  const { data: pendingItems } = await supabase
    .from('pssr_review_items')
    .select('id')
    .eq('review_id', reviewId)
    .in('status', ['pending', 'no'])

  if (pendingItems && pendingItems.length > 0)
    throw new Error(`${pendingItems.length} ítem(s) sin completar o con estado NO`)

  const { data: review, error: fetchErr } = await supabase
    .from('pssr_reviews')
    .select('id, org_id, review_number, systems(code, name)')
    .eq('id', reviewId)
    .single()
  if (fetchErr || !review) throw new Error(fetchErr?.message ?? 'PSSR no encontrado')

  const { error } = await supabase
    .from('pssr_reviews')
    .update({ status: 'pending_approval', updated_at: new Date().toISOString() })
    .eq('id', reviewId)
  if (error) throw new Error(error.message)

  const sys = (review.systems as unknown) as { code: string | null; name: string | null } | null
  await notifyPssrSubmittedForApproval(createAdminClient(), {
    orgId: review.org_id as string,
    submitterUserId: ctx.userId,
    reviewId,
    reviewNumber: review.review_number as string,
    projectId,
    systemCode: sys?.code ?? null,
    systemName: sys?.name ?? null,
  })

  revalidatePath(`/projects/${projectId}/pssr/${reviewId}`)
}

export async function addPssrSignature(data: {
  reviewId: string
  projectId: string
  discipline: string
  signatureData: string
}) {
  const ctx = await requireCtx()
  const supabase = ctx.supabase

  const { error } = await supabase.from('pssr_signatures').insert({
    review_id: data.reviewId,
    user_id: ctx.userId,
    discipline: data.discipline,
    signature_data: data.signatureData,
    signed_at: new Date().toISOString(),
  })
  if (error) {
    // 23505 unique_violation on (review_id, user_id) → user already signed
    if (error.code === '23505') throw new Error(PSSR_ALREADY_SIGNED)
    throw new Error(error.message)
  }

  revalidatePath(`/projects/${data.projectId}/pssr/${data.reviewId}`)
}

export async function removePssrSignature(signatureId: string, reviewId: string, projectId: string) {
  // Identidad/admin la gobierna RLS sobre pssr_signatures; aquí solo auth
  const ctx = await requireCtx()
  const { error } = await ctx.supabase.from('pssr_signatures').delete().eq('id', signatureId)
  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}/pssr/${reviewId}`)
}

// ── Approve PSSR + Issue RFSU Certificate ────────────────────

export async function approvePssrAndIssueRfsu(reviewId: string, projectId: string) {
  const ctx = await requireCtx(EDITOR_ROLES)
  const supabase = ctx.supabase

  // Verify signatures exist
  const { count: sigCount } = await supabase
    .from('pssr_signatures')
    .select('*', { count: 'exact', head: true })
    .eq('review_id', reviewId)
  if (!sigCount || sigCount === 0)
    throw new Error('Se requiere al menos una firma antes de aprobar')

  // Get review + system info
  const { data: review } = await supabase
    .from('pssr_reviews')
    .select('*, systems(id, name, code), projects(id, org_id)')
    .eq('id', reviewId)
    .single()
  if (!review) throw new Error('PSSR no encontrado')

  // Find Phase D (Start-Up) for the RFSU certificate
  const { data: phaseD } = await supabase
    .from('project_phases')
    .select('id, certificate_name, code')
    .eq('org_id', (review.projects as { org_id: string }).org_id)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Auto-number RFSU certificate
  const { count: certCount } = await supabase
    .from('certificates')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)
  const certNumber = `RFSU-${String((certCount ?? 0) + 1).padStart(3, '0')}`

  const system = review.systems as { id: string; name: string; code: string }

  // Create RFSU certificate
  const { data: cert, error: certError } = await supabase.from('certificates').insert({
    project_id: projectId,
    system_id: review.system_id,
    phase_id: phaseD?.id ?? null,
    certificate_number: certNumber,
    title: `RFSU — ${system?.name ?? 'Sistema'} (${system?.code ?? ''})`,
    status: 'issued',
    issued_date: new Date().toISOString().split('T')[0],
    issued_by: ctx.userId,
    approved_by: ctx.userId,
  }).select().single()
  if (certError) throw new Error(certError.message)

  // Approve PSSR + link certificate
  const { error } = await supabase.from('pssr_reviews').update({
    status: 'approved',
    approved_by: ctx.userId,
    approved_at: new Date().toISOString(),
    rfsu_certificate_id: cert.id,
    updated_at: new Date().toISOString(),
  }).eq('id', reviewId)
  if (error) throw new Error(error.message)

  await logActivity(supabase, {
    orgId: ctx.orgId,
    userId: ctx.userId,
    entityType: 'pssr',
    entityId: reviewId,
    action: 'approved',
    payload: { projectId, certNumber: cert.certificate_number, certId: cert.id },
  })

  await notifyPssrApproved(createAdminClient(), {
    orgId: ctx.orgId,
    approverUserId: ctx.userId,
    createdBy: (review.created_by as string | null) ?? null,
    rfsuCertNumber: cert.certificate_number as string,
    rfsuCertId: cert.id as string,
    reviewId,
    reviewNumber: review.review_number as string,
    projectId,
    systemCode: system?.code ?? null,
    systemName: system?.name ?? null,
  })

  revalidatePath(`/projects/${projectId}/pssr/${reviewId}`)
  revalidatePath(`/projects/${projectId}/pssr`)
  revalidatePath(`/certificates`)
  return cert
}

export async function rejectPssrReview(reviewId: string, projectId: string, reason?: string) {
  const ctx = await requireCtx(EDITOR_ROLES)
  const supabase = ctx.supabase

  const { data: review, error: fetchErr } = await supabase
    .from('pssr_reviews')
    .select('id, org_id, review_number, created_by, systems(code, name)')
    .eq('id', reviewId)
    .single()
  if (fetchErr || !review) throw new Error(fetchErr?.message ?? 'PSSR no encontrado')

  const { error } = await supabase
    .from('pssr_reviews')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', reviewId)
  if (error) throw new Error(error.message)

  await logActivity(supabase, {
    orgId: ctx.orgId,
    userId: ctx.userId,
    entityType: 'pssr',
    entityId: reviewId,
    action: 'rejected',
    payload: { projectId, reason: reason ?? null },
  })

  const sys = (review.systems as unknown) as { code: string | null; name: string | null } | null
  await notifyPssrRejected(createAdminClient(), {
    orgId: review.org_id as string,
    rejecterUserId: ctx.userId,
    createdBy: (review.created_by as string | null) ?? null,
    reason: reason?.trim() ?? null,
    reviewId,
    reviewNumber: review.review_number as string,
    projectId,
    systemCode: sys?.code ?? null,
    systemName: sys?.name ?? null,
  })

  revalidatePath(`/projects/${projectId}/pssr/${reviewId}`)
}

// ═══════════════════════════════════════════════════════════
// CROSS-ORG SHARING (templates only — reviews live per project)
// ═══════════════════════════════════════════════════════════

export type ImportablePssrTemplate = {
  id: string
  name: string
  description: string | null
  isActive: boolean
  sourceOrgId: string
  sourceOrgName: string
  sourceOrgIsCatalog: boolean
  itemCount: number
}

export const listImportablePssrTemplates = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx): Promise<{ templates?: ImportablePssrTemplate[]; error?: string }> => {
    const { data: orgs } = await ctx.supabase
      .from('organizations')
      .select('id, name, settings')
      .neq('id', ctx.orgId)

    const orgInfo = new Map<string, { name: string; isCatalog: boolean }>()
    for (const o of orgs ?? []) {
      const settings = (o.settings as Record<string, unknown> | null) ?? {}
      orgInfo.set(o.id as string, {
        name: o.name as string,
        isCatalog: !!settings.is_template_catalog,
      })
    }

    const otherOrgIds = [...orgInfo.keys()]
    if (otherOrgIds.length === 0) return { templates: [] }

    const { data, error } = await ctx.supabase
      .from('pssr_templates')
      .select(`
        id, name, description, is_active, org_id,
        pssr_template_items(id)
      `)
      .in('org_id', otherOrgIds)
      .order('name')

    if (error) return { templates: [], error: error.message }

    const templates: ImportablePssrTemplate[] = (data ?? []).map(t => {
      const items = (t.pssr_template_items ?? []) as Array<{ id: string }>
      const info = orgInfo.get(t.org_id as string)
      return {
        id: t.id as string,
        name: t.name as string,
        description: (t.description as string | null) ?? null,
        isActive: t.is_active as boolean,
        sourceOrgId: t.org_id as string,
        sourceOrgName: info?.name ?? '—',
        sourceOrgIsCatalog: info?.isCatalog ?? false,
        itemCount: items.length,
      }
    })

    return { templates }
  },
)

export const clonePssrTemplateToActiveOrg = withAuthOnly(
  { role: EDITOR_ROLES },
  async (
    ctx,
    sourceTemplateId: string,
    options?: { nameSuffix?: string },
  ): Promise<{ id?: string; error?: string }> => {
    const { data: source } = await ctx.supabase
      .from('pssr_templates')
      .select(`
        id, name, description, is_active, org_id,
        pssr_template_items(
          item_order, category, element, requirement, notes_hint, is_required
        )
      `)
      .eq('id', sourceTemplateId)
      .single()

    if (!source) return { error: 'Template origen no encontrado o sin acceso' }
    if (source.org_id === ctx.orgId) return { error: 'El template ya está en la org activa' }

    const newName = `${source.name}${options?.nameSuffix ?? ''}`

    const { data: existing } = await ctx.supabase
      .from('pssr_templates')
      .select('id')
      .eq('org_id', ctx.orgId)
      .eq('name', newName)
      .maybeSingle()

    if (existing) {
      return { error: `Ya existe un template con nombre "${newName}" en esta org` }
    }

    const { data: cloned, error: tplErr } = await ctx.supabase
      .from('pssr_templates')
      .insert({
        org_id: ctx.orgId,
        name: newName,
        description: source.description,
        is_active: source.is_active,
        created_by: ctx.userId,
      })
      .select('id')
      .single()

    if (tplErr || !cloned) return { error: tplErr?.message ?? 'No se pudo crear el template' }

    const items = (source.pssr_template_items ?? []) as Array<Record<string, unknown>>
    if (items.length > 0) {
      const itemRows = items.map(item => ({ ...item, template_id: cloned.id }))
      const { error: itemErr } = await ctx.supabase
        .from('pssr_template_items')
        .insert(itemRows)
      if (itemErr) return { error: `Template clonado pero items fallaron: ${itemErr.message}` }
    }

    revalidatePath('/admin/templates/pssr')
    return { id: cloned.id }
  },
)
