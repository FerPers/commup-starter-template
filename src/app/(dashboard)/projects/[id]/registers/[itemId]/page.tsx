import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import type { RegisterKind, RegisterStatus } from '@/lib/registers/catalog'
import RegisterDetailView, { type RegisterDetail, type RegisterEvent } from './RegisterDetailView'
import type { TagValue } from '../RegisterFields'

// Detalle de un registro controlado (fase 3): datos del catálogo, tags, ciclo de vida con
// «otra persona» y línea de tiempo.
export default async function RegisterDetailPage({ params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()

  const { data: item } = await supabase
    .from('register_items')
    .select(`id, number, kind, title, description, status, data, system_id, type_id,
      proposed_by, proposed_at, authorized_by, authorized_at, activated_by, activated_at,
      removed_by, removed_at, verified_by, verified_at, cancelled_by, cancelled_at, cancel_reason,
      register_types(blocks_gate_id, readiness_gates(code, name))`)
    .eq('id', itemId)
    .eq('project_id', id)
    .maybeSingle()
  if (!item) notFound()

  const [{ data: tags }, { data: events }, { data: systems }, { data: members }] = await Promise.all([
    supabase.from('register_item_tags').select('tag_id, role, tags(tag_number)').eq('item_id', itemId),
    supabase.from('register_events').select('id, action, from_status, to_status, user_id, comment, created_at').eq('item_id', itemId).order('created_at'),
    supabase.from('systems').select('id, code, name').eq('project_id', id).order('code'),
    supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId),
  ])

  const names: Record<string, string> = {}
  for (const m of members ?? []) {
    const p = m.profiles as { full_name: string | null } | null
    if (p?.full_name) names[m.user_id] = p.full_name
  }
  const type = item.register_types as unknown as { blocks_gate_id: string | null; readiness_gates: { code: string; name: string } | null } | null

  const detail: RegisterDetail = {
    id: item.id,
    number: item.number,
    kind: item.kind as RegisterKind,
    title: item.title,
    description: item.description,
    status: item.status as RegisterStatus,
    data: (item.data ?? {}) as Record<string, unknown>,
    system_id: item.system_id,
    blocksGate: type?.readiness_gates?.code ?? null,
    steps: {
      proposed: { by: item.proposed_by, at: item.proposed_at },
      authorized: { by: item.authorized_by, at: item.authorized_at },
      active: { by: item.activated_by, at: item.activated_at },
      removed: { by: item.removed_by, at: item.removed_at },
      verified: { by: item.verified_by, at: item.verified_at },
      cancelled: { by: item.cancelled_by, at: item.cancelled_at },
    },
    cancel_reason: item.cancel_reason,
  }

  return (
    <RegisterDetailView
      project={project}
      item={detail}
      tags={(tags ?? []).map(tg => ({
        tag_id: tg.tag_id,
        role: tg.role as TagValue['role'],
        tag_number: (tg.tags as { tag_number: string } | null)?.tag_number ?? '?',
      }))}
      events={(events ?? []) as RegisterEvent[]}
      systems={systems ?? []}
      names={names}
      userId={ctx.userId}
      role={ctx.role}
    />
  )
}
