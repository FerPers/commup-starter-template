import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import ExplorerTree from './ExplorerTree'
import type { ExplorerArea, ExplorerSubsystem, ExplorerSystem } from '@/types/database'
import Link from 'next/link'
import { fetchSubsystemRollup } from '@/lib/list/kpi-query'
import { fetchAllRowsFlagged } from '@/lib/list/fetch-all'
import { getTranslations } from 'next-intl/server'
import PartialNote from '@/components/ui/PartialNote'

export default async function ExplorerPage({ params }: { params: Promise<{ id: string }> }) {
  // N0 (H-13): título = etiqueta del menú.
  const tNav = await getTranslations('Sidebar.nav')
  const { id } = await params

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, code')
    .eq('id', id)
    .eq('org_id', membership.org_id)
    .single()

  if (!project) notFound()

  // Sprint E: rollup por subsistema en SQL (antes: todas las filas de tags/itrs/punches)
  // S09 (B-07): los subsistemas pueden pasar de 1000 (tope de PostgREST) → se paginan.
  const [{ data: areas }, { data: systems }, subsystemsRes, rollup] = await Promise.all([
    supabase.from('areas').select('id, code, name').eq('project_id', id).order('code'),
    supabase.from('systems').select('id, area_id, code, name').eq('project_id', id).order('code'),
    fetchAllRowsFlagged(() => supabase.from('subsystems').select('id, system_id, code, name').eq('project_id', id).order('code')),
    fetchSubsystemRollup(supabase, id),
  ])

  const subsystems = subsystemsRes.rows

  // Build tree
  const explorerData: ExplorerArea[] = (areas ?? []).map(area => {
    const areaSystems = (systems ?? []).filter(s => s.area_id === area.id)
    const explorerSystems: ExplorerSystem[] = areaSystems.map(sys => {
      const sysSubs = subsystems.filter(sub => sub.system_id === sys.id)
      const explorerSubs: ExplorerSubsystem[] = sysSubs.map(sub => ({
        id: sub.id,
        code: sub.code,
        name: sub.name,
        tag_count: rollup.get(sub.id)?.tag_count ?? 0,
        itr_total: rollup.get(sub.id)?.itr_total ?? 0,
        itr_approved: rollup.get(sub.id)?.itr_approved ?? 0,
        open_punches_a: rollup.get(sub.id)?.open_punches_a ?? 0,
      }))
      return { id: sys.id, code: sys.code, name: sys.name, subsystems: explorerSubs }
    })
    return { id: area.id, code: area.code, name: area.name, systems: explorerSystems }
  })

  const tl = await getTranslations('Common')
  return (
    <div style={{ padding: '32px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <Link
          href={`/projects/${id}`}
          style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '12px' }}
        >
          ← {project.name}
        </Link>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>
          {tNav('explorer')}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '4px 0 0' }}>
          Árbol jerárquico Área › Sistema › Subsistema
        </p>
      </div>

      {subsystemsRes.truncated && (
        <PartialNote>{tl('listPartial')}</PartialNote>
      )}

      <ExplorerTree explorerData={explorerData} projectId={id} />
    </div>
  )
}
