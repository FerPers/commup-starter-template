'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuth, withAuthOnly } from '@/lib/auth/withAuth'
import { logActivity } from '@/lib/log-activity'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/supabase.generated'
import { DEFAULT_PSSR_ITEMS, PSSR_ALREADY_SIGNED } from '@/lib/constants/pssr'
import {
  notifyPssrSubmittedForApproval,
  notifyPssrApproved,
  notifyPssrRejected,
} from '@/lib/notifications/pssr'

// Q4 2026-06-11: convertido del contrato throw (shim requireCtx) al contrato
// { error } estándar del wrapper withAuth. Los callers (PssrReviewForm,
// PssrListView, PssrTemplatesView, PssrTemplateEditor) usan `if (res.error)`.
//
// Roles: la EJECUCIÓN del review (items, firmas, submit) es auth-only — los
// representantes de disciplina que firman pueden ser inspectores (no EDITOR).
// Template CRUD y aprobación/rechazo exigen EDITOR.

// ── Template CRUD ─────────────────────────────────────────────

export const createPssrTemplate = withAuth(
  { role: EDITOR_ROLES },
  async (
    ctx,
    input: { name: string; description?: string },
  ): Promise<{ template?: Tables<'pssr_templates'>; error?: string }> => {
    const { data: template, error } = await ctx.supabase.from('pssr_templates').insert({
      org_id: ctx.orgId,
      name: input.name,
      description: input.description ?? null,
      created_by: ctx.userId,
    }).select().single()
    if (error) return { error: error.message }

    revalidatePath('/admin/templates/pssr')
    return { template }
  },
)

export const seedDefaultPssrTemplate = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, templateId: string): Promise<{ error?: string }> => {
    const items = DEFAULT_PSSR_ITEMS.map((item, i) => ({
      template_id: templateId,
      item_order: i + 1,
      ...item,
    }))
    const { error } = await ctx.supabase.from('pssr_template_items').insert(items)
    if (error) return { error: error.message }
    revalidatePath(`/admin/templates/pssr/${templateId}`)
    return {}
  },
)

export const upsertPssrTemplateItem = withAuth(
  { role: EDITOR_ROLES },
  async (
    ctx,
    input: {
      id?: string
      templateId: string
      itemOrder: number
      category: string
      element: string
      requirement: string
      notesHint?: string
      isRequired?: boolean
    },
  ): Promise<{ error?: string }> => {
    const payload = {
      template_id: input.templateId,
      item_order: input.itemOrder,
      category: input.category,
      element: input.element,
      requirement: input.requirement,
      notes_hint: input.notesHint ?? null,
      is_required: input.isRequired ?? true,
    }
    const { error } = input.id
      ? await ctx.supabase.from('pssr_template_items').update(payload).eq('id', input.id)
      : await ctx.supabase.from('pssr_template_items').insert(payload)
    if (error) return { error: error.message }
    revalidatePath(`/admin/templates/pssr/${input.templateId}`)
    return {}
  },
)

export const deletePssrTemplateItem = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, itemId: string, templateId: string): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.from('pssr_template_items').delete().eq('id', itemId)
    if (error) return { error: error.message }
    revalidatePath(`/admin/templates/pssr/${templateId}`)
    return {}
  },
)

export const deletePssrTemplate = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, templateId: string): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.from('pssr_templates').delete().eq('id', templateId)
    if (error) return { error: error.message }
    revalidatePath('/admin/templates/pssr')
    return {}
  },
)

// ── Review CRUD ───────────────────────────────────────────────

export const createPssrReview = withAuth(
  {
    // Crear un review es planificación → EDITOR (política 2026-05-24)
    role: EDITOR_ROLES,
    guards: [
      { resource: 'project', field: 'projectId' },
      { resource: 'system', field: 'systemId', scopeField: 'projectId' },
    ],
  },
  async (
    ctx,
    input: {
      projectId: string
      systemId: string
      templateId: string
      title?: string
      reviewDueDate?: string | null
    },
  ): Promise<{ review?: Tables<'pssr_reviews'>; error?: string }> => {
    const supabase = ctx.supabase

    // El guard declarativo de 'template' valida itr_templates — los PSSR viven
    // en pssr_templates, así que la pertenencia a la org se chequea a mano.
    const { data: tpl } = await supabase
      .from('pssr_templates')
      .select('id')
      .eq('id', input.templateId)
      .eq('org_id', ctx.orgId)
      .maybeSingle()
    if (!tpl) return { error: 'Template PSSR no encontrado' }

    // Auto-number per system: PSSR-001, PSSR-002...
    const { count } = await supabase
      .from('pssr_reviews')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', input.projectId)
      .eq('system_id', input.systemId)
    const reviewNumber = `PSSR-${String((count ?? 0) + 1).padStart(3, '0')}`

    const insertRow: TablesInsert<'pssr_reviews'> = {
      org_id: ctx.orgId,
      project_id: input.projectId,
      system_id: input.systemId,
      template_id: input.templateId,
      review_number: reviewNumber,
      title: input.title ?? 'Pre-Startup Safety Review',
      created_by: ctx.userId,
    }
    if (input.reviewDueDate) insertRow.review_due_date = input.reviewDueDate

    const { data: review, error: reviewError } = await supabase.from('pssr_reviews').insert(insertRow).select().single()
    if (reviewError) return { error: reviewError.message }

    // Copy template items to review items
    const { data: templateItems } = await supabase
      .from('pssr_template_items')
      .select('*')
      .eq('template_id', input.templateId)
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
      if (itemsError) return { error: itemsError.message }
    }

    revalidatePath(`/projects/${input.projectId}/pssr`)
    return { review }
  },
)

export const updatePssrReviewItem = withAuth(
  { guards: [{ resource: 'project', field: 'projectId' }] },
  async (
    ctx,
    input: {
      itemId: string
      reviewId: string
      projectId: string
      status?: 'pending' | 'si' | 'no' | 'na'
      responsible?: string
      actions?: string
      completionDate?: string | null
    },
  ): Promise<{ error?: string }> => {
    const supabase = ctx.supabase

    const payload: TablesUpdate<'pssr_review_items'> = { updated_by: ctx.userId, updated_at: new Date().toISOString() }
    if (input.status !== undefined)         payload.status = input.status
    if (input.responsible !== undefined)    payload.responsible = input.responsible
    if (input.actions !== undefined)        payload.actions = input.actions
    if (input.completionDate !== undefined) payload.completion_date = input.completionDate

    const { error } = await supabase.from('pssr_review_items').update(payload).eq('id', input.itemId)
    if (error) return { error: error.message }

    // Auto-advance review status to in_progress when first item is touched
    await supabase
      .from('pssr_reviews')
      .update({ status: 'in_progress', updated_at: new Date().toISOString() })
      .eq('id', input.reviewId)
      .eq('status', 'draft')

    revalidatePath(`/projects/${input.projectId}/pssr/${input.reviewId}`)
    return {}
  },
)

export const updatePssrReviewNotes = withAuthOnly(
  {},
  async (ctx, reviewId: string, projectId: string, notes: string): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase
      .from('pssr_reviews')
      .update({ notes, updated_at: new Date().toISOString() })
      .eq('id', reviewId)
    if (error) return { error: error.message }
    revalidatePath(`/projects/${projectId}/pssr/${reviewId}`)
    return {}
  },
)

export const updatePssrReviewDueDate = withAuthOnly(
  // Fecha límite es planificación → EDITOR
  { role: EDITOR_ROLES },
  async (ctx, reviewId: string, projectId: string, reviewDueDate: string | null): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase
      .from('pssr_reviews')
      .update({ review_due_date: reviewDueDate, last_overdue_notif_at: null, updated_at: new Date().toISOString() })
      .eq('id', reviewId)
    if (error) return { error: error.message }
    revalidatePath(`/projects/${projectId}/pssr/${reviewId}`)
    revalidatePath(`/projects/${projectId}/pssr`)
    return {}
  },
)

export const submitPssrForApproval = withAuthOnly(
  {},
  async (ctx, reviewId: string, projectId: string): Promise<{ error?: string }> => {
    const supabase = ctx.supabase

    // Verify all items are si or na
    const { data: pendingItems } = await supabase
      .from('pssr_review_items')
      .select('id')
      .eq('review_id', reviewId)
      .in('status', ['pending', 'no'])

    if (pendingItems && pendingItems.length > 0)
      return { error: `${pendingItems.length} ítem(s) sin completar o con estado NO` }

    const { data: review, error: fetchErr } = await supabase
      .from('pssr_reviews')
      .select('id, org_id, review_number, systems(code, name)')
      .eq('id', reviewId)
      .single()
    if (fetchErr || !review) return { error: fetchErr?.message ?? 'PSSR no encontrado' }

    const { error } = await supabase
      .from('pssr_reviews')
      .update({ status: 'pending_approval', updated_at: new Date().toISOString() })
      .eq('id', reviewId)
    if (error) return { error: error.message }

    const sys = (review.systems as unknown) as { code: string | null; name: string | null } | null
    await notifyPssrSubmittedForApproval(createAdminClient(), {
      orgId: review.org_id,
      submitterUserId: ctx.userId,
      reviewId,
      reviewNumber: review.review_number,
      projectId,
      systemCode: sys?.code ?? null,
      systemName: sys?.name ?? null,
    })

    revalidatePath(`/projects/${projectId}/pssr/${reviewId}`)
    return {}
  },
)

export const addPssrSignature = withAuth(
  { guards: [{ resource: 'project', field: 'projectId' }] },
  async (
    ctx,
    input: {
      reviewId: string
      projectId: string
      discipline: string
      signatureData: string
    },
  ): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.from('pssr_signatures').insert({
      review_id: input.reviewId,
      user_id: ctx.userId,
      discipline: input.discipline,
      signature_data: input.signatureData,
      signed_at: new Date().toISOString(),
    })
    if (error) {
      // 23505 unique_violation on (review_id, user_id) → user already signed
      if (error.code === '23505') return { error: PSSR_ALREADY_SIGNED }
      return { error: error.message }
    }

    revalidatePath(`/projects/${input.projectId}/pssr/${input.reviewId}`)
    return {}
  },
)

export const removePssrSignature = withAuthOnly(
  // Identidad/admin la gobierna RLS sobre pssr_signatures; aquí solo auth
  {},
  async (ctx, signatureId: string, reviewId: string, projectId: string): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.from('pssr_signatures').delete().eq('id', signatureId)
    if (error) return { error: error.message }
    revalidatePath(`/projects/${projectId}/pssr/${reviewId}`)
    return {}
  },
)

// ── Approve PSSR + Issue RFSU Certificate ────────────────────

export const approvePssrAndIssueRfsu = withAuthOnly(
  { role: EDITOR_ROLES },
  async (
    ctx,
    reviewId: string,
    projectId: string,
  ): Promise<{ cert?: Tables<'certificates'>; error?: string }> => {
    const supabase = ctx.supabase

    // Verify signatures exist
    const { count: sigCount } = await supabase
      .from('pssr_signatures')
      .select('*', { count: 'exact', head: true })
      .eq('review_id', reviewId)
    if (!sigCount || sigCount === 0)
      return { error: 'Se requiere al menos una firma antes de aprobar' }

    // Get review + system info
    const { data: review } = await supabase
      .from('pssr_reviews')
      .select('*, systems(id, name, code), projects(id, org_id)')
      .eq('id', reviewId)
      .single()
    if (!review) return { error: 'PSSR no encontrado' }

    // Find Phase D (Start-Up) for the RFSU certificate
    const { data: phaseD } = await supabase
      .from('project_phases')
      .select('id, certificate_name, code')
      .eq('org_id', (review.projects as { org_id: string }).org_id)
      .order('order_index', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!phaseD) return { error: 'No hay fases configuradas en la organización — crea las fases antes de aprobar el PSSR' }

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
      phase_id: phaseD.id,
      certificate_number: certNumber,
      title: `RFSU — ${system?.name ?? 'Sistema'} (${system?.code ?? ''})`,
      status: 'issued',
      issued_date: new Date().toISOString().split('T')[0],
      issued_by: ctx.userId,
      approved_by: ctx.userId,
    }).select().single()
    if (certError) return { error: certError.message }

    // Approve PSSR + link certificate
    const { error } = await supabase.from('pssr_reviews').update({
      status: 'approved',
      approved_by: ctx.userId,
      approved_at: new Date().toISOString(),
      rfsu_certificate_id: cert.id,
      updated_at: new Date().toISOString(),
    }).eq('id', reviewId)
    if (error) return { error: error.message }

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
      createdBy: review.created_by ?? null,
      rfsuCertNumber: cert.certificate_number,
      rfsuCertId: cert.id,
      reviewId,
      reviewNumber: review.review_number,
      projectId,
      systemCode: system?.code ?? null,
      systemName: system?.name ?? null,
    })

    revalidatePath(`/projects/${projectId}/pssr/${reviewId}`)
    revalidatePath(`/projects/${projectId}/pssr`)
    revalidatePath(`/certificates`)
    return { cert }
  },
)

export const rejectPssrReview = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, reviewId: string, projectId: string, reason?: string): Promise<{ error?: string }> => {
    const supabase = ctx.supabase

    const { data: review, error: fetchErr } = await supabase
      .from('pssr_reviews')
      .select('id, org_id, review_number, created_by, systems(code, name)')
      .eq('id', reviewId)
      .single()
    if (fetchErr || !review) return { error: fetchErr?.message ?? 'PSSR no encontrado' }

    const { error } = await supabase
      .from('pssr_reviews')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', reviewId)
    if (error) return { error: error.message }

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
      orgId: review.org_id,
      rejecterUserId: ctx.userId,
      createdBy: review.created_by ?? null,
      reason: reason?.trim() ?? null,
      reviewId,
      reviewNumber: review.review_number,
      projectId,
      systemCode: sys?.code ?? null,
      systemName: sys?.name ?? null,
    })

    revalidatePath(`/projects/${projectId}/pssr/${reviewId}`)
    return {}
  },
)

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
      orgInfo.set(o.id, {
        name: o.name,
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
      const items = t.pssr_template_items ?? []
      const info = orgInfo.get(t.org_id)
      return {
        id: t.id,
        name: t.name,
        description: t.description ?? null,
        isActive: t.is_active,
        sourceOrgId: t.org_id,
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

    const items = source.pssr_template_items ?? []
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
