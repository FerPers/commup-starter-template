'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/log-activity'
import { DEFAULT_PSSR_ITEMS } from '@/lib/constants/pssr'

// ── Template CRUD ─────────────────────────────────────────────

export async function createPssrTemplate(data: { name: string; description?: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const { data: membership } = await supabase
    .from('org_members').select('org_id, role').eq('user_id', user.id).limit(1).maybeSingle()
  if (!membership || !['owner','admin','architect','leader'].includes(membership.role))
    throw new Error('Sin permisos')

  const { data: template, error } = await supabase.from('pssr_templates').insert({
    org_id: membership.org_id,
    name: data.name,
    description: data.description ?? null,
    created_by: user.id,
  }).select().single()
  if (error) throw new Error(error.message)

  revalidatePath('/admin/templates/pssr')
  return template
}

export async function seedDefaultPssrTemplate(templateId: string) {
  const supabase = await createClient()
  const items = DEFAULT_PSSR_ITEMS.map((item, i) => ({
    template_id: templateId,
    item_order: i + 1,
    ...item,
  }))
  const { error } = await supabase.from('pssr_template_items').insert(items)
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
  const supabase = await createClient()
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
    ? await supabase.from('pssr_template_items').update(payload).eq('id', data.id)
    : await supabase.from('pssr_template_items').insert(payload)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/templates/pssr/${data.templateId}`)
}

export async function deletePssrTemplateItem(itemId: string, templateId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('pssr_template_items').delete().eq('id', itemId)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/templates/pssr/${templateId}`)
}

export async function deletePssrTemplate(templateId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('pssr_templates').delete().eq('id', templateId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/templates/pssr')
}

// ── Review CRUD ───────────────────────────────────────────────

export async function createPssrReview(data: {
  projectId: string
  systemId: string
  templateId: string
  title?: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  // Get org_id
  const { data: project } = await supabase
    .from('projects').select('org_id').eq('id', data.projectId).single()
  if (!project) throw new Error('Proyecto no encontrado')

  // Auto-number per system: PSSR-001, PSSR-002...
  const { count } = await supabase
    .from('pssr_reviews')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', data.projectId)
    .eq('system_id', data.systemId)
  const reviewNumber = `PSSR-${String((count ?? 0) + 1).padStart(3, '0')}`

  const { data: review, error: reviewError } = await supabase.from('pssr_reviews').insert({
    org_id: project.org_id,
    project_id: data.projectId,
    system_id: data.systemId,
    template_id: data.templateId,
    review_number: reviewNumber,
    title: data.title ?? 'Pre-Startup Safety Review',
    created_by: user.id,
  }).select().single()
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const payload: Record<string, unknown> = { updated_by: user.id, updated_at: new Date().toISOString() }
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
  const supabase = await createClient()
  const { error } = await supabase
    .from('pssr_reviews')
    .update({ notes, updated_at: new Date().toISOString() })
    .eq('id', reviewId)
  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}/pssr/${reviewId}`)
}

export async function submitPssrForApproval(reviewId: string, projectId: string) {
  const supabase = await createClient()

  // Verify all items are si or na
  const { data: pendingItems } = await supabase
    .from('pssr_review_items')
    .select('id')
    .eq('review_id', reviewId)
    .in('status', ['pending', 'no'])

  if (pendingItems && pendingItems.length > 0)
    throw new Error(`${pendingItems.length} ítem(s) sin completar o con estado NO`)

  const { error } = await supabase
    .from('pssr_reviews')
    .update({ status: 'pending_approval', updated_at: new Date().toISOString() })
    .eq('id', reviewId)
  if (error) throw new Error(error.message)

  revalidatePath(`/projects/${projectId}/pssr/${reviewId}`)
}

export async function addPssrSignature(data: {
  reviewId: string
  projectId: string
  discipline: string
  signatureData: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const { error } = await supabase.from('pssr_signatures').upsert({
    review_id: data.reviewId,
    user_id: user.id,
    discipline: data.discipline,
    signature_data: data.signatureData,
    signed_at: new Date().toISOString(),
  }, { onConflict: 'review_id,user_id' })
  if (error) throw new Error(error.message)

  revalidatePath(`/projects/${data.projectId}/pssr/${data.reviewId}`)
}

export async function removePssrSignature(signatureId: string, reviewId: string, projectId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('pssr_signatures').delete().eq('id', signatureId)
  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}/pssr/${reviewId}`)
}

// ── Approve PSSR + Issue RFSU Certificate ────────────────────

export async function approvePssrAndIssueRfsu(reviewId: string, projectId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  // Must be leader+ to approve
  const { data: membership } = await supabase
    .from('org_members').select('role').eq('user_id', user.id).limit(1).maybeSingle()
  if (!membership || !['owner','admin','architect','leader'].includes(membership.role))
    throw new Error('Solo líderes o superiores pueden aprobar el PSSR')

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
    issued_by: user.id,
    approved_by: user.id,
  }).select().single()
  if (certError) throw new Error(certError.message)

  // Approve PSSR + link certificate
  const { error } = await supabase.from('pssr_reviews').update({
    status: 'approved',
    approved_by: user.id,
    approved_at: new Date().toISOString(),
    rfsu_certificate_id: cert.id,
    updated_at: new Date().toISOString(),
  }).eq('id', reviewId)
  if (error) throw new Error(error.message)

  // Get orgId for logActivity
  const { data: member } = await supabase
    .from('org_members').select('org_id').eq('user_id', user.id).limit(1).maybeSingle()

  await logActivity(supabase, {
    orgId: (member?.org_id ?? (review.projects as { org_id: string }).org_id) as string,
    userId: user.id,
    entityType: 'pssr',
    entityId: reviewId,
    action: 'approved',
    payload: { projectId, certNumber: cert.certificate_number, certId: cert.id },
  })

  revalidatePath(`/projects/${projectId}/pssr/${reviewId}`)
  revalidatePath(`/projects/${projectId}/pssr`)
  revalidatePath(`/certificates`)
  return cert
}

export async function rejectPssrReview(reviewId: string, projectId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('pssr_reviews')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', reviewId)
  if (error) throw new Error(error.message)

  if (user) {
    const { data: member } = await supabase
      .from('org_members').select('org_id').eq('user_id', user.id).limit(1).maybeSingle()
    if (member) {
      await logActivity(supabase, {
        orgId: member.org_id as string,
        userId: user.id,
        entityType: 'pssr',
        entityId: reviewId,
        action: 'rejected',
        payload: { projectId },
      })
    }
  }

  revalidatePath(`/projects/${projectId}/pssr/${reviewId}`)
}