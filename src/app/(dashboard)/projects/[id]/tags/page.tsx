import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import TagsView from './TagsView'
import { fetchTagPage, fetchTagDisciplineCounts, TAG_SORT_KEYS } from '@/lib/list/tag-query'
import { LIST_PAGE_SIZE, parseDir, parsePage, parseSort } from '@/lib/list/params'

type Search = { page?: string; sort?: string; dir?: string; disc?: string; q?: string; subsystem?: string; status?: string }

export default async function TagsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Search>
}) {
  const { id } = await params
  const sp = await searchParams

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const canEdit = ['owner', 'admin', 'architect'].includes(ctx.role)

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
    const { data: pidDocs } = await supabase
      .from('pid_documents')
      .select('drawing_number, file_path')
      .eq('project_id', id)
      .in('drawing_number', drawings)
    const signed = await Promise.all(
      (pidDocs ?? []).map(async doc => {
        const { data } = await supabase.storage.from('pid-documents').createSignedUrl(doc.file_path, 3600)
        return [doc.drawing_number, data?.signedUrl] as const
      }),
    )
    for (const [num, url] of signed) if (url) pidUrlMap[num] = url
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
    <div style={{ padding: '32px' }}>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <a href={`/projects/${id}`} style={{
          fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none',
          display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '12px',
        }}>
          ← {project.name}
        </a>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.4px' }}>
              Tags / Equipos
            </h1>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
              {tagCount === 0 ? 'Sin tags importados' : `${tagCount} tags importados`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
            <a
              href={`/projects/${id}/pid-documents`}
              style={{
                padding: '9px 18px', background: 'var(--card-bg)', color: 'var(--text-muted)',
                borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                textDecoration: 'none', whiteSpace: 'nowrap',
                border: '1px solid var(--border)',
              }}
            >
              Documentos P&ID
            </a>
            {canEdit && (
              <a
                href={`/projects/${id}/import`}
                style={{
                  padding: '9px 18px', background: '#3b82f6', color: '#fff',
                  borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                  textDecoration: 'none', whiteSpace: 'nowrap',
                }}
              >
                + Importar tags
              </a>
            )}
          </div>
        </div>
      </div>

      {tagCount === 0 && !sp.q && !sp.disc && !sp.status ? (
        <div style={{
          background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)',
          padding: '64px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.3 }}>⊟</div>
          <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-muted)', margin: '0 0 6px' }}>
            Aún no hay tags importados
          </p>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 20px' }}>
            Carga tu lista de equipos desde Excel para comenzar.
          </p>
          {canEdit && (
            <a
              href={`/projects/${id}/import`}
              style={{
                display: 'inline-block', padding: '10px 22px',
                background: '#3b82f6', color: '#fff', borderRadius: '8px',
                fontSize: '13px', fontWeight: 500, textDecoration: 'none',
              }}
            >
              Importar lista de equipos
            </a>
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
