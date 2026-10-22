import { getActiveMembership } from '@/lib/supabase/membership'
import RememberRecent from '@/components/layout/RememberRecent'
import { redirect, notFound } from 'next/navigation'
import { fetchConsolidatedTagPhotos } from '@/lib/tag-photos'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { fetchAllRowsFlagged } from '@/lib/list/fetch-all'
import TagDetail from './TagDetail'
import TagRequirementsPanel, { type TagReq } from './TagRequirementsPanel'
import type { ReqState, ReqOrigin } from '@/lib/itr/requirements'
import { loadPidDrawings } from '@/lib/documents/pid'
import { normalizePidRef } from '@/lib/excel/normalize'
import { parseTagTab } from './tag-detail-shared'
import { ROLE_TIERS } from '@/lib/constants/roles'

export default async function TagDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; tagId: string }>
  searchParams: Promise<{ tab?: string | string[] }>
}) {
  const { id: projectId, tagId } = await params
  const initialTab = parseTagTab((await searchParams).tab)

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const canEdit = ROLE_TIERS.privileged.includes(membership.role)
  // C-16 (D9): mover de subsistema es de líder+ (la RPC lo vuelve a verificar).
  const canMove = EDITOR_ROLES.includes(membership.role)

  const [
    { data: project },
    { data: tag },
    { data: tagItrs },
    { data: orgMembers },
    { data: tagPunches },
    { data: preservationPlans },
    { data: preservationProcedures },
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('id, code, name')
      .eq('id', projectId)
      .eq('org_id', membership.org_id)
      .single(),
    supabase
      .from('tags')
      .select(`
        id, tag_number, description, status,
        manufacturer, model, serial_number,
        preservation_required, pid_drawing,
        nfc_uid,
        range_min, range_max, eng_unit,
        sp_h, sp_hh, sp_l, sp_ll,
        signal_type, sil_level, criticality, io_address, junction_box, datasheet_number, revision,
        fluid_type, mounting_typical,
        equipment_type_id, equipment_types(id, code, name),
        disciplines(id, code, name, color),
        subsystems(
          id, code, name,
          systems(id, code, name, areas(id, code, name))
        )
      `)
      .eq('id', tagId)
      .eq('project_id', projectId)
      .single(),
    supabase
      .from('itrs')
      .select(`
        id, itr_number, status, progress_pct, scheduled_date, created_at, required_signatures,
        itr_templates(code, title, disciplines(code, name, color)),
        project_phases(code, name, color),
        itr_assignments(user_id, role, profiles(full_name)),
        itr_signatures(id, role, signed_at)
      `)
      .eq('tag_id', tagId)
      .order('created_at', { ascending: false }),
    supabase
      .from('org_members')
      .select('user_id, role, profiles(full_name)')
      .eq('org_id', membership.org_id)
      .order('role'),
    supabase
      .from('punches')
      .select(`
        id, punch_number, category, description, status, priority,
        target_date, closed_date, created_at, itr_id, assigned_to, resolved_at, resolved_by,
        raised_by, impact, startup_disposition, category_reviewed_at,
        raised_by_profile:profiles!raised_by(full_name),
        resolved_by_profile:profiles!resolved_by(full_name),
        assigned_to_profile:profiles!assigned_to(full_name)
      `)
      .eq('tag_id', tagId)
      .order('created_at', { ascending: false }),
    supabase
      .from('preservation_plans')
      .select(`
        id, status, start_date, next_due_date, last_performed_date, responsible_user_id,
        preservation_procedures(id, code, title, frequency, interval_days, disciplines(code, color)),
        profiles:responsible_user_id(full_name)
      `)
      .eq('tag_id', tagId)
      .order('status'),
    supabase
      .from('preservation_procedures')
      .select('id, code, title, frequency, interval_days, disciplines(code, color)')
      .eq('org_id', membership.org_id)
      .order('code'),
  ])

  if (!project) notFound()
  if (!tag) notFound()

  // Templates for this tag's discipline (sequential — needs disciplineId)
  const { data: allTemplates } = await supabase
    .from('itr_templates')
    .select('id, code, title, title_es, phase_id, equipment_type_id, required_signatures, project_phases(id, code, name, color, itr_client_signature)')
    .eq('org_id', membership.org_id)
    .eq('is_active', true)
    .eq('discipline_id', tag.disciplines.id)
    .order('code')
  // Fase 4-D: las plantillas con tabla desde lazo o matriz C&E se generan en Lazos / Matrices C&E, no por tag.
  const { data: sourceItems } = await supabase
    .from('itr_template_items')
    .select('template_id')
    .in('template_id', (allTemplates ?? []).map(t => t.id))
    .eq('item_type', 'table')
    .eq('options->rows->>mode', 'source')
  const sourceTemplateIds = new Set((sourceItems ?? []).map(i => i.template_id))
  const templates = (allTemplates ?? []).filter(t => !sourceTemplateIds.has(t.id))

  // Matriz de la org: plantillas aceptadas para el tipo de equipo de este tag
  const { data: matrixRows } = tag.equipment_type_id
    ? await supabase
        .from('equipment_type_templates')
        .select('itr_template_id')
        .eq('org_id', membership.org_id)
        .eq('equipment_type_id', tag.equipment_type_id)
        .eq('status', 'accepted')
    : { data: [] as { itr_template_id: string }[] }
  const matrixTemplateIds = (matrixRows ?? []).map(r => r.itr_template_id)

  // S09 (B-07): subsistemas paginados (PostgREST corta en 1000) y navegación anterior/siguiente con dos
  // lecturas de 1 fila por tag_number (único por proyecto) en vez de cargar todos los ids del proyecto.
  const [subsystemRes, { data: prevRow }, { data: nextRow }] = await Promise.all([
    canMove
      ? fetchAllRowsFlagged(() => supabase
          .from('subsystems')
          .select('id, code, name, systems!inner(code, project_id)')
          .eq('systems.project_id', projectId)
          .order('code'))
      : Promise.resolve({ rows: [], truncated: false }),
    supabase
      .from('tags')
      .select('id')
      .eq('project_id', projectId)
      .lt('tag_number', tag.tag_number)
      .order('tag_number', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('tags')
      .select('id')
      .eq('project_id', projectId)
      .gt('tag_number', tag.tag_number)
      .order('tag_number', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])
  const subsystemOptions = subsystemRes.rows.map(s => ({ id: s.id, code: s.code, name: s.name, system_code: s.systems.code }))
  const prevTagId = prevRow?.id ?? null
  const nextTagId = nextRow?.id ?? null

  // Consolidated photos across ITR + Punch + Preservation (D1c)
  const tagPhotos = await fetchConsolidatedTagPhotos(supabase, {
    tagId,
    projectId,
    itrIds: (tagItrs ?? []).map(i => ({ id: i.id, itr_number: i.itr_number })),
    punchIds: (tagPunches ?? []).map(p => ({ id: p.id, punch_number: p.punch_number })),
    planIds: (preservationPlans ?? []).map(p => p.id),
  })

  // P&ID signed URL + doc id
  let pidSignedUrl: string | null = null
  let pidDocId: string | null = null
  if (tag.pid_drawing) {
    // N2d: el plano es el documento P&ID del registro con ese número (revisión vigente).
    const pid = (await loadPidDrawings(supabase, projectId, [tag.pid_drawing])).get(normalizePidRef(tag.pid_drawing) ?? '')
    if (pid) {
      pidDocId = pid.documentId
      pidSignedUrl = pid.signedUrl
    }
  }

  // R2a: requisitos del tag (matriz aceptada + alcance + excepciones) y lo necesario para la cadena y «Agregar».
  const [reqRes, { data: phases }, { data: scopeDiscs }] = await Promise.all([
    supabase.rpc('tag_itr_requirements', { p_project_id: projectId, p_tag_ids: [tagId] }),
    supabase.from('project_phases').select('id, code').eq('org_id', membership.org_id).order('order_index'),
    // bounded: disciplinas del alcance (decenas)
    supabase.from('project_disciplines').select('discipline_id, disciplines(name)').eq('project_id', projectId),
  ])
  const discName = new Map((scopeDiscs ?? []).map(d => [d.discipline_id, (d.disciplines as unknown as { name: string } | null)?.name ?? '—']))
  const phaseCode = new Map((phases ?? []).map(p => [p.id, p.code]))
  const { data: scopeTpls } = discName.size
    ? await supabase.from('itr_templates').select('code, title, title_es').eq('org_id', membership.org_id).eq('is_active', true)
        .in('discipline_id', [...discName.keys()]).order('code').limit(1000)
    : { data: [] as { code: string; title: string; title_es: string | null }[] }
  const titleEs = new Map((scopeTpls ?? []).filter(x => x.title_es?.trim()).map(x => [x.code, x.title_es as string]))
  const tagReqs: TagReq[] = (reqRes.data ?? []).map(r => ({
    code: r.template_code, title: titleEs.get(r.template_code) ?? r.template_title, state: r.state as ReqState, origin: r.origin as ReqOrigin | null,
    itr_id: r.itr_id, phase: r.phase_id ? phaseCode.get(r.phase_id) ?? null : null, reason: r.reason,
    discipline: r.discipline_id ? discName.get(r.discipline_id) ?? '—' : '—',
  }))
  const scopeTemplates = [...new Map((scopeTpls ?? []).map(x => [x.code, { code: x.code, title: x.title_es?.trim() ? x.title_es : x.title }])).values()]

  // S14 (I-25): con representantes del cliente designados, la firma Cliente del ITR va solo a ellos.
  const { data: clientReps } = await supabase.from('project_capacities').select('user_id')
    .eq('project_id', projectId).eq('capacity', 'client_rep').is('revoked_at', null).limit(200)
  const clientRepIds = (clientReps ?? []).map(r => r.user_id)

  return (
    <>
    <RememberRecent kind="tag" code={tag.tag_number} title={tag.description} href={`/projects/${projectId}/tags/${tag.id}`} projectCode={project.code} />
    <TagDetail
      tag={tag}
      projectId={projectId}
      projectName={project.name}
      pidSignedUrl={pidSignedUrl}
      pidDocId={pidDocId}
      prevTagId={prevTagId}
      nextTagId={nextTagId}
      canEdit={canEdit}
      canMove={canMove}
      subsystemOptions={subsystemOptions}
      currentUserRole={membership.role}
      tagItrs={tagItrs ?? []}
      templates={templates ?? []}
      matrixTemplateIds={matrixTemplateIds}
      orgMembers={orgMembers ?? []}
      clientRepIds={clientRepIds}
      tagPunches={tagPunches ?? []}
      preservationPlans={preservationPlans ?? []}
      preservationProcedures={preservationProcedures ?? []}
      tagPhotos={tagPhotos}
      initialTab={initialTab}
      requirementsSlot={
        <TagRequirementsPanel
          projectId={projectId}
          tagId={tag.id}
          reqs={tagReqs}
          phaseCodes={(phases ?? []).map(p => p.code)}
          phaseIds={(phases ?? []).map(p => p.id)}
          scopeTemplates={scopeTemplates}
          canEdit={EDITOR_ROLES.includes(membership.role)}
          hasSubsystem={!!tag.subsystems?.id}
        />
      }
    />
    </>
  )
}
