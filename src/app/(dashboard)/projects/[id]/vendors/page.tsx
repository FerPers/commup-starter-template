import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { isVendorLead, type PackageStatus } from '@/lib/vendors/catalog'
import VendorsView, { type PackageRow } from './VendorsView'

// Paquetes de vendor del proyecto (fase 8, sesión 2; libro cap. 20): empresa, sistemas, estado de movilización,
// FAT/SAT pendientes, hallazgos abiertos y recomendaciones por decidir.
export default async function VendorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()

  const [{ data: packages }, { data: companies }, { data: systems }, { data: activities }, { data: recs }, { data: findings }] = await Promise.all([
    supabase.from('vendor_packages')
      .select('id, number, title, status, company_id, planned_mobilization, mobilized_at, demobilized_at, vendor_package_systems(system_id)')
      .eq('project_id', id).order('seq', { ascending: false }),
    supabase.from('companies').select('id, name, short_name, kind, is_active').eq('org_id', ctx.orgId).order('name'),
    supabase.from('systems').select('id, code, name').eq('project_id', id).order('code'),
    supabase.from('vendor_activities').select('package_id, result').eq('project_id', id),
    supabase.from('vendor_recommendations').select('package_id, status').eq('project_id', id),
    supabase.from('vendor_findings').select('package_id, punches(status), actions(status)').eq('project_id', id),
  ])

  const companyName = new Map((companies ?? []).map(c => [c.id, c.short_name?.trim() ? c.short_name : c.name]))
  const count = <T extends { package_id: string }>(rows: T[] | null, pred: (r: T) => boolean) =>
    (rows ?? []).reduce<Record<string, number>>((acc, r) => (pred(r) ? { ...acc, [r.package_id]: (acc[r.package_id] ?? 0) + 1 } : acc), {})
  const pendingTests = count(activities, a => a.result === 'pending')
  const failedTests = count(activities, a => a.result === 'failed')
  const toDecide = count(recs, r => r.status === 'proposed')
  const openFindings = count(findings, f => {
    const p = f.punches as unknown as { status: string } | null
    const a = f.actions as unknown as { status: string } | null
    return p ? ['open', 'in_progress'].includes(p.status) : a ? ['open', 'in_progress', 'done'].includes(a.status) : false
  })

  const rows: PackageRow[] = (packages ?? []).map(p => ({
    id: p.id, number: p.number, title: p.title, status: p.status as PackageStatus,
    company: companyName.get(p.company_id) ?? '—', plannedMobilization: p.planned_mobilization,
    systemIds: ((p.vendor_package_systems as unknown as { system_id: string }[] | null) ?? []).map(s => s.system_id),
    pendingTests: pendingTests[p.id] ?? 0, failedTests: failedTests[p.id] ?? 0, toDecide: toDecide[p.id] ?? 0, openFindings: openFindings[p.id] ?? 0,
  }))

  return (
    <VendorsView
      project={project}
      rows={rows}
      systems={systems ?? []}
      companies={(companies ?? []).filter(c => c.is_active).map(c => ({ id: c.id, name: c.short_name?.trim() ? c.short_name : c.name, kind: c.kind }))}
      canEdit={isVendorLead(ctx.role)}
    />
  )
}
