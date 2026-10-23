import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getActiveMembership } from '@/lib/supabase/membership'
import { ROLE_TIERS } from '@/lib/constants/roles'
import {
  REQ_FILTERS, REQ_PAGE_SIZE, parseReqParams, reqQuery,
  type ReqChip, type ReqPage, type ReqParams, type ReqSummary,
} from '@/lib/itr/requirements'
import { REQ_CHIP_STYLE as CHIP_STYLE } from '@/lib/itr/requirements-style'

// R2a (maquetas M, 2026-10-22): registro «Requisitos ITR». Qué ITR debe tener cada tag (matriz aceptada del tipo,
// alcance de disciplinas del proyecto y excepciones decididas por una persona) y en qué estado está cada uno. Todo
// en la URL: nodo del árbol (?area / ?system / ?subsystem), filtro, búsqueda y página.
export default async function RequirementsPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const { id } = await params
  const p = parseReqParams(await searchParams)
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()

  const [{ data: areas }, { data: systems }, { data: subsystems }, summaryRes, pageRes, t] = await Promise.all([
    // bounded: jerarquía de un proyecto (decenas a cientos)
    supabase.from('areas').select('id, code, name').eq('project_id', id).order('code').limit(500),
    // bounded: sistemas de un proyecto (tope 2000)
    supabase.from('systems').select('id, code, name, area_id').eq('project_id', id).order('code').limit(2000),
    // bounded: subsistemas de un proyecto (tope 5000)
    supabase.from('subsystems').select('id, code, name, system_id').eq('project_id', id).order('code').limit(5000),
    supabase.rpc('tag_requirements_summary', { p_project_id: id }),
    supabase.rpc('tag_requirements_page', {
      p_project_id: id, p_filter: p.filter,
      ...(p.area ? { p_area_id: p.area } : {}), ...(p.system ? { p_system_id: p.system } : {}),
      ...(p.subsystem ? { p_subsystem_id: p.subsystem } : {}), ...(p.q ? { p_q: p.q } : {}),
      p_limit: REQ_PAGE_SIZE, p_offset: (p.page - 1) * REQ_PAGE_SIZE,
    }),
    getTranslations('ItrRequirements'),
  ])
  if (summaryRes.error) throw new Error(summaryRes.error.message)
  if (pageRes.error) throw new Error(pageRes.error.message)
  const summary = summaryRes.data as unknown as ReqSummary
  const page = pageRes.data as unknown as ReqPage
  const canGenerate = ROLE_TIERS.editor.includes(ctx.role)
  const canMatrix = ROLE_TIERS.privileged.includes(ctx.role)

  // Árbol Área › Sistema › Subsistema con lo que falta por generar (de by_subsystem).
  const missingBySub = new Map(summary.by_subsystem.map(s => [s.subsystem_id, s.missing]))
  const subsBySystem = new Map<string, { id: string; code: string; name: string; missing: number }[]>()
  for (const s of subsystems ?? []) {
    const list = subsBySystem.get(s.system_id) ?? []
    list.push({ id: s.id, code: s.code, name: s.name, missing: missingBySub.get(s.id) ?? 0 })
    subsBySystem.set(s.system_id, list)
  }
  const sysMissing = (sid: string) => (subsBySystem.get(sid) ?? []).reduce((n, x) => n + x.missing, 0)
  const tree = (areas ?? []).map(a => {
    const syss = (systems ?? []).filter(s => s.area_id === a.id).map(s => ({ ...s, missing: sysMissing(s.id) }))
    return { ...a, systems: syss, missing: syss.reduce((n, s) => n + s.missing, 0) }
  })
  const openArea = p.area ?? (systems ?? []).find(s => s.id === p.system || subsBySystem.get(s.id)?.some(x => x.id === p.subsystem))?.area_id
  const openSystem = p.system ?? (subsystems ?? []).find(s => s.id === p.subsystem)?.system_id

  const base = `/projects/${id}/itrs/requirements`
  const href = (over: Partial<ReqParams>) => `${base}${reqQuery({ ...p, page: 1, ...over })}`
  const node = (over: Partial<ReqParams>) => href({ area: undefined, system: undefined, subsystem: undefined, ...over })
  const pages = Math.max(1, Math.ceil(page.total / REQ_PAGE_SIZE))
  const nodeLabel = p.subsystem ? (subsystems ?? []).find(s => s.id === p.subsystem)?.code
    : p.system ? (systems ?? []).find(s => s.id === p.system)?.code
      : p.area ? (areas ?? []).find(a => a.id === p.area)?.code : null

  const filterCount: Partial<Record<(typeof REQ_FILTERS)[number], number>> = {
    notype: summary.tags_no_type, norule: summary.tags_no_rule, excluded: summary.excluded, outside: summary.outside,
  }

  return (
    <div style={{ padding: 'clamp(12px, 4vw, 32px)', maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px' }}>
          <Link href={`/projects/${id}/itrs`} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textDecoration: 'none' }}>← {t('back')}</Link>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: '-0.5px', margin: '6px 0 0' }}>{t('title')}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{t('subtitle', { project: project.code })}</p>
        </div>
        <Link href={`/projects/${id}/scope`} style={btn('outline')}>{t('scope')}</Link>
        {/* R3: los tags sin tipo se clasifican por firma (gratis por prefijo/nombre, luego IA) en su propia página. */}
        {summary.tags_no_type > 0 && <Link href={`${base}/untyped`} style={btn('outline')}>{t('untyped', { count: summary.tags_no_type })}</Link>}
        {/* R2b: el Excel es el plan completo del nodo del árbol (los chips de filtro no aplican). */}
        <a href={`${base}/export${reqQuery({ area: p.area, system: p.system, subsystem: p.subsystem })}`} download
          title={t('exportHint', { node: nodeLabel ?? project.code })} style={btn('outline')}>{t('export')}</a>
        {canGenerate && summary.missing > 0 && (
          <Link href={`/projects/${id}/itrs/generate`} style={btn('primary')}>{t('generate', { count: summary.missing })}</Link>
        )}
      </div>

      {summary.proposed_rules > 0 && (
        <div role="status" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: 'var(--warning-50)', border: '1px solid var(--warning-200)', color: 'var(--warning-900)', fontSize: 'var(--text-sm)' }}>
          <strong>{t('proposed', { count: summary.proposed_rules })}</strong>
          <span>{t('proposedHint')}</span>
          {canMatrix && <Link href="/admin/templates/matrix" style={{ marginLeft: 'auto', fontWeight: 600, color: 'var(--warning-900)' }}>{t('proposedLink')}</Link>}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        {([['required', summary.required], ['generated', summary.generated], ['approved', summary.approved], ['missing', summary.missing], ['tagsNoType', summary.tags_no_type], ['excluded', summary.excluded]] as const).map(([k, n]) => (
          <div key={k} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>{t(`stat.${k}`)}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-strong)' }}>{n.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
        <nav aria-label={t('tree')} style={{ flex: '1 1 240px', maxWidth: 320, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 0', fontSize: 'var(--text-sm)' }}>
          <div style={{ padding: '4px 14px 8px', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: 'var(--text-muted)' }}>{t('treeHead')}</div>
          <TreeLink href={node({})} label={t('allProject')} count={summary.missing} depth={0} active={!p.area && !p.system && !p.subsystem} />
          {tree.map(a => (
            <div key={a.id}>
              <TreeLink href={node({ area: a.id })} label={`${a.code} · ${a.name}`} count={a.missing} depth={0} active={p.area === a.id} bold />
              {openArea === a.id && a.systems.map(s => (
                <div key={s.id}>
                  <TreeLink href={node({ system: s.id })} label={`${s.code} · ${s.name}`} count={s.missing} depth={1} active={p.system === s.id} />
                  {openSystem === s.id && (subsBySystem.get(s.id) ?? []).map(x => (
                    <TreeLink key={x.id} href={node({ subsystem: x.id })} label={`${x.code} · ${x.name}`} count={x.missing} depth={2} active={p.subsystem === x.id} />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </nav>

        <section style={{ flex: '999 1 560px', minWidth: 0, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            {REQ_FILTERS.map(f => {
              const on = p.filter === f
              const n = filterCount[f]
              return (
                <Link key={f} href={href({ filter: f })} aria-current={on ? 'true' : undefined} style={{
                  minHeight: 36, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 12px', borderRadius: 999, fontSize: 'var(--text-sm)', fontWeight: 600, textDecoration: 'none',
                  border: `1px solid ${on ? 'var(--text-strong)' : 'var(--border)'}`, background: on ? 'var(--text-strong)' : 'var(--card-bg)', color: on ? 'var(--card-bg)' : 'var(--text-strong)',
                }}>{t(`filter.${f}`)}{n != null && n > 0 && <span style={{ fontWeight: 500, opacity: 0.8 }}>{n}</span>}</Link>
              )
            })}
            <form action={base} style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {p.filter !== 'all' && <input type="hidden" name="filter" value={p.filter} />}
              {p.area && <input type="hidden" name="area" value={p.area} />}
              {p.system && <input type="hidden" name="system" value={p.system} />}
              {p.subsystem && <input type="hidden" name="subsystem" value={p.subsystem} />}
              <label htmlFor="req-q" className="sr-only" style={{ position: 'absolute', left: -9999 }}>{t('search')}</label>
              <input id="req-q" name="q" defaultValue={p.q ?? ''} placeholder={t('search')}
                style={{ height: 36, width: 180, border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', fontSize: 'var(--text-sm)', background: 'var(--card-bg)', color: 'var(--text-strong)' }} />
            </form>
          </div>

          <Legend t={t} />

          {page.rows.length === 0 ? (
            <p style={{ margin: 0, padding: '24px 16px', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>{t('empty')}</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                    <th style={{ padding: '8px 14px', fontWeight: 600, width: 150 }}>{t('col.tag')}</th>
                    <th style={{ padding: 8, fontWeight: 600, width: 64 }}>{t('col.type')}</th>
                    <th style={{ padding: 8, fontWeight: 600, width: 200 }}>{t('col.description')}</th>
                    <th style={{ padding: 8, fontWeight: 600 }}>{t('col.requirements')}</th>
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map(r => (
                    <tr key={r.tag_id} style={{ borderTop: '1px solid var(--border)', verticalAlign: 'top' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <Link href={`/projects/${id}/tags/${r.tag_id}?tab=itrs`} style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: 'var(--primary-600)', textDecoration: 'none' }}>{r.tag_number}</Link>
                      </td>
                      <td style={{ padding: '10px 8px', fontFamily: 'ui-monospace, monospace' }}>{r.type_code ?? '—'}</td>
                      <td style={{ padding: '10px 8px', color: 'var(--text-muted)' }}>{r.description}</td>
                      <td style={{ padding: 8 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                          {r.reqs.map(c => <Chip key={c.code} c={c} t={t} />)}
                          {!r.has_type && <Link href={`/projects/${id}/tags/${r.tag_id}`} style={noteStyle}>{t('note.noType')}</Link>}
                          {r.has_type && r.reqs.length === 0 && (canMatrix
                            ? <Link href="/admin/templates/matrix" style={noteStyle}>{t('note.noRule')}</Link>
                            : <span style={noteStyle}>{t('note.noRule')}</span>)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: '1px solid var(--border)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            <span>{t('pageInfo', { shown: page.rows.length, total: page.total, node: nodeLabel ?? project.code })}</span>
            <span style={{ flex: 1 }} />
            {p.page > 1 && <Link href={href({ page: p.page - 1 })} style={pagerStyle}>‹ {t('prev')}</Link>}
            <span>{t('pageOf', { page: p.page, pages })}</span>
            {p.page < pages && <Link href={href({ page: p.page + 1 })} style={pagerStyle}>{t('next')} ›</Link>}
          </div>
        </section>
      </div>
    </div>
  )
}

type T = Awaited<ReturnType<typeof getTranslations<'ItrRequirements'>>>

function Chip({ c, t }: { c: ReqChip; t: T }) {
  const origin = c.origin && c.origin !== 'matrix' ? ` · ${t(`origin.${c.origin}`)}` : ''
  const title = [`${c.code}${c.title ? ` — ${c.title}` : ''}`, c.client_code ? t('clientCode', { code: c.client_code }) : null, c.phase ? t('phase', { phase: c.phase }) : null,
    t(`state.${c.state}`), c.origin ? t(`origin.${c.origin}`) : null, c.reason].filter(Boolean).join(' · ')
  return (
    <span title={title} style={{ ...CHIP_STYLE[c.state], padding: '2px 7px', borderRadius: 5, fontSize: 12, fontWeight: 600, fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap' }}>
      {c.code}{origin}
    </span>
  )
}

function Legend({ t }: { t: T }) {
  return (
    <ul aria-label={t('legend')} style={{ display: 'flex', flexWrap: 'wrap', gap: 14, listStyle: 'none', margin: 0, padding: '8px 14px', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
      {(['missing', 'generated', 'in_progress', 'approved', 'excluded', 'outside'] as const).map(s => (
        <li key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden="true" style={{ ...CHIP_STYLE[s], padding: '1px 6px', borderRadius: 5, fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>E22B</span>{t(`state.${s}`)}
        </li>
      ))}
    </ul>
  )
}

function TreeLink({ href, label, count, depth, active, bold }: { href: string; label: string; count: number; depth: number; active: boolean; bold?: boolean }) {
  return (
    <Link href={href} aria-current={active ? 'true' : undefined} style={{
      display: 'flex', alignItems: 'center', gap: 8, minHeight: 36, padding: `0 14px 0 ${14 + depth * 16}px`, textDecoration: 'none', color: 'var(--text-strong)',
      fontWeight: bold ? 600 : 400, background: active ? 'var(--primary-50)' : undefined, boxShadow: active ? 'inset 3px 0 0 var(--primary-600)' : undefined,
    }}>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: count > 0 ? 'var(--warning-800)' : 'var(--success-700)' }}>{count}</span>
    </Link>
  )
}

function btn(kind: 'primary' | 'outline'): React.CSSProperties {
  return {
    minHeight: 40, display: 'inline-flex', alignItems: 'center', padding: '0 14px', borderRadius: 8, fontSize: 'var(--text-sm)', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
    ...(kind === 'primary'
      ? { background: 'var(--primary-600)', color: '#ffffff', border: '1px solid var(--primary-600)' }
      : { background: 'var(--card-bg)', color: 'var(--text-strong)', border: '1px solid var(--border)' }),
  }
}

const noteStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--warning-800)' }
const pagerStyle: React.CSSProperties = { minHeight: 32, display: 'inline-flex', alignItems: 'center', padding: '0 10px', border: '1px solid var(--border)', borderRadius: 6, textDecoration: 'none', color: 'var(--text-strong)' }
