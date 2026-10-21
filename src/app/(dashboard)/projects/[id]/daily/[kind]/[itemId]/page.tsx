import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { MGMT_KINDS, type MgmtKind } from '@/lib/daily/catalog'
import { loadOptions } from '../../options'
import type { Attachment, MgmtEvent } from '../../daily-ui'
import ActionDetail from './ActionDetail'
import ConstraintDetail from './ConstraintDetail'
import TqDetail from './TqDetail'
import DecisionDetail from './DecisionDetail'
import type { LinkedAction, LinkedDecision } from './linked'

// Detalle de una entidad de gestión diaria (fase 5): datos editables, ciclo de vida, evidencia,
// registros vinculados y línea de tiempo común (mgmt_events).
export default async function DailyDetailPage({ params }: { params: Promise<{ id: string; kind: string; itemId: string }> }) {
  const { id, kind: rawKind, itemId } = await params
  if (!MGMT_KINDS.includes(rawKind as MgmtKind)) notFound()
  const kind = rawKind as MgmtKind
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()

  const [{ data: events }, { data: attachments }, opts] = await Promise.all([
    supabase.from('mgmt_events').select('id, action, from_value, to_value, user_id, comment, created_at')
      .eq('entity_kind', kind).eq('entity_id', itemId).eq('project_id', id).order('created_at'),
    supabase.from('mgmt_attachments').select('id, file_name, file_path, mime_type, created_at, uploaded_by')
      .eq('entity_kind', kind).eq('entity_id', itemId).eq('project_id', id).order('created_at'),
    loadOptions(supabase, ctx.orgId, id),
  ])
  const { names, ...options } = opts
  const common = {
    project, opts: options, names, userId: ctx.userId, role: ctx.role,
    events: (events ?? []) as MgmtEvent[], attachments: (attachments ?? []) as Attachment[],
  }

  // Acciones y decisiones que nacen de una restricción o un TQ.
  async function linked(source: 'constraint' | 'tq') {
    const [{ data: acts }, { data: decs }] = await Promise.all([
      supabase.from('actions').select('id, number, title, status, owner_id, due_date').eq('project_id', id)
        .eq('source_kind', source).eq('source_id', itemId).order('seq'),
      supabase.from('decisions').select('id, number, title, status, decided_at').eq('project_id', id)
        .eq('source_kind', source).eq('source_id', itemId).order('seq'),
    ])
    return { actions: (acts ?? []) as LinkedAction[], decisions: (decs ?? []) as LinkedDecision[] }
  }

  if (kind === 'action') {
    const { data: item } = await supabase.from('actions').select('*').eq('id', itemId).eq('project_id', id).maybeSingle()
    if (!item) notFound()
    // Origen navegable: restricción / TQ (detalle propio) o ítem PSSR (revisión del sistema).
    let origin: { label: string; href: string | null } | null = null
    if (item.source_id && item.source_kind === 'constraint') {
      const { data } = await supabase.from('project_constraints').select('number, title').eq('id', item.source_id).maybeSingle()
      if (data) origin = { label: `${data.number} — ${data.title}`, href: `/projects/${id}/daily/constraint/${item.source_id}` }
    } else if (item.source_id && item.source_kind === 'tq') {
      const { data } = await supabase.from('technical_queries').select('number, subject').eq('id', item.source_id).maybeSingle()
      if (data) origin = { label: `${data.number} — ${data.subject}`, href: `/projects/${id}/daily/tq/${item.source_id}` }
    } else if (item.source_id && item.source_kind === 'pssr') {
      const { data } = await supabase.from('pssr_review_items').select('element, status, review_id, pssr_reviews(review_number)').eq('id', item.source_id).maybeSingle()
      const review = data?.pssr_reviews as { review_number: string } | null
      if (data) origin = { label: `${review?.review_number ?? 'PSSR'} — ${data.element} (${data.status.toUpperCase()})`, href: `/projects/${id}/pssr/${data.review_id}` }
    } else if (item.source_id && item.source_kind === 'gate') {
      // S23 (D-12): condición de un gate aprobado con condiciones → la ficha del sistema.
      const { data } = await supabase.from('system_gate_approvals').select('system_id, systems(code), readiness_gates(code)').eq('id', item.source_id).maybeSingle()
      const sys = data?.systems as { code: string } | null
      const gate = data?.readiness_gates as { code: string } | null
      if (data) origin = { label: `${sys?.code ?? ''} · ${gate?.code ?? ''}`, href: `/control-tower/${data.system_id}` }
    }
    return <ActionDetail {...common} item={item} origin={origin} />
  }

  if (kind === 'constraint') {
    const { data: item } = await supabase.from('project_constraints').select('*').eq('id', itemId).eq('project_id', id).maybeSingle()
    if (!item) notFound()
    return <ConstraintDetail {...common} item={item} linked={await linked('constraint')} />
  }

  if (kind === 'tq') {
    const [{ data: item }, { data: tags }] = await Promise.all([
      supabase.from('technical_queries').select('*').eq('id', itemId).eq('project_id', id).maybeSingle(),
      supabase.from('technical_query_tags').select('tag_id, tags(tag_number)').eq('tq_id', itemId),
    ])
    if (!item) notFound()
    const tagValues = (tags ?? []).map(tg => ({
      tag_id: tg.tag_id, role: 'subject' as const, tag_number: (tg.tags as { tag_number: string } | null)?.tag_number ?? '?',
    }))
    return <TqDetail {...common} item={item} tags={tagValues} linked={await linked('tq')} />
  }

  const { data: item } = await supabase.from('decisions').select('*').eq('id', itemId).eq('project_id', id).maybeSingle()
  if (!item) notFound()
  const [{ data: replacedBy }, { data: replaces }] = await Promise.all([
    item.superseded_by
      ? supabase.from('decisions').select('id, number, title, status, decided_at').eq('id', item.superseded_by).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('decisions').select('id, number, title, status, decided_at').eq('superseded_by', itemId).eq('project_id', id).maybeSingle(),
  ])
  let origin: { label: string; href: string } | null = null
  if (item.source_id && (item.source_kind === 'tq' || item.source_kind === 'constraint')) {
    const { data } = item.source_kind === 'tq'
      ? await supabase.from('technical_queries').select('number, title:subject').eq('id', item.source_id).maybeSingle()
      : await supabase.from('project_constraints').select('number, title').eq('id', item.source_id).maybeSingle()
    if (data) origin = { label: `${data.number} — ${data.title}`, href: `/projects/${id}/daily/${item.source_kind}/${item.source_id}` }
  }
  return (
    <DecisionDetail {...common} item={item} origin={origin}
      replacedBy={(replacedBy as LinkedDecision | null) ?? null} replaces={(replaces as LinkedDecision | null) ?? null} />
  )
}
