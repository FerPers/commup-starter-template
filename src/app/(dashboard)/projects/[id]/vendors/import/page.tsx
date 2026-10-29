import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { ADMIN_ROLES } from '@/lib/constants/roles'
import { isVendorLead } from '@/lib/vendors/catalog'
import ImportPackagesWizard from './ImportPackagesWizard'

// Paquetes de vendor desde la lista de equipos tipo paquete (decisión de Luis, 2026-10-29): líder en adelante.
export default async function ImportVendorPackagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  if (!isVendorLead(ctx.role)) redirect(`/projects/${id}/vendors`)
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()
  const { data: companies } = await supabase.from('companies').select('id, name, short_name, kind, is_active').eq('org_id', ctx.orgId).order('name')

  return (
    <ImportPackagesWizard
      project={project}
      companies={(companies ?? []).filter(c => c.is_active).map(c => ({ id: c.id, name: c.short_name?.trim() ? c.short_name : c.name, kind: c.kind }))}
      canCreateTbd={ADMIN_ROLES.includes(ctx.role)}
    />
  )
}
