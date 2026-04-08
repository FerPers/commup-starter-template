'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// ── Default 22-item checklist seed ───────────────────────────

const DEFAULT_ITEMS = [
  { category: 'Ingeniería y Diseño', element: 'Análisis de Seguridad de Procesos (HAZOP)', requirement: '¿Se han completado y aprobado por la autoridad técnica (TA) todas las acciones de HAZOP requeridas para el arranque?', notes_hint: 'Verificar cierre de hallazgos críticos de diseño.' },
  { category: 'Ingeniería y Diseño', element: 'Información de Seguridad de Procesos (PSI)', requirement: '¿Están los P&ID, PFD y las hojas de especificaciones de equipos actualizados y disponibles en el cuarto de control?', notes_hint: 'Documentación as-built o red-lined debe estar accesible.' },
  { category: 'Ingeniería y Diseño', element: 'Gestión de Cambios (MOC)', requirement: '¿Se han documentado y revisado (ej. PHSER3) los cambios de diseño y límites operativos para asegurar que no se diluye la seguridad?', notes_hint: 'Validar recálculos y aprobaciones de ingeniería.' },
  { category: 'Documentación', element: 'Certificación de Equipos e Instalación', requirement: '¿Está completa la documentación de certificación (certificados de equipos, tuberías, instrumentación, hojas de datos eléctricos, calibración, pruebas megger/continuidad)?', notes_hint: 'Revisar dossier de calidad (Handover).' },
  { category: 'Documentación', element: 'Procedimientos Operativos (SOP/EOP)', requirement: '¿Se han preparado, revisado y proporcionado los procedimientos operativos estándar (SOP) y de emergencia (EOP), incluyendo paradas de emergencia?', notes_hint: 'Deben estar impresos y/o digitales en sala de control.' },
  { category: 'Mecánica y Tuberías', element: 'Tuberías y Bridas', requirement: '¿Se ha realizado y aprobado la prueba de fugas y presión en las bridas como parte de la liberación de tuberías?', notes_hint: 'Verificar conformidad con planos isométricos y de diseño.' },
  { category: 'Mecánica y Tuberías', element: 'Recipientes a Presión / Equipos', requirement: '¿Se han verificado los certificados de pruebas hidrostáticas realizadas en el taller del fabricante y en sitio?', notes_hint: 'Requisito previo a la terminación mecánica.' },
  { category: 'Mecánica y Tuberías', element: 'Maquinaria y Equipos Rotativos', requirement: '¿La instalación es estable, cuenta con protecciones (guardas) en partes peligrosas y permite un acceso seguro para operación e inspección?', notes_hint: 'Revisión visual en sitio.' },
  { category: 'Electricidad', element: 'Centros de Control de Motores (MCC)', requirement: '¿Se han etiquetado los interruptores, garantizado el aislamiento de energía y sellado adecuadamente todos los accesorios de conductos (conduits)?', notes_hint: 'Crítico para áreas clasificadas (Hazardous Areas).' },
  { category: 'Instrumentación y Control', element: 'Sistema de Control (DCS) / Interlocks', requirement: '¿Se realizaron las pruebas de lazo (loop testing) y se confirmó que la acción de alarma/enclavamiento de seguridad es a prueba de fallas (fail-safe)?', notes_hint: 'Incluye verificación de hardware y software bajo condición de falla.' },
  { category: 'Instrumentación y Control', element: 'Procedimientos de Seguridad del Sistema', requirement: '¿Están configuradas y probadas la gestión de alarmas, interfaces HPLP y ajustes del sistema de paro de emergencia (ESD)?', notes_hint: 'Verificar matrices de causa y efecto.' },
  { category: 'Seguridad de Procesos', element: 'Válvulas de Alivio (PSV)', requirement: '¿Han sido las válvulas de seguridad inspeccionadas, probadas, etiquetadas y se ha verificado que ventilan a lugares seguros?', notes_hint: 'Verificar cálculos de dimensionamiento y certificados de banco.' },
  { category: 'Seguridad / HSE', element: 'Sistemas de Fuego y Gas (F&G)', requirement: '¿Se ha completado el documento de prueba funcional de los detectores de Fuego y Gas?', notes_hint: 'Simulación de alarmas en campo hacia el panel principal.' },
  { category: 'Seguridad / HSE', element: 'Protección contra Incendios', requirement: '¿Se ha documentado la prueba de aceptación del sistema (red de agua, bombas de incendio, sistema de diluvio, instalación de extintores y señalización de rutas de escape)?', notes_hint: 'Inspección por compañía de seguros si aplica.' },
  { category: 'Seguridad / HSE', element: 'Duchas de Seguridad y Lavaojos', requirement: '¿Están instalados, operativos (con prueba de flujo realizada), sin obstrucciones y correctamente señalizados?', notes_hint: 'Rutina de purga completada.' },
  { category: 'Seguridad / HSE', element: 'Equipo de Protección Personal (PPE)', requirement: '¿Se ha especificado, provisto y capacitado a los usuarios en el PPE adecuado según los Procedimientos de Trabajo? ¿Están instaladas las señales de advertencia?', notes_hint: 'Verificación en campo de la señalética instalada.' },
  { category: 'Seguridad / HSE', element: 'Aislamiento de Energía (LOTO)', requirement: '¿Se ha completado, adjuntado y verificado la lista de verificación y el formulario del sistema de Bloqueo y Etiquetado (LOTO)?', notes_hint: 'Validar candados y tarjetas en campo.' },
  { category: 'Operaciones y Capacitación', element: 'Entrenamiento del Personal', requirement: '¿Ha recibido todo el personal afectado (Operaciones, Mantenimiento, Supervisión) formación sobre los nuevos equipos, procedimientos de arranque y SOPs?', notes_hint: 'Documentar registros de asistencia e ingresar al sistema.' },
  { category: 'Mantenimiento', element: 'Mantenimiento Preventivo (PM)', requirement: '¿Se han actualizado e ingresado al sistema de gestión (CMMS) los programas y procedimientos de mantenimiento preventivo para los nuevos equipos?', notes_hint: 'Asegurar disponibilidad de repuestos críticos.' },
  { category: 'Medio Ambiente', element: 'Sistemas de Contención y Tratamiento', requirement: '¿Tienen los sistemas contención secundaria adecuada (110% del volumen)? ¿Están operativas las unidades de tratamiento de aguas residuales?', notes_hint: 'Revisar etiquetado de materiales peligrosos y gestión de residuos.' },
  { category: 'Construcción y Comisionamiento', element: 'Orden y Aseo (Housekeeping)', requirement: '¿Se han retirado todos los andamios, plataformas temporales, materiales combustibles y escombros, asegurando rutas de escape despejadas?', notes_hint: 'Recorrido final de limpieza de la planta.' },
  { category: 'Construcción y Comisionamiento', element: 'Lista de Pendientes (Punch List)', requirement: '¿Se han completado y cerrado todos los elementos de pre-comisionamiento categoría "A" (requeridos para el arranque seguro)?', notes_hint: 'Adjuntar reporte del sistema de Punch List.' },
]

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
  const items = DEFAULT_ITEMS.map((item, i) => ({
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

  revalidatePath(`/projects/${projectId}/pssr/${reviewId}`)
  revalidatePath(`/projects/${projectId}/pssr`)
  revalidatePath(`/certificates`)
  return cert
}

export async function rejectPssrReview(reviewId: string, projectId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('pssr_reviews')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', reviewId)
  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}/pssr/${reviewId}`)
}