'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ──────────────────────────────────────────────────────────────

type Punch = {
  id: string
  punch_number: string
  category: 'A' | 'B' | 'C'
  description: string
  status: 'open' | 'in_progress' | 'closed' | 'cancelled'
  priority: 'critical' | 'major' | 'minor'
  target_date: string | null
  closed_date: string | null
  created_at: string
  itr_id: string | null
  raised_by_profile: { full_name: string } | null
  assigned_to_profile: { full_name: string } | null
  tags: { id: string; tag_number: string; description: string; disciplines: { code: string; name: string; color: string } } | null
  subsystems: { id: string; code: string; name: string; systems: { code: string; name: string } } | null
}

type Phase      = { id: string; code: string; name: string; color: string }
type Discipline = { id: string; code: string; name: string; color: string }
type System     = { id: string; code: string; name: string }

// ── Config ──────────────────────────────────────────────────────────────

const CATEGORY_CFG = {
  A: { label: 'Cat A', color: '#ef4444', bg: '#fee2e2', border: '#fecaca' },
  B: { label: 'Cat B', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
  C: { label: 'Cat C', color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
} as const

const STATUS_CFG = {
  open:        { label: 'Abierto',    color: '#ef4444', bg: '#fee2e2' },
  in_progress: { label: 'En proceso', color: '#3b82f6', bg: '#eff6ff' },
  closed:      { label: 'Cerrado',    color: '#10b981', bg: '#ecfdf5' },
  cancelled:   { label: 'Cancelado',  color: '#64748b', bg: '#f1f5f9' },
} as const

// ── Main component ──────────────────────────────────────────────────────

export default function PunchListView({
  projectId,
  projectName,
  punches,
  phases: _phases,
  disciplines,
  systems,
}: {
  projectId: string
  projectName: string
  punches: Punch[]
  phases: Phase[]
  disciplines: Discipline[]
  systems: System[]
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<'A' | 'B' | 'C' | ''>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterDisc, setFilterDisc] = useState('')
  const [filterSystem, setFilterSystem] = useState('')

  // ── Summary counts ───────────────────────────────────────────────────

  const catACnt    = punches.filter(p => p.category === 'A' && p.status !== 'closed' && p.status !== 'cancelled').length
  const catBCnt    = punches.filter(p => p.category === 'B' && p.status !== 'closed' && p.status !== 'cancelled').length
  const catCCnt    = punches.filter(p => p.category === 'C' && p.status !== 'closed' && p.status !== 'cancelled').length
  const closedCnt  = punches.filter(p => p.status === 'closed').length

  // ── Filter ───────────────────────────────────────────────────────────

  const filtered = punches.filter(p => {
    if (filterCat && p.category !== filterCat) return false
    if (filterStatus && p.status !== filterStatus) return false
    if (filterDisc && p.tags?.disciplines.code !== filterDisc) return false
    if (filterSystem && p.subsystems?.systems.code !== filterSystem) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !p.punch_number.toLowerCase().includes(q) &&
        !p.description.toLowerCase().includes(q) &&
        !(p.tags?.tag_number.toLowerCase().includes(q)) &&
        !(p.assigned_to_profile?.full_name.toLowerCase().includes(q))
      ) return false
    }
    return true
  })

  const hasFilters = !!(search || filterCat || filterStatus || filterDisc || filterSystem)

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1200px' }}>

      {/* Breadcrumb + title */}
      <div style={{ marginBottom: '6px' }}>
        <a href={`/projects/${projectId}`} style={{ fontSize: '13px', color: '#64748b', textDecoration: 'none' }}>
          ← {projectName}
        </a>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Punch List</h1>
        <span style={{ fontSize: '13px', color: '#94a3b8' }}>{filtered.length} de {punches.length} punches</span>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Cat A — Abiertos', count: catACnt, color: '#ef4444', bg: '#fee2e2', border: '#fecaca', filterVal: 'A' as const },
          { label: 'Cat B — Abiertos', count: catBCnt, color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', filterVal: 'B' as const },
          { label: 'Cat C — Abiertos', count: catCCnt, color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', filterVal: 'C' as const },
          { label: 'Cerrados', count: closedCnt, color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0', filterVal: null },
        ].map(card => (
          <div
            key={card.label}
            onClick={() => card.filterVal && setFilterCat(prev => prev === card.filterVal ? '' : card.filterVal!)}
            style={{ padding: '16px 18px', borderRadius: '12px', background: card.bg, border: `1px solid ${card.border}`, cursor: card.filterVal ? 'pointer' : 'default' }}
          >
            <div style={{ fontSize: '24px', fontWeight: 800, color: card.color }}>{card.count}</div>
            <div style={{ fontSize: '11px', color: card.color, fontWeight: 600, marginTop: '2px' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por # punch, descripción, tag..."
          style={{ flex: '1 1 220px', minWidth: '180px', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px' }}
        />

        <select value={filterCat} onChange={e => setFilterCat(e.target.value as 'A' | 'B' | 'C' | '')} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', background: 'white' }}>
          <option value="">Todas las categorías</option>
          <option value="A">Cat A — Bloqueante</option>
          <option value="B">Cat B — Transferible</option>
          <option value="C">Cat C — Menor</option>
        </select>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', background: 'white' }}>
          <option value="">Todos los estados</option>
          <option value="open">Abierto</option>
          <option value="in_progress">En proceso</option>
          <option value="closed">Cerrado</option>
          <option value="cancelled">Cancelado</option>
        </select>

        {disciplines.length > 0 && (
          <select value={filterDisc} onChange={e => setFilterDisc(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', background: 'white' }}>
            <option value="">Todas las disciplinas</option>
            {disciplines.map(d => <option key={d.id} value={d.code}>{d.code} — {d.name}</option>)}
          </select>
        )}

        {systems.length > 0 && (
          <select value={filterSystem} onChange={e => setFilterSystem(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', background: 'white' }}>
            <option value="">Todos los sistemas</option>
            {systems.map(s => <option key={s.id} value={s.code}>{s.code} — {s.name}</option>)}
          </select>
        )}

        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setFilterCat(''); setFilterStatus(''); setFilterDisc(''); setFilterSystem('') }}
            style={{ padding: '8px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', color: '#64748b', cursor: 'pointer' }}
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
          <div style={{ fontSize: '28px', marginBottom: '10px' }}>⚑</div>
          <p style={{ fontSize: '14px' }}>{hasFilters ? 'Sin resultados para estos filtros' : 'Sin punches registrados en este proyecto'}</p>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Punch #', 'Tag', 'Categoría', 'Descripción', 'Estado', 'Asignado', 'Fecha límite'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((punch, i) => {
                const catCfg = CATEGORY_CFG[punch.category]
                const stCfg = STATUS_CFG[punch.status] ?? STATUS_CFG.open
                return (
                  <tr
                    key={punch.id}
                    onClick={() => punch.tags && router.push(`/projects/${projectId}/tags/${punch.tags.id}?tab=punches`)}
                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: punch.tags ? 'pointer' : 'default', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '12px 14px', fontSize: '12px', fontFamily: 'ui-monospace, monospace', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {punch.punch_number}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {punch.tags ? (
                        <div>
                          <span style={{ fontSize: '12px', fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: punch.tags.disciplines.color }}>{punch.tags.tag_number}</span>
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>{punch.tags.disciplines.code}</div>
                        </div>
                      ) : (
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ padding: '3px 9px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, background: catCfg.bg, color: catCfg.color, border: `1px solid ${catCfg.border}`, whiteSpace: 'nowrap' }}>
                        {catCfg.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '13px', color: '#0f172a', maxWidth: '320px' }}>
                      <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {punch.description}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ padding: '3px 9px', borderRadius: '5px', fontSize: '11px', fontWeight: 600, background: stCfg.bg, color: stCfg.color, whiteSpace: 'nowrap' }}>
                        {stCfg.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '12px', color: '#475569', whiteSpace: 'nowrap' }}>
                      {punch.assigned_to_profile?.full_name ?? <span style={{ color: '#cbd5e1' }}>Sin asignar</span>}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '12px', color: punch.target_date ? '#475569' : '#cbd5e1', whiteSpace: 'nowrap' }}>
                      {punch.target_date ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
