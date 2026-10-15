import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import type { RegisterKind, RegisterStatus } from '@/lib/registers/catalog'
import TestPacksView, { type PackRow } from './TestPacksView'

// Test packs del proyecto (fase 3, sesión 3): avance derivado por pack, línea y sistema,
// importación del line list y etiquetas QR. Decisiones §8.6–8.9 del plan readiness.
export default async function TestPacksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()

  await supabase.rpc('ensure_register_types', { p_org_id: ctx.orgId })
  const [{ data: packs }, { data: type }] = await Promise.all([
    supabase
      .from('register_items')
      .select(`id, number, title, status, data, systems(code),
        register_item_tags(role, tag_id, tags(tag_number, subsystems(systems(code)))),
        register_item_links!register_item_links_item_id_fkey(linked:register_items!register_item_links_linked_item_id_fkey(id, number, kind, status))`)
      .eq('project_id', id)
      .eq('kind', 'test_pack')
      .order('number')
      .limit(1000),
    supabase.from('register_types').select('is_active').eq('org_id', ctx.orgId).eq('kind', 'test_pack').maybeSingle(),
  ])

  type TagJoin = { role: string; tag_id: string; tags: { tag_number: string; subsystems: { systems: { code: string } | null } | null } | null }
  type LinkJoin = { linked: { id: string; number: string; kind: RegisterKind; status: RegisterStatus } | null }

  const rows: PackRow[] = (packs ?? []).map(p => {
    const tags = (p.register_item_tags as unknown as TagJoin[] | null) ?? []
    const links = (p.register_item_links as unknown as LinkJoin[] | null) ?? []
    const data = (p.data ?? {}) as Record<string, unknown>
    return {
      id: p.id,
      number: p.number,
      title: p.title,
      status: p.status as RegisterStatus,
      packRef: typeof data.pack_ref === 'string' ? data.pack_ref : null,
      testType: typeof data.test_type === 'string' ? data.test_type : null,
      system: (p.systems as { code: string } | null)?.code ?? null,
      lines: tags.filter(t => t.role === 'line').map(t => ({
        tag_id: t.tag_id,
        tag_number: t.tags?.tag_number ?? '?',
        system: t.tags?.subsystems?.systems?.code ?? null,
      })),
      blinds: links.map(l => l.linked).filter((l): l is NonNullable<LinkJoin['linked']> => !!l && l.kind === 'blind'),
    }
  })

  return (
    <TestPacksView
      project={project}
      packs={rows}
      canEdit={ctx.role !== 'client' && type?.is_active !== false}
    />
  )
}
