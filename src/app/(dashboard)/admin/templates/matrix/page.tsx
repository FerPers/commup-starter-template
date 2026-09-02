import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { isAiConfigured } from '@/lib/ai/claude'
import { listMatrix } from '@/app/actions/itr-matrix'
import MatrixView from './MatrixView'

export default async function MatrixPage() {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  if (!EDITOR_ROLES.includes(ctx.role)) redirect('/admin/templates')
  const supabase = ctx.supabase

  const [{ data: equipmentTypes }, { data: templates }, { data: phases }, matrix] = await Promise.all([
    supabase
      .from('equipment_types')
      .select('id, code, name, category')
      .eq('org_id', ctx.orgId)
      .order('category')
      .order('code'),
    supabase
      .from('itr_templates')
      .select('id, code, title, disciplines(code), project_phases(code, order_index)')
      .eq('org_id', ctx.orgId)
      .eq('is_active', true)
      .order('code'),
    supabase
      .from('project_phases')
      .select('code, name, order_index')
      .eq('org_id', ctx.orgId)
      .order('order_index'),
    listMatrix(),
  ])

  type RawTpl = { id: string; code: string; title: string; disciplines: { code: string } | null; project_phases: { code: string; order_index: number } | null }
  const templateOptions = ((templates ?? []) as unknown as RawTpl[]).map(t => ({
    id: t.id,
    code: t.code,
    title: t.title,
    discipline_code: t.disciplines?.code ?? null,
    phase_code: t.project_phases?.code ?? null,
  }))

  return (
    <MatrixView
      equipmentTypes={equipmentTypes ?? []}
      templates={templateOptions}
      phases={phases ?? []}
      initialRows={matrix.rows ?? []}
      loadError={matrix.error ?? null}
      aiEnabled={isAiConfigured()}
    />
  )
}
