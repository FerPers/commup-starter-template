import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import ExplorerTree from './ExplorerTree'
import type { ExplorerArea, ExplorerSubsystem, ExplorerSystem } from '@/types/database'
import Link from 'next/link'

export default async function ExplorerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/setup')

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, code')
    .eq('id', id)
    .eq('org_id', membership.org_id)
    .single()

  if (!project) notFound()

  const [
    { data: areas },
    { data: systems },
    { data: subsystems },
    { data: tags },
    { data: itrs },
    { data: punches },
  ] = await Promise.all([
    supabase.from('areas').select('id, code, name').eq('project_id', id).order('code'),
    supabase.from('systems').select('id, area_id, code, name').eq('project_id', id).order('code'),
    supabase.from('subsystems').select('id, system_id, code, name').eq('project_id', id).order('code'),
    supabase.from('tags').select('id, subsystem_id').eq('project_id', id),
    supabase.from('itrs').select('id, subsystem_id, status').eq('project_id', id),
    supabase
      .from('punches')
      .select('id, subsystem_id, category, status')
      .eq('project_id', id)
      .in('status', ['open', 'in_progress']),
  ])

  // Build lookup maps
  const tagsBySubsystem = new Map<string, number>()
  for (const t of tags ?? []) {
    tagsBySubsystem.set(t.subsystem_id, (tagsBySubsystem.get(t.subsystem_id) ?? 0) + 1)
  }

  const itrTotalBySubsystem = new Map<string, number>()
  const itrApprovedBySubsystem = new Map<string, number>()
  for (const itr of itrs ?? []) {
    itrTotalBySubsystem.set(itr.subsystem_id, (itrTotalBySubsystem.get(itr.subsystem_id) ?? 0) + 1)
    if (itr.status === 'approved') {
      itrApprovedBySubsystem.set(itr.subsystem_id, (itrApprovedBySubsystem.get(itr.subsystem_id) ?? 0) + 1)
    }
  }

  const punchABySubsystem = new Map<string, number>()
  for (const p of punches ?? []) {
    if (p.category === 'A') {
      punchABySubsystem.set(p.subsystem_id, (punchABySubsystem.get(p.subsystem_id) ?? 0) + 1)
    }
  }

  // Build tree
  const explorerData: ExplorerArea[] = (areas ?? []).map(area => {
    const areaSystems = (systems ?? []).filter(s => s.area_id === area.id)
    const explorerSystems: ExplorerSystem[] = areaSystems.map(sys => {
      const sysSubs = (subsystems ?? []).filter(sub => sub.system_id === sys.id)
      const explorerSubs: ExplorerSubsystem[] = sysSubs.map(sub => ({
        id: sub.id,
        code: sub.code,
        name: sub.name,
        tag_count: tagsBySubsystem.get(sub.id) ?? 0,
        itr_total: itrTotalBySubsystem.get(sub.id) ?? 0,
        itr_approved: itrApprovedBySubsystem.get(sub.id) ?? 0,
        open_punches_a: punchABySubsystem.get(sub.id) ?? 0,
      }))
      return { id: sys.id, code: sys.code, name: sys.name, subsystems: explorerSubs }
    })
    return { id: area.id, code: area.code, name: area.name, systems: explorerSystems }
  })

  return (
    <div style={{ padding: '32px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <Link
          href={`/projects/${id}`}
          style={{ fontSize: '13px', color: '#64748b', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '12px' }}
        >
          ← {project.name}
        </Link>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
          Explorador de Sistema
        </h1>
        <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0' }}>
          Árbol jerárquico Área › Sistema › Subsistema
        </p>
      </div>

      <ExplorerTree explorerData={explorerData} projectId={id} />
    </div>
  )
}
