import { getActiveMembership } from '@/lib/supabase/membership'
import RememberRecent from '@/components/layout/RememberRecent'
import { notFound, redirect } from 'next/navigation'
import type { Attachment } from '../../daily/daily-ui'
import {
  isVendorLead,
  type ActivityKind, type ActivityResult, type InterfaceStatus, type PackageStatus, type RecommendationStatus, type ReportKind,
} from '@/lib/vendors/catalog'
import { fetchAllRowsFlagged } from '@/lib/list/fetch-all'
import PackageView, { type PackageData } from './PackageView'
import { getTranslations } from 'next-intl/server'
import PartialNote from '@/components/ui/PartialNote'
import { todayIn } from '@/lib/time/zone'

// Paquete de vendor (fase 8, sesión 2): alcance, límites e interfaces, movilización (gate del sistema + checklist),
// FAT/SAT con hallazgos (punch o ACC), reportes, recomendaciones con MOC y desmovilización.
export default async function VendorPackagePage({ params }: { params: Promise<{ id: string; packageId: string }> }) {
  const { id, packageId } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name, timezone').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()
  const { data: pkg } = await supabase.from('vendor_packages')
    .select('*, vendor_package_systems(system_id), vendor_package_tags(tag_id)')
    .eq('id', packageId).eq('project_id', id).maybeSingle()
  if (!pkg) notFound()

  const systemIds = ((pkg.vendor_package_systems as unknown as { system_id: string }[] | null) ?? []).map(s => s.system_id)
  const [
    { data: companies }, { data: systems }, { data: gates }, { data: interfaces }, { data: checklist },
    { data: mob }, { data: demob }, { data: activities }, { data: reports }, { data: recs }, { data: members },
  ] = await Promise.all([
    supabase.from('companies').select('id, name, short_name, kind, is_active').eq('org_id', ctx.orgId).order('name'),
    supabase.from('systems').select('id, code, name').eq('project_id', id).order('code'),
    supabase.from('readiness_gates').select('id, code, name, order_index').eq('org_id', ctx.orgId).eq('is_active', true).order('order_index'),
    supabase.from('vendor_interfaces').select('id, counterpart_company_id, counterpart, description, responsible, status, updated_at').eq('package_id', packageId).order('created_at'),
    supabase.from('vendor_checklist').select('phase, item_key, done, note, checked_by, checked_at').eq('package_id', packageId),
    supabase.rpc('vendor_mobilization_status', { p_package_id: packageId }),
    supabase.rpc('vendor_demobilization_status', { p_package_id: packageId }),
    supabase.from('vendor_activities')
      .select('id, kind, title, planned_date, performed_on, location, result, notes, recorded_by, result_by, result_at, retest_of, vendor_findings(id, description, tag_id, category, created_at, tags(tag_number), punches(id, punch_number, status, tag_id), actions(id, number, status))')
      .eq('package_id', packageId).order('created_at'),
    supabase.from('vendor_reports').select('id, kind, report_date, headcount, hours, activities, issues, issued_by, issued_at').eq('package_id', packageId).order('report_date', { ascending: false }),
    supabase.from('vendor_recommendations').select('*').eq('package_id', packageId).order('seq'),
    supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId),
  ])

  // Tags elegibles: los de los sistemas del paquete (más los ya elegidos), para el alcance y los hallazgos.
  // S09 (F-07): PostgREST corta en 1000 filas aunque se pida .limit(3000); se pagina con .range().
  const { rows: tags, truncated: tagsTruncated } = systemIds.length
    ? await fetchAllRowsFlagged(() => supabase.from('tags').select('id, tag_number, subsystems!inner(system_id)')
      .eq('project_id', id).in('subsystems.system_id', systemIds).order('tag_number'))
    : { rows: [] as { id: string; tag_number: string }[], truncated: false }

  // S13 (F-34): documentos y equipos de prueba de la empresa del paquete, para los ítems del checklist.
  const [{ data: companyDocs }, { data: equipment }] = await Promise.all([
    supabase.from('documents').select('id, current:document_revisions!documents_current_revision_fkey(status)')
      .eq('project_id', id).eq('company_id', pkg.company_id).limit(1000),
    supabase.from('test_equipment').select('id, calibration_due').eq('org_id', ctx.orgId).eq('owner_company_id', pkg.company_id).eq('is_active', true).limit(1000),
  ])
  const today = todayIn(project.timezone)
  const docStatus = (companyDocs ?? []).map(d => (d.current as unknown as { status: string } | null)?.status ?? null)
  const hints: PackageData['hints'] = {
    docs: docStatus.length,
    docsCurrent: docStatus.filter(s => s === 'ifc' || s === 'as_built' || s === 'final').length,
    docsAsBuilt: docStatus.filter(s => s === 'as_built' || s === 'final').length,
    equipment: (equipment ?? []).length,
    equipmentValid: (equipment ?? []).filter(e => e.calibration_due >= today).length,
  }

  const entityIds = [...(activities ?? []).map(a => a.id), ...(reports ?? []).map(r => r.id)]
  const { data: attachments } = entityIds.length
    ? await supabase.from('mgmt_attachments').select('id, entity_id, file_name, file_path, mime_type, created_at, uploaded_by')
      .eq('project_id', id).in('entity_kind', ['vendor_report', 'vendor_activity']).in('entity_id', entityIds).order('created_at')
    : { data: [] }

  const names: Record<string, string> = {}
  for (const m of members ?? []) {
    const p = m.profiles as unknown as { full_name: string | null } | null
    if (p?.full_name) names[m.user_id] = p.full_name
  }
  const attachmentsBy: Record<string, Attachment[]> = {}
  for (const a of attachments ?? []) (attachmentsBy[a.entity_id] ??= []).push(a)

  const data: PackageData = {
    id: pkg.id, number: pkg.number, title: pkg.title, status: pkg.status as PackageStatus, companyId: pkg.company_id,
    scope: pkg.scope ?? '', boundaries: pkg.boundaries ?? '', mobSystemId: pkg.mob_system_id, mobGateId: pkg.mob_gate_id,
    plannedMobilization: pkg.planned_mobilization, mobilizedAt: pkg.mobilized_at, mobilizedBy: pkg.mobilized_by, mobilizationNote: pkg.mobilization_note,
    demobilizedAt: pkg.demobilized_at, demobilizedBy: pkg.demobilized_by, demobilizationNote: pkg.demobilization_note,
    cancelReason: pkg.cancel_reason, systemIds,
    tagIds: ((pkg.vendor_package_tags as unknown as { tag_id: string }[] | null) ?? []).map(t => t.tag_id),
    interfaces: (interfaces ?? []).map(i => ({ ...i, status: i.status as InterfaceStatus })),
    checklist: checklist ?? [],
    mobilization: (mob ?? null) as PackageData['mobilization'],
    demobilization: (demob ?? null) as PackageData['demobilization'],
    activities: (activities ?? []).map(a => ({
      id: a.id, kind: a.kind as ActivityKind, title: a.title, planned_date: a.planned_date, performed_on: a.performed_on, location: a.location,
      result: a.result as ActivityResult, notes: a.notes, result_by: a.result_by, result_at: a.result_at, retest_of: a.retest_of,
      findings: ((a.vendor_findings as unknown as {
        id: string; description: string; tag_id: string | null; category: string | null; created_at: string
        tags: { tag_number: string } | null; punches: { id: string; punch_number: string; status: string; tag_id: string | null } | null
        actions: { id: string; number: string; status: string } | null
      }[] | null) ?? []).sort((x, y) => x.created_at.localeCompare(y.created_at)),
      attachments: attachmentsBy[a.id] ?? [],
    })),
    reports: (reports ?? []).map(r => ({ ...r, kind: r.kind as ReportKind, hours: r.hours === null ? null : Number(r.hours), attachments: attachmentsBy[r.id] ?? [] })),
    recommendations: (recs ?? []).map(r => ({ ...r, status: r.status as RecommendationStatus })),
    hints,
  }

  const tl = await getTranslations('Common')
  return (
    <>
    <RememberRecent kind="vendor" code={pkg.number} title={pkg.title} href={`/projects/${id}/vendors/${pkg.id}`} projectCode={project.code} />
    {tagsTruncated && (
      <PartialNote>{tl('listPartial')}</PartialNote>
    )}
    <PackageView
      project={{ id: project.id, code: project.code, name: project.name }}
      pkg={data}
      companies={(companies ?? []).map(c => ({ id: c.id, name: c.short_name?.trim() ? c.short_name : c.name, active: c.is_active }))}
      systems={systems ?? []}
      gates={gates ?? []}
      tags={tags.map(t => ({ id: t.id, tag_number: t.tag_number }))}
      members={Object.entries(names).map(([mid, name]) => ({ id: mid, name })).sort((a, b) => a.name.localeCompare(b.name))}
      names={names}
      userId={ctx.userId}
      canLead={isVendorLead(ctx.role)}
      canEdit={ctx.role !== 'client'}
    />
    </>
  )
}
