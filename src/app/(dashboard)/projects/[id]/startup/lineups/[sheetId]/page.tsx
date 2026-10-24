import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import type { ValvePosition } from '@/lib/startup/catalog'
import LineupView from './LineupView'

// Hoja de line-up (fase 6, sesión 1): edición de filas en borrador y ejecución en campo (posición
// encontrada → verificación independiente de las críticas). Muestra los registros F3 activos del sistema.
export default async function LineupPage({ params }: { params: Promise<{ id: string; sheetId: string }> }) {
  const { id, sheetId } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()
  const { data: sheet } = await supabase.from('lineup_sheets').select('*, systems(code, name), procedures(id, number, title)').eq('id', sheetId).eq('project_id', id).maybeSingle()
  if (!sheet) notFound()

  const [{ data: items }, { data: members }, { data: subs }, { data: stale }] = await Promise.all([
    supabase.from('lineup_items')
      .select('id, ord, tag_id, label, required_position, required_note, is_critical, found_position, as_found_position, lock_number, seal_number, remarks, set_by, set_at, verified_by, verified_at, tags(tag_number, description, pid_drawing)')
      .eq('sheet_id', sheetId).order('ord'),
    supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId),
    supabase.from('subsystems').select('id').eq('system_id', sheet.system_id),
    sheet.status === 'verified' ? supabase.rpc('lineup_is_stale', { p_sheet_id: sheetId }) : Promise.resolve({ data: false }),
  ])
  // Registros F3 en campo del sistema (por system_id o por tags de sus subsistemas).
  const subIds = (subs ?? []).map(s => s.id)
  const [{ data: bySystem }, { data: byTag }] = await Promise.all([
    supabase.from('register_items').select('id, number, kind, status, title').eq('system_id', sheet.system_id).in('status', ['active', 'removed']),
    subIds.length
      ? supabase.from('register_item_tags').select('register_items!inner(id, number, kind, status, title), tags!inner(subsystem_id)')
          .in('tags.subsystem_id', subIds).in('register_items.status', ['active', 'removed']).limit(500)
      : Promise.resolve({ data: [] }),
  ])
  type Reg = { id: string; number: string; kind: string; status: string; title: string }
  const regs = new Map<string, Reg>()
  for (const r of (bySystem ?? []) as Reg[]) regs.set(r.id, r)
  for (const r of (byTag ?? [])) regs.set(r.register_items.id, r.register_items)

  const names: Record<string, string> = {}
  for (const m of members ?? []) {
    const p = m.profiles
    if (p?.full_name) names[m.user_id] = p.full_name
  }
  const sys = sheet.systems
  const proc = sheet.procedures

  return (
    <LineupView
      project={project}
      sheet={{
        id: sheet.id, number: sheet.number, title: sheet.title, purpose: sheet.purpose, status: sheet.status,
        system: sys ? `${sys.code} — ${sys.name}` : '—', procedure: proc, verifiedBy: sheet.verified_by, verifiedAt: sheet.verified_at,
        issuedAt: sheet.issued_at, hash: sheet.content_hash, stale: !!stale, createdBy: sheet.created_by,
      }}
      items={(items ?? []).map(i => {
        const tag = i.tags
        return {
          id: i.id, ord: i.ord, tag_id: i.tag_id, tag_number: tag?.tag_number ?? null, description: tag?.description ?? null, label: i.label ?? '',
          required_position: i.required_position as ValvePosition | null, required_note: i.required_note ?? '', is_critical: i.is_critical,
          found_position: i.found_position as ValvePosition | null, remarks: i.remarks, set_by: i.set_by, set_at: i.set_at, verified_by: i.verified_by, verified_at: i.verified_at,
          as_found_position: i.as_found_position as ValvePosition | null, lock_number: i.lock_number, seal_number: i.seal_number, pid: tag?.pid_drawing ?? null,
        }
      })}
      registers={[...regs.values()].sort((a, b) => a.number.localeCompare(b.number))}
      names={names}
      userId={ctx.userId}
      role={ctx.role}
    />
  )
}
