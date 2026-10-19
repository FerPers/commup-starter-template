import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import { ADMIN_ROLES, EDITOR_ROLES } from '@/lib/auth/permissions'
import type { CompanyKind } from '@/lib/documents/catalog'
import CompaniesAdmin, { type CompanyRow } from './CompaniesAdmin'

// Catálogo de empresas de la org (fase 8, sesión 1; doc §15.1): operadora/cliente, EPC, vendors y
// subcontratistas, con cuántos miembros, personas de operaciones y equipos de prueba tiene cada una.
export default async function AdminCompaniesPage() {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  if (!EDITOR_ROLES.includes(ctx.role)) redirect('/dashboard')

  const [{ data: companies }, { data: members }, { data: personnel }, { data: equipment }] = await Promise.all([
    ctx.supabase.from('companies').select('id, name, short_name, kind, tax_id, notes, is_active').eq('org_id', ctx.orgId).order('name'),
    ctx.supabase.from('org_members').select('company_id').eq('org_id', ctx.orgId).not('company_id', 'is', null),
    ctx.supabase.from('ops_personnel').select('company_id').eq('org_id', ctx.orgId).not('company_id', 'is', null).limit(10000),
    ctx.supabase.from('test_equipment').select('owner_company_id').eq('org_id', ctx.orgId).not('owner_company_id', 'is', null).limit(10000),
  ])
  const count = (ids: (string | null)[]) => ids.reduce<Record<string, number>>((acc, id) => (id ? { ...acc, [id]: (acc[id] ?? 0) + 1 } : acc), {})
  const m = count((members ?? []).map(x => x.company_id))
  const p = count((personnel ?? []).map(x => x.company_id))
  const e = count((equipment ?? []).map(x => x.owner_company_id))

  const rows: CompanyRow[] = (companies ?? []).map(c => ({
    id: c.id, name: c.name, shortName: c.short_name ?? '', kind: c.kind as CompanyKind, taxId: c.tax_id ?? '', notes: c.notes ?? '',
    isActive: c.is_active, members: m[c.id] ?? 0, personnel: p[c.id] ?? 0, equipment: e[c.id] ?? 0,
  }))
  return <CompaniesAdmin rows={rows} canEdit={ADMIN_ROLES.includes(ctx.role)} />
}
