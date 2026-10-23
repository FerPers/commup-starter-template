import { getTranslations } from 'next-intl/server'
import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import TagsView from './TagsView'
import ExplorerTree from './ExplorerTree'
import TwinView, { type Tag360 } from './TwinView'
import TagModeSwitch from './TagModeSwitch'
import PartialNote from '@/components/ui/PartialNote'
import { fetchAllRowsFlagged } from '@/lib/list/fetch-all'
import { fetchSubsystemRollup } from '@/lib/list/kpi-query'
import { parseTagView } from '@/lib/list/tag-view'
import { loadPidDrawings } from '@/lib/documents/pid'
import { normalizePidRef } from '@/lib/excel/normalize'
import type { ExplorerArea } from '@/types/database'
import { fetchTagPage, fetchTagDisciplineCounts, TAG_SORT_KEYS } from '@/lib/list/tag-query'
import { LIST_PAGE_SIZE, parseDir, parsePage, parseSort } from '@/lib/list/params'
import { ROLE_TIERS } from '@/lib/constants/roles'

type Search = { page?: string; sort?: string; dir?: string; disc?: string; q?: string; subsystem?: string; status?: string; view?: string; system?: string; tag?: string }

export default async function TagsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Search>
}) {
  // N0 (H-13): título = etiqueta del menú.
  const tNav = await getTranslations('Sidebar.nav')
  const { id } = await params
  const sp = await searchParams

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const canEdit = ROLE_TIERS.privileged.includes(ctx.role)
  // N2c («Maquetas N2»): «Tags y equipos» con modos Lista · Árbol (antes Explorador) · Tarjetas (antes Digital Twin).
  const view = parseTagView(sp.view)
  const t = await getTranslations('TagsHub')

  if (view !== 'list') {
    const { data: project } = await supabase.from('projects').select('id, name').eq('id', id).eq('org_id', ctx.orgId).maybeSingle()
    if (!project) notFound()
    const tl = await getTranslations('Common')
    const header = <TagsHeader projectId={id} title={tNav('tags')} subtitle={t(`subtitle.${view}`)} canEdit={canEdit} importLabel={t('import')} />
    if (view === 'tree') {
      // Sprint E: rollup por subsistema en SQL. S09 (B-07): los subsistemas pueden pasar de 1000 → se paginan.
      const [{ data: areas }, { data: systems }, subsystemsRes, rollup] = await Promise.all([
        // bounded: áreas del proyecto (decenas)
        supabase.from('areas').select('id, code, name').eq('project_id', id).order('code').limit(1000),
        // bounded: sistemas del proyecto (cientos)
        supabase.from('systems').select('id, area_id, code, name').eq('project_id', id).order('code').limit(5000),
        fetchAllRowsFlagged(() => supabase.from('subsystems').select('id, system_id, code, name').eq('project_id', id).order('code')),
        fetchSubsystemRollup(supabase, id),
      ])
      const subs = subsystemsRes.rows
      const tree: ExplorerArea[] = (areas ?? []).map(area => ({
        id: area.id, code: area.code, name: area.name,
        systems: (systems ?? []).filter(s => s.area_id === area.id).map(sys => ({
          id: sys.id, code: sys.code, name: sys.name,
          subsystems: subs.filter(sub => sub.system_id === sys.id).map(sub => ({
            id: sub.id, code: sub.code, name: sub.name,
            tag_count: rollup.get(sub.id)?.tag_count ?? 0,
            itr_total: rollup.get(sub.id)?.itr_total ?? 0,
            itr_approved: rollup.get(sub.id)?.itr_approved ?? 0,
            open_punches_a: rollup.get(sub.id)?.open_punches_a ?? 0,
          })),
        })),
      }))
      return (
        <div style={{ padding: 'clamp(12px, 4vw, 32px)' }}>
          {header}
          <TagModeSwitch view={view} />
          {subsystemsRes.truncated && <PartialNote>{tl('listPartial')}</PartialNote>}
          <ExplorerTree explorerData={tree} projectId={id} />
        </div>
      )
    }
    // Tarjetas: vista tag_360 del proyecto, filtrada en el servidor por sistema o subsistema si vienen en la URL.
    let tags: Tag360[] = []
    let truncated = false
    try {
      const res = await fetchAllRowsFlagged(() => {
        let q = supabase.from('tag_360').select('*').eq('project_id', id).eq('org_id', ctx.orgId)
        if (sp.subsystem) q = q.eq('subsystem_id', sp.subsystem)
        else if (sp.system) q = q.eq('system_id', sp.system)
        return q.order('tag_number')
      }, { key: 'tag_id' })
      tags = res.rows as Tag360[]
      truncated = res.truncated
    } catch (error) {
      console.error('tag_360 error:', error)
    }
    return (
      <div style={{ padding: 'clamp(12px, 4vw, 32px)' }}>
        {header}
        <TagModeSwitch view={view} />
        {truncated && <PartialNote>{tl('listPartial')}</PartialNote>}
        <TwinView projectId={id} tags={tags} />
      </div>
    )
  }

  // Sprint E: página/filtros en la URL; el servidor devuelve 50 filas + conteos por disciplina.
  const page = parsePage(sp.page)
  const sort = parseSort(sp.sort, TAG_SORT_KEYS, 'tag_number')
  const dir = parseDir(sp.dir, 'asc')
  const subsystem = (sp.subsystem ?? '').length > 0 ? sp.subsystem : undefined
  const filters = { disc: sp.disc, q: sp.q, subsystem, status: sp.status }

  const [{ data: project }, pageRes, disciplineCounts, subsystemRow] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', id).eq('org_id', ctx.orgId).single(),
    fetchTagPage(supabase, id, { filters, page, sort, dir }),
    fetchTagDisciplineCounts(supabase, id, subsystem),
    subsystem
      ? supabase.from('subsystems').select('id, name').eq('id', subsystem).eq('project_id', id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  if (!project) notFound()

  // Signed URLs solo para los planos referenciados en la página visible, en paralelo.
  const drawings = [...new Set(pageRes.rows.map(r => r.pid_drawing).filter((d): d is string => !!d))]
  const pidUrlMap: Record<string, string> = {}
  if (drawings.length > 0) {
    // N2d: planos = documentos P&ID del registro (PDF de la revisión vigente).
    const pids = await loadPidDrawings(supabase, id, drawings)
    for (const d of drawings) {
      const url = pids.get(normalizePidRef(d) ?? '')?.signedUrl
      if (url) pidUrlMap[d] = url
    }
  }

  const totalProjectTags = subsystem
    ? null
    : disciplineCounts.reduce((a, c) => a + c.n, 0)
  const tagCount = totalProjectTags ?? pageRes.total

  const tags = pageRes.rows.map(r => ({
    id: r.id,
    tag_number: r.tag_number,
    description: r.description,
    status: r.status,
    manufacturer: r.manufacturer,
    model: r.model,
    serial_number: r.serial_number,
    preservation_required: r.preservation_required,
    pid_drawing: r.pid_drawing,
    equipment_types: r.equipment_type_code ? { code: r.equipment_type_code, name: r.equipment_type_name ?? r.equipment_type_code } : null,
    disciplines: { id: r.discipline_id, code: r.discipline_code, name: r.discipline_name, color: r.discipline_color },
    subsystems: {
      id: r.subsystem_id,
      code: r.subsystem_code ?? '',
      name: r.subsystem_name ?? '',
      systems: {
        id: r.system_id ?? '',
        code: r.system_code ?? '',
        name: r.system_name ?? '',
        areas: { id: r.area_id ?? '', code: r.area_code ?? '', name: r.area_name ?? '' },
      },
    },
  }))

  return (
    <div style={{ padding: 'clamp(12px, 4vw, 32px)' }}>
      <TagsHeader projectId={id} title={tNav('tags')} subtitle={tagCount === 0 ? t('subtitle.empty') : t('subtitle.list', { count: tagCount })} canEdit={canEdit} importLabel={t('import')} />
      <TagModeSwitch view="list" />

      {tagCount === 0 && !sp.q && !sp.disc && !sp.status ? (
        <div style={{
          background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)',
          padding: '64px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.3 }}>⊟</div>
          <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-muted)', margin: '0 0 6px' }}>
            {t('empty.title')}
          </p>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 20px' }}>
            {t('empty.hint')}
          </p>
          {canEdit && (
            <Link
              href={`/projects/${id}/import`}
              style={{
                display: 'inline-block', padding: '10px 22px',
                background: '#3b82f6', color: '#fff', borderRadius: '8px',
                fontSize: '13px', fontWeight: 500, textDecoration: 'none',
              }}
            >
              {t('empty.import')}
            </Link>
          )}
        </div>
      ) : (
        <TagsView
          projectId={id}
          tags={tags}
          total={pageRes.total}
          page={page}
          pageSize={LIST_PAGE_SIZE}
          disciplineCounts={disciplineCounts}
          filters={{ disc: sp.disc ?? '', q: sp.q ?? '', subsystem: sp.subsystem ?? '' }}
          subsystemName={subsystemRow?.data?.name ?? null}
          canEdit={canEdit}
          pidUrlMap={pidUrlMap}
        />
      )}
    </div>
  )
}

function TagsHeader({ projectId, title, subtitle, canEdit, importLabel }: {
  projectId: string; title: string; subtitle: string; canEdit: boolean; importLabel: string
}) {
  const btn: React.CSSProperties = {
    padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none', whiteSpace: 'nowrap',
    minHeight: 40, display: 'inline-flex', alignItems: 'center',
  }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.4px' }}>{title}</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '4px 0 0' }}>{subtitle}</p>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {canEdit && <Link href={`/projects/${projectId}/import`} style={{ ...btn, background: '#3b82f6', color: '#fff' }}>{importLabel}</Link>}
      </div>
    </div>
  )
}
