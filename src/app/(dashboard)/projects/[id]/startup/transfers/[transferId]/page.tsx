import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { loadMyCapacities } from '@/lib/capacities/server'
import { signableCapacities, type OwnershipStage } from '@/lib/startup/catalog'
import TransferView from './TransferView'

// Detalle de un traspaso de propiedad del sistema (fase 6 plan readiness, sesión 3): checklist congelado,
// excepciones, dos firmas (Comisionamiento + Operaciones) y paquete de handover al llegar a Operaciones.
export default async function OwnershipTransferPage({ params }: { params: Promise<{ id: string; transferId: string }> }) {
  const { id, transferId } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()
  const { data: tr } = await supabase.from('ownership_transfers')
    .select('id, number, system_id, from_stage, to_stage, is_reversal, reason, status, checklist, exceptions, requested_by, requested_at, commissioning_signed_by, commissioning_signed_at, operations_signed_by, operations_signed_at, completed_at, cancelled_by, cancelled_at, cancel_reason, handover_package_id, content_hash, commissioning_ack, operations_ack, systems(code, name)')
    .eq('id', transferId).eq('project_id', id).maybeSingle()
  if (!tr) notFound()

  const [{ data: members }, { data: pkg }] = await Promise.all([
    supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId),
    tr.handover_package_id
      ? supabase.from('handover_packages').select('id, version, status, generated_at, signature_hash, zip_path, omitted_count').eq('id', tr.handover_package_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const names: Record<string, string> = {}
  for (const m of members ?? []) {
    const p = m.profiles
    if (p?.full_name) names[m.user_id] = p.full_name
  }
  const sys = tr.systems

  return (
    <TransferView
      project={project}
      transfer={{
        ...tr, system: sys ? `${sys.code}${sys.name !== sys.code ? ` — ${sys.name}` : ''}` : '—',
        from_stage: tr.from_stage as OwnershipStage, to_stage: tr.to_stage as OwnershipStage,
        checklist: (tr.checklist ?? []) as never, exceptions: (tr.exceptions ?? []) as never,
      }}
      pkg={pkg}
      names={names}
      canSign={tr.status === 'pending_signatures' ? signableCapacities(await loadMyCapacities(ctx.supabase, id), ctx.userId, tr) : []}
      canEdit={ctx.role !== 'client'}
    />
  )
}
