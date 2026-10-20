import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { CAPACITY_ADMIN_ROLES } from '@/lib/constants/capacities'
import SignatoriesView, { type Designation, type MemberOption } from './SignatoriesView'

const companyLabel = (c: { name: string; short_name: string | null } | null) => (c ? (c.short_name?.trim() ? c.short_name : c.name) : null)

// Firmantes designados del proyecto (S14, D14): quién firma como Comisionamiento, Operaciones, HSE y Cliente.
// Todos los miembros lo ven; solo owner/admin designan o revocan.
export default async function SignatoriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()

  const [{ data: rows }, { data: members, error: membersError }, { data: companies }] = await Promise.all([
    supabase.from('project_capacities')
      .select('id, user_id, capacity, company_id, note, assigned_by, assigned_at, revoked_by, revoked_at, revoke_reason')
      .eq('project_id', id).order('assigned_at', { ascending: false }).limit(500),
    supabase.from('org_members').select('user_id, role, company_id, profiles(full_name)').eq('org_id', ctx.orgId).limit(1000),
    supabase.from('companies').select('id, name, short_name, kind').eq('org_id', ctx.orgId).limit(1000),
  ])
  if (membersError) throw new Error(membersError.message)
  const companyById = new Map((companies ?? []).map(c => [c.id, c]))

  const memberOptions: MemberOption[] = (members ?? []).map(m => {
    const p = m.profiles as unknown as { full_name: string | null } | null
    const c = m.company_id ? companyById.get(m.company_id) ?? null : null
    return {
      userId: m.user_id, role: m.role, name: p?.full_name?.trim() ? p.full_name : m.user_id,
      company: companyLabel(c), companyKind: c?.kind ?? null,
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
  const names = Object.fromEntries(memberOptions.map(m => [m.userId, m.name]))

  const designations: Designation[] = (rows ?? []).map(r => {
    const c = r.company_id ? companyById.get(r.company_id) ?? null : null
    return {
      id: r.id, userId: r.user_id, capacity: r.capacity, company: companyLabel(c), note: r.note,
      assignedBy: r.assigned_by, assignedAt: r.assigned_at, revokedBy: r.revoked_by, revokedAt: r.revoked_at, revokeReason: r.revoke_reason,
      // Una designación de alguien que ya no es miembro no cuenta (SQL capacity_designated hace el mismo join).
      member: memberOptions.some(m => m.userId === r.user_id),
    }
  })

  return (
    <SignatoriesView
      project={project}
      designations={designations}
      members={memberOptions}
      names={names}
      canEdit={CAPACITY_ADMIN_ROLES.includes(ctx.role)}
    />
  )
}
