'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { EDITOR_ROLES, PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { withAuth, withAuthOnly } from '@/lib/auth/withAuth'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/supabase.generated'
import { DEFAULT_PSSR_ITEMS, PSSR_ALREADY_SIGNED, PSSR_CAPACITIES, type PssrCapacity } from '@/lib/constants/pssr'
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

// I-14 (S08): mismo tier que la RLS (owner/admin/architect) y se comprueba que algo se borró.
/** S16 (C-32): firmas requeridas por los PSSR que se creen con la plantilla (se congelan en cada PSSR). */
export const setPssrTemplateSignatures = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, input: { templateId: string; signatures: PssrCapacity[] }): Promise<{ error?: string }> => {
    const signatures = [...new Set(input.signatures)].filter(c => PSSR_CAPACITIES.includes(c))
    const { data, error } = await ctx.supabase.from('pssr_templates').update({ required_signatures: signatures, updated_at: new Date().toISOString() })
      .eq('id', input.templateId).eq('org_id', ctx.orgId).select('id')
    if (error) return { error: error.message }
    if (!data?.length) return { error: 'Plantilla no encontrada o sin permiso' }
    revalidatePath(`/admin/templates/pssr/${input.templateId}`)
    return {}
  },
)

export const deletePssrTemplate = withAuthOnly(
  { role: PRIVILEGED_ROLES },
  async (ctx, templateId: string): Promise<{ error?: string }> => {
    const { data, error } = await ctx.supabase.from('pssr_templates').delete().eq('id', templateId).eq('org_id', ctx.orgId).select('id')
    if (error) return { error: error.message }
    if (!data?.length) return { error: 'No se pudo borrar la plantilla (sin permiso o ya no existe)' }
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
    if (ctx.role === 'client') return { error: 'Sin permiso' }
    const payload: TablesUpdate<'pssr_review_items'> = { updated_by: ctx.userId, updated_at: new Date().toISOString() }
    if (input.status !== undefined)         payload.status = input.status
    if (input.responsible !== undefined)    payload.responsible = input.responsible
    if (input.actions !== undefined)        payload.actions = input.actions
    if (input.completionDate !== undefined) payload.completion_date = input.completionDate

    // S16 (C-32): el trigger guard_pssr_review_item bloquea la edición después de enviar y pasa el PSSR a
    // in_progress al tocar el primer ítem (antes lo hacía esta acción con un UPDATE directo).
    const { error } = await ctx.supabase.from('pssr_review_items').update(payload).eq('id', input.itemId).eq('review_id', input.reviewId)
    if (error) return { error: error.message }

    revalidatePath(`/projects/${input.projectId}/pssr/${input.reviewId}`)
    if (input.status === 'no') revalidatePath(`/projects/${input.projectId}/daily`)
    return {}
  },
)

export const updatePssrReviewNotes = withAuth(
  { guards: [{ resource: 'project', field: 'projectId' }] },
  async (ctx, input: { reviewId: string; projectId: string; notes: string }): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.rpc('update_pssr_meta', {
      p_review_id: input.reviewId, p_set_notes: true, p_notes: input.notes, p_set_due: false, p_due: null as unknown as string,
    })
    if (error) return { error: error.message }
    revalidatePath(`/projects/${input.projectId}/pssr/${input.reviewId}`)
    return {}
  },
)

export const updatePssrReviewDueDate = withAuth(
  // Fecha límite es planificación → EDITOR (la RPC lo vuelve a exigir)
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'projectId' }] },
  async (ctx, input: { reviewId: string; projectId: string; dueDate: string | null }): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.rpc('update_pssr_meta', {
      p_review_id: input.reviewId, p_set_notes: false, p_notes: null as unknown as string, p_set_due: true, p_due: input.dueDate as string,
    })
    if (error) return { error: error.message }
    revalidatePath(`/projects/${input.projectId}/pssr/${input.reviewId}`)
    revalidatePath(`/projects/${input.projectId}/pssr`)
    return {}
  },
)

/**
 * S16 (A-04/C-12/C-32): enviar, firmar, aprobar y rechazar pasan por RPC SECURITY DEFINER con las reglas en SQL
 * (ítems sí/NA, punch con disposición para el arranque —pssr_punch_blocker—, firmas por capacidad, aprobador
 * distinto de quien envió y de los firmantes). Aquí solo quedan guards, notificaciones y revalidación.
 */
export const submitPssrForApproval = withAuth(
  { guards: [{ resource: 'project', field: 'projectId' }] },
  async (ctx, input: { reviewId: string; projectId: string }): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.rpc('submit_pssr', { p_review_id: input.reviewId })
    if (error) return { error: error.message }

    const { data: review } = await ctx.supabase
      .from('pssr_reviews')
      .select('id, org_id, review_number, systems(code, name)')
      .eq('id', input.reviewId)
      .single()
    if (review) {
      const sys = (review.systems as unknown) as { code: string | null; name: string | null } | null
      await notifyPssrSubmittedForApproval(createAdminClient(), {
        orgId: review.org_id,
        submitterUserId: ctx.userId,
        reviewId: input.reviewId,
        reviewNumber: review.review_number,
        projectId: input.projectId,
        systemCode: sys?.code ?? null,
        systemName: sys?.name ?? null,
      })
    }
    revalidatePath(`/projects/${input.projectId}/pssr/${input.reviewId}`)
    return {}
  },
)

export const addPssrSignature = withAuth(
  { guards: [{ resource: 'project', field: 'projectId' }] },
  async (
    ctx,
    input: { reviewId: string; projectId: string; capacity: PssrCapacity; signatureData: string },
  ): Promise<{ error?: string }> => {
    if (!PSSR_CAPACITIES.includes(input.capacity)) return { error: 'Firma no válida' }
    const { error } = await ctx.supabase.rpc('sign_pssr', {
      p_review_id: input.reviewId, p_capacity: input.capacity, p_signature_data: input.signatureData,
    })
    if (error) return { error: error.code === '23505' && /Ya firmaste/.test(error.message) ? PSSR_ALREADY_SIGNED : error.message }
    revalidatePath(`/projects/${input.projectId}/pssr/${input.reviewId}`)
    return {}
  },
)

export const removePssrSignature = withAuth(
  { guards: [{ resource: 'project', field: 'projectId' }] },
  async (ctx, input: { signatureId: string; reviewId: string; projectId: string }): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.rpc('unsign_pssr', { p_signature_id: input.signatureId })
    if (error) return { error: error.message }
    revalidatePath(`/projects/${input.projectId}/pssr/${input.reviewId}`)
    return {}
  },
)

// ── Approve PSSR + Issue RFSU Certificate ────────────────────

export const approvePssrAndIssueRfsu = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'projectId' }] },
  async (ctx, input: { reviewId: string; projectId: string }): Promise<{ cert?: Tables<'certificates'>; error?: string }> => {
    const { data: certId, error } = await ctx.supabase.rpc('approve_pssr', { p_review_id: input.reviewId })
    if (error) return { error: error.message }

    const [{ data: cert }, { data: review }] = await Promise.all([
      ctx.supabase.from('certificates').select('*').eq('id', certId as string).single(),
      ctx.supabase.from('pssr_reviews').select('review_number, created_by, systems(code, name)').eq('id', input.reviewId).single(),
    ])
    if (cert && review) {
      const system = review.systems as unknown as { code: string | null; name: string | null } | null
      await notifyPssrApproved(createAdminClient(), {
        orgId: ctx.orgId,
        approverUserId: ctx.userId,
        createdBy: review.created_by ?? null,
        rfsuCertNumber: cert.certificate_number,
        rfsuCertId: cert.id,
        reviewId: input.reviewId,
        reviewNumber: review.review_number,
        projectId: input.projectId,
        systemCode: system?.code ?? null,
        systemName: system?.name ?? null,
      })
    }
    revalidatePath(`/projects/${input.projectId}/pssr/${input.reviewId}`)
    revalidatePath(`/projects/${input.projectId}/pssr`)
    revalidatePath(`/certificates`)
    return { cert: cert ?? undefined }
  },
)

export const rejectPssrReview = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'projectId' }] },
  async (ctx, input: { reviewId: string; projectId: string; reason: string }): Promise<{ error?: string }> => {
    const reason = (input.reason ?? '').trim()
    if (reason.length < 3) return { error: 'Indica el motivo del rechazo' }
    const { error } = await ctx.supabase.rpc('reject_pssr', { p_review_id: input.reviewId, p_reason: reason })
    if (error) return { error: error.message }

    const { data: review } = await ctx.supabase
      .from('pssr_reviews')
      .select('org_id, review_number, created_by, systems(code, name)')
      .eq('id', input.reviewId)
      .single()
    if (review) {
      const sys = (review.systems as unknown) as { code: string | null; name: string | null } | null
      await notifyPssrRejected(createAdminClient(), {
        orgId: review.org_id,
        rejecterUserId: ctx.userId,
        createdBy: review.created_by ?? null,
        reason,
        reviewId: input.reviewId,
        reviewNumber: review.review_number,
        projectId: input.projectId,
        systemCode: sys?.code ?? null,
        systemName: sys?.name ?? null,
      })
    }
    revalidatePath(`/projects/${input.projectId}/pssr/${input.reviewId}`)
    revalidatePath(`/projects/${input.projectId}/pssr`)
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
