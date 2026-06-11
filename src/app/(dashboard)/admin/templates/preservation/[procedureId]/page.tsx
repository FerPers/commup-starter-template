import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import ProcedureItemEditor from './ProcedureItemEditor'

export default async function ProcedureDetailPage({
  params,
}: {
  params: Promise<{ procedureId: string }>
}) {
  const { procedureId } = await params

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const canEdit = ['owner', 'admin', 'architect', 'leader'].includes(membership.role)

  const [{ data: procedure }, { data: disciplines }] = await Promise.all([
    supabase
      .from('preservation_procedures')
      .select(`
        id, code, title, description, frequency, interval_days,
        requires_photo, requires_signature,
        discipline_id,
        disciplines(id, code, name, color),
        preservation_procedure_items(
          id, order_index, label, item_type, unit, min_value, max_value,
          is_critical, is_required
        )
      `)
      .eq('id', procedureId)
      .eq('org_id', membership.org_id)
      .single(),
    supabase
      .from('disciplines')
      .select('id, code, name, color')
      .eq('org_id', membership.org_id)
      .order('code'),
  ])

  if (!procedure) notFound()

  // Sort items by order_index
  const sortedItems = (procedure.preservation_procedure_items ?? [])
    .slice()
    .sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index)

  return (
    <ProcedureItemEditor
      procedure={{ ...procedure, preservation_procedure_items: sortedItems }}
      disciplines={disciplines ?? []}
      canEdit={canEdit}
    />
  )
}
