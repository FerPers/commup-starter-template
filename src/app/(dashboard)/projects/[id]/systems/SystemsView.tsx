'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { SYSTEM_TYPES, enablingSystemIds, type DependencyKind, type SystemType } from '@/lib/systems/dependencies'
import { KIND_LETTER, TypeChip } from './system-ui'

// El modal trae xlsx (pesado): solo se descarga al abrirlo.
const ImportSystemsModal = dynamic(() => import('./ImportSystemsModal'), { ssr: false })
const AiSuggestionsModal = dynamic(() => import('./AiSuggestionsModal'), { ssr: false })

export type SystemListItem = {
  id: string
  code: string
  name: string
  area: string
  areaName: string
  system_type: SystemType | null
  priority: number | null
  frozen: boolean
  subsystems: number
}

export type DependencyEdge = {
  id: string
  system_id: string
  depends_on_system_id: string
  kind: DependencyKind
  required: string
  blocked: string
}

type Props = {
  project: { id: string; code: string; name: string }
  systems: SystemListItem[]
  edges: DependencyEdge[]
  canEdit: boolean
}

const card: React.CSSProperties = { background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12 }
const small: React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }
const th: React.CSSProperties = {
  textAlign: 'left', padding: '10px 12px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border)', background: 'var(--gray-50)', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-sm)', verticalAlign: 'top' }
const tab = (active: boolean): React.CSSProperties => ({
  padding: '7px 14px', borderRadius: 8, fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer',
  border: '1px solid var(--border)', background: active ? 'var(--primary-500)' : 'var(--card-bg)', color: active ? '#fff' : 'var(--text-strong)',
})

export default function SystemsView({ project, systems, edges, canEdit }: Props) {
  const t = useTranslations('Systems')
  const [view, setView] = useState<'list' | 'matrix'>('list')
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'' | SystemType | 'none'>('')
  const [importing, setImporting] = useState(false)
  const [suggesting, setSuggesting] = useState(false)

  const byId = useMemo(() => new Map(systems.map(s => [s.id, s])), [systems])
  const enabling = useMemo(() => enablingSystemIds(edges), [edges])
  const providersOf = useMemo(() => {
    const m = new Map<string, DependencyEdge[]>()
    for (const e of edges) m.set(e.system_id, [...(m.get(e.system_id) ?? []), e])
    return m
  }, [edges])
  const dependentsCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of edges) m.set(e.depends_on_system_id, (m.get(e.depends_on_system_id) ?? 0) + 1)
    return m
  }, [edges])

  const q = query.trim().toLowerCase()
  const filtered = systems.filter(s =>
    (!q || s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.area.toLowerCase().includes(q)) &&
    (!typeFilter || (typeFilter === 'none' ? !s.system_type : s.system_type === typeFilter)),
  )

  const typed = systems.filter(s => s.system_type).length
  const frozen = systems.filter(s => s.frozen).length

  return (
    <div style={{ padding: 32, maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <Link href={`/projects/${project.id}`} style={{ ...small, textDecoration: 'none', color: 'var(--primary-600, #2563eb)', fontWeight: 500 }}>← {project.code} · {project.name}</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('title')}</h1>
            <p style={{ ...small, margin: '4px 0 0' }}>{t('subtitle')}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href={`/control-tower?projectId=${project.id}`} style={{ ...tab(false), textDecoration: 'none' }}>{t('openControlTower')}</Link>
            {canEdit && systems.length > 0 && <button type="button" style={tab(false)} onClick={() => setSuggesting(true)}>✨ {t('ai.button')}</button>}
            {canEdit && <button type="button" style={tab(true)} onClick={() => setImporting(true)}>{t('import.button')}</button>}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {[
          { label: t('kpi.systems'), value: systems.length },
          { label: t('kpi.typed'), value: `${typed}/${systems.length}` },
          { label: t('kpi.dependencies'), value: edges.length },
          { label: t('kpi.enabling'), value: enabling.size },
          { label: t('kpi.frozen'), value: `${frozen}/${systems.length}` },
        ].map(k => (
          <div key={k.label} style={{ ...card, padding: 16 }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)', marginTop: 4 }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" style={tab(view === 'list')} onClick={() => setView('list')}>{t('view.list')}</button>
        <button type="button" style={tab(view === 'matrix')} onClick={() => setView('matrix')}>{t('view.matrix')}</button>
        {view === 'list' && (
          <>
            <input
              aria-label={t('search')}
              placeholder={t('search')}
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{ marginLeft: 'auto', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 'var(--text-sm)', background: 'var(--card-bg)', color: 'var(--text-strong)', minWidth: 220 }}
            />
            <select
              aria-label={t('col.type')}
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}
              style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 'var(--text-sm)', background: 'var(--card-bg)', color: 'var(--text-strong)' }}
            >
              <option value="">{t('allTypes')}</option>
              {SYSTEM_TYPES.map(ty => <option key={ty} value={ty}>{t(`type.${ty}`)}</option>)}
              <option value="none">{t('noType')}</option>
            </select>
          </>
        )}
      </div>

      {systems.length === 0 ? (
        <div style={{ ...card, ...small, padding: 32, textAlign: 'center' }}>
          {t('empty')}{' '}
          <Link href={`/projects/${project.id}/import`} style={{ color: 'var(--primary-600, #2563eb)' }}>{t('emptyLink')}</Link>
        </div>
      ) : view === 'list' ? (
        <div style={{ ...card, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>{t('col.area')}</th>
                <th style={th}>{t('col.system')}</th>
                <th style={th}>{t('col.type')}</th>
                <th style={th}>{t('col.priority')}</th>
                <th style={th}>{t('col.dependsOn')}</th>
                <th style={th}>{t('col.enables')}</th>
                <th style={th}>{t('col.boundary')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const providers = providersOf.get(s.id) ?? []
                const enables = dependentsCount.get(s.id) ?? 0
                return (
                  <tr key={s.id}>
                    <td style={td}><span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{s.area}</span></td>
                    <td style={td}>
                      <Link href={`/projects/${project.id}/systems/${s.id}`} style={{ fontWeight: 600, color: 'var(--text-strong)', textDecoration: 'none' }}>{s.code}</Link>
                      {s.name !== s.code && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{s.name}</div>}
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--gray-400)' }}>{t('subsystems', { count: s.subsystems })}</div>
                    </td>
                    <td style={td}>{s.system_type ? <TypeChip type={s.system_type} label={t(`type.${s.system_type}`)} /> : <span style={{ color: 'var(--gray-400)' }}>—</span>}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{s.priority ? `P${s.priority}` : <span style={{ color: 'var(--gray-400)' }}>—</span>}</td>
                    <td style={td}>
                      {providers.length === 0 ? <span style={{ color: 'var(--gray-400)' }}>—</span> : (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {providers.map(e => (
                            <span key={e.id} title={t('edgeTitle', { required: e.required, blocked: e.blocked })}
                              style={{ padding: '2px 7px', borderRadius: 6, background: 'var(--gray-100)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-strong)' }}>
                              {byId.get(e.depends_on_system_id)?.code ?? '?'}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={td}>
                      {enables > 0
                        ? <span style={{ fontWeight: 600, color: '#15803d' }}>{t('enablesCount', { count: enables })}</span>
                        : <span style={{ color: 'var(--gray-400)' }}>—</span>}
                    </td>
                    <td style={td}>{s.frozen ? <span style={{ fontWeight: 600, color: '#1d4ed8' }}>🔒 {t('frozen')}</span> : <span style={{ color: 'var(--gray-400)' }}>{t('open')}</span>}</td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ ...td, ...small, textAlign: 'center' }}>{t('noMatches')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <DependencyMatrix projectId={project.id} systems={systems} edges={edges} />
      )}

      {suggesting && <AiSuggestionsModal projectId={project.id} onClose={() => setSuggesting(false)} />}
      {importing && <ImportSystemsModal projectId={project.id} systems={systems} edges={edges} onClose={() => setImporting(false)} />}
    </div>
  )
}

/** Matriz sistema dependiente × sistema proveedor (solo los que participan en alguna dependencia). */
function DependencyMatrix({ projectId, systems, edges }: { projectId: string; systems: SystemListItem[]; edges: DependencyEdge[] }) {
  const t = useTranslations('Systems')
  const rowIds = new Set(edges.map(e => e.system_id))
  const colIds = new Set(edges.map(e => e.depends_on_system_id))
  const rows = systems.filter(s => rowIds.has(s.id))
  const cols = systems.filter(s => colIds.has(s.id))
  const cell = new Map(edges.map(e => [`${e.system_id}:${e.depends_on_system_id}`, [] as DependencyEdge[]]))
  for (const e of edges) cell.get(`${e.system_id}:${e.depends_on_system_id}`)!.push(e)

  if (!edges.length) return <div style={{ ...card, ...small, padding: 32, textAlign: 'center' }}>{t('matrix.empty')}</div>

  return (
    <div style={{ ...card, overflowX: 'auto', padding: 16 }}>
      <p style={{ ...small, margin: '0 0 12px' }}>{t('matrix.legend')}</p>
      <table style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, position: 'sticky', left: 0, zIndex: 1 }}>{t('matrix.corner')}</th>
            {cols.map(c => (
              <th key={c.id} style={{ ...th, textAlign: 'center' }}>
                <Link href={`/projects/${projectId}/systems/${c.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{c.code}</Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <th scope="row" style={{ ...td, position: 'sticky', left: 0, background: 'var(--card-bg)', textAlign: 'left', whiteSpace: 'nowrap' }}>
                <Link href={`/projects/${projectId}/systems/${r.id}`} style={{ fontWeight: 600, color: 'var(--text-strong)', textDecoration: 'none' }}>{r.code}</Link>
              </th>
              {cols.map(c => {
                const es = cell.get(`${r.id}:${c.id}`) ?? []
                return (
                  <td key={c.id} style={{ ...td, textAlign: 'center', minWidth: 64 }}
                    title={es.map(e => `${t(`kind.${e.kind}`)}: ${t('edgeTitle', { required: e.required, blocked: e.blocked })}`).join('\n') || undefined}>
                    {es.map(e => (
                      <div key={e.id} style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: e.kind === 'utility' ? '#15803d' : e.kind === 'process' ? '#1d4ed8' : 'var(--text-muted)' }}>
                        {KIND_LETTER[e.kind]} <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>{e.required}→{e.blocked}</span>
                      </div>
                    ))}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
