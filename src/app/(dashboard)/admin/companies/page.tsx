import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import { denyAccess } from '@/lib/auth/denied'
import { ADMIN_ROLES, EDITOR_ROLES } from '@/lib/auth/permissions'
import type { CompanyKind } from '@/lib/documents/catalog'
import { fetchAllRowsFlagged } from '@/lib/list/fetch-all'
import CompaniesAdmin, { type CompanyRow } from './CompaniesAdmin'

// Catálogo de empresas de la org (fase 8, sesión 1; doc §15.1): operadora/cliente, EPC, vendors y
// subcontratistas, con cuántos miembros, personas de operaciones y equipos de prueba tiene cada una.
export default async function AdminCompaniesPage() {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  if (!EDITOR_ROLES.includes(ctx.role)) denyAccess('editor')

  // S09 (F-07): PostgREST corta en 1000 filas aunque se pida .limit(10000); para contar por empresa se pagina
  // con .range() (solo dos columnas por fila).
  const [{ data: companies }, { data: members }, { rows: personnel }, { rows: equipment }] = await Promise.all([
    ctx.supabase.from('companies').select('id, name, short_name, kind, tax_id, notes, is_active').eq('org_id', ctx.orgId).order('name'),
    ctx.supabase.from('org_members').select('company_id').eq('org_id', ctx.orgId).not('company_id', 'is', null),
    fetchAllRowsFlagged(() => ctx.supabase.from('ops_personnel').select('id, company_id').eq('org_id', ctx.orgId).not('company_id', 'is', null), { maxRows: 200_000 }),
    fetchAllRowsFlagged(() => ctx.supabase.from('test_equipment').select('id, owner_company_id').eq('org_id', ctx.orgId).not('owner_company_id', 'is', null), { maxRows: 200_000 }),
  ])
  const count = (ids: (string | null)[]) => {
    const acc: Record<string, number> = {}
    for (const id of ids) if (id) acc[id] = (acc[id] ?? 0) + 1
    return acc
  }
  const m = count((members ?? []).map(x => x.company_id))
  const p = count(personnel.map(x => x.company_id))
  const e = count(equipment.map(x => x.owner_company_id))

  const rows: CompanyRow[] = (companies ?? []).map(c => ({
    id: c.id, name: c.name, shortName: c.short_name ?? '', kind: c.kind as CompanyKind, taxId: c.tax_id ?? '', notes: c.notes ?? '',
    isActive: c.is_active, members: m[c.id] ?? 0, personnel: p[c.id] ?? 0, equipment: e[c.id] ?? 0,
  }))
  return <CompaniesAdmin rows={rows} canEdit={ADMIN_ROLES.includes(ctx.role)} />
}
