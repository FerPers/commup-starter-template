'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────

export type Tag360 = {
  tag_id: string
  project_id: string
  tag_number: string
  description: string | null
  tag_status: string
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  preservation_required: boolean
  pid_drawing: string | null
  signal_type: string | null
  sil_level: string | null
  io_address: string | null

  discipline_id: string | null
  discipline_code: string | null
  discipline_name: string | null
  discipline_color: string | null

  subsystem_id: string | null
  subsystem_code: string | null
  subsystem_name: string | null
  system_id: string | null
  system_code: string | null
  system_name: string | null
  area_id: string | null
  area_code: string | null
  area_name: string | null

  itr_total: number
  itr_approved: number
  itr_open: number
  itr_pct: number
  itr_semaforo: string

  open_punches_a: number
  open_punches_b: number
  open_punches_c: number
  open_punches_total: number

  certs_issued: number
  last_cert_date: string | null
  certs_summary: string | null

  preservation_next_due: string | null
  preservation_active_plans: number

  pid_hotspot_count: number
  first_pid_drawing: string | null
  first_pid_doc_id: string | null

  semaforo_global: 'red' | 'yellow' | 'green' | 'grey'
}

// ── Semáforo ──────────────────────────────────────────────────────────────────

const SEMAFORO: Record<string, { color: string; bg: string; border: string; label: string; dot: string }> = {
  green:  { color: '#059669', bg: '#ecfdf5', border: '#a7f3d0', label: 'Completo',    dot: '#10b981' },
  yellow: { color: '#b45309', bg: '#fffbeb', border: '#fde68a', label: 'En progreso', dot: '#f59e0b' },
  red:    { color: '#b91c1c', bg: '#fef2f2', border: '#fecaca', label: 'Bloqueado',   dot: '#ef4444' },
  grey:   { color: 'var(--text-muted)', bg: 'var(--gray-50)', border: 'var(--border)', label: 'Sin ITRs',    dot: '#94a3b8' },
}

function SemaforoDot({ semaforo, size = 10 }: { semaforo: string; size?: number }) {
  const s = SEMAFORO[semaforo] ?? SEMAFORO.grey
  return (
    <span style={{
      display: 'inline-block',
      width: size, height: size,
      borderRadius: '50%',
      background: s.dot,
      flexShrink: 0,
      boxShadow: `0 0 0 2px ${s.dot}30`,
    }} />
  )
}

// ── Mini progress bar ─────────────────────────────────────────────────────────

function ProgressMini({ pct, semaforo }: { pct: number; semaforo: string }) {
  const color = semaforo === 'green' ? '#10b981' : semaforo === 'yellow' ? '#f59e0b' : semaforo === 'red' ? '#ef4444' : '#cbd5e1'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ flex: 1, height: '4px', background: 'var(--gray-100)', borderRadius: '999px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '999px', transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '11px', fontWeight: 600, color, minWidth: '30px', textAlign: 'right' }}>
        {pct}%
      </span>
    </div>
  )
}

// ── Tag Asset Card ────────────────────────────────────────────────────────────

function TagCard({ tag, projectId, highlight }: { tag: Tag360; projectId: string; highlight: boolean }) {
  const router = useRouter()
  const s = SEMAFORO[tag.semaforo_global] ?? SEMAFORO.grey
  const discColor = tag.discipline_color ?? '#94a3b8'

  const hasPunchA  = tag.open_punches_a > 0
  const hasPunchB  = tag.open_punches_b > 0
  const hasPreserv = tag.preservation_active_plans > 0
  const hasCert    = tag.certs_issued > 0
  const hasPid     = tag.pid_hotspot_count > 0

  return (
    <div
      onClick={() => router.push(`/projects/${projectId}/tags/${tag.tag_id}`)}
      style={{
        borderRadius: '12px',
        border: `1.5px solid ${highlight ? s.dot : s.border}`,
        background: highlight ? s.bg : 'var(--card-bg)',
        padding: '14px',
        cursor: 'pointer',
        transition: 'all 0.15s',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        boxShadow: highlight ? `0 0 0 2px ${s.dot}20` : 'none',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 4px 12px rgba(0,0,0,0.08)`; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = highlight ? `0 0 0 2px ${s.dot}20` : 'none'; e.currentTarget.style.transform = 'none' }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <SemaforoDot semaforo={tag.semaforo_global} size={9} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: '13px', color: 'var(--text-strong)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {tag.tag_number}
            </span>
            <span style={{
              padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700,
              background: `${discColor}18`, color: discColor, flexShrink: 0,
            }}>
              {tag.discipline_code ?? '?'}
            </span>
          </div>
          {tag.description && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tag.description}
            </div>
          )}
        </div>
      </div>

      {/* ITR Progress */}
      {tag.itr_total > 0 && (
        <div>
          <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            ITRs {tag.itr_approved}/{tag.itr_total}
          </div>
          <ProgressMini pct={Number(tag.itr_pct)} semaforo={tag.itr_semaforo} />
        </div>
      )}

      {/* Badges row */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {hasPunchA && (
          <Badge label={`A:${tag.open_punches_a}`} color="#ef4444" bg="#fef2f2" title="Punch Cat A abiertos" />
        )}
        {hasPunchB && (
          <Badge label={`B:${tag.open_punches_b}`} color="#f59e0b" bg="#fffbeb" title="Punch Cat B abiertos" />
        )}
        {hasCert && (
          <Badge label={`✓${tag.certs_issued}`} color="#059669" bg="#ecfdf5" title="Certificados emitidos" />
        )}
        {hasPreserv && (
          <Badge label="🔧" color="#7c3aed" bg="#f5f3ff" title="Preservation activa" />
        )}
        {hasPid && (
          <Badge label="P&ID" color="#0369a1" bg="#e0f2fe" title={`${tag.pid_hotspot_count} hotspot(s)`} />
        )}
        {tag.itr_total === 0 && (
          <Badge label="Sin ITRs" color="#94a3b8" bg="#f8fafc" title="No hay ITRs asignados" />
        )}
      </div>

      {/* Preservation due */}
      {tag.preservation_next_due && (
        <div style={{ fontSize: '10px', color: '#7c3aed', background: '#f5f3ff', padding: '3px 7px', borderRadius: '5px', display: 'inline-block' }}>
          ⏰ {new Date(tag.preservation_next_due).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
        </div>
      )}
    </div>
  )
}

function Badge({ label, color, bg, title }: { label: string; color: string; bg: string; title?: string }) {
  return (
    <span
      title={title}
      style={{ padding: '2px 7px', borderRadius: '5px', fontSize: '10px', fontWeight: 600, background: bg, color, cursor: 'default' }}
    >
      {label}
    </span>
  )
}

// ── Subsystem panel ───────────────────────────────────────────────────────────

function SubsystemPanel({
  subsystemCode, subsystemName,
  tags, projectId, highlightTagId,
}: {
  subsystemCode: string
  subsystemName: string
  tags: Tag360[]
  projectId: string
  highlightTagId: string | null
}) {
  const [open, setOpen] = useState(true)

  const total    = tags.length
  const green    = tags.filter(t => t.semaforo_global === 'green').length
  const red      = tags.filter(t => t.semaforo_global === 'red').length
  const pct      = total > 0 ? Math.round((green / total) * 100) : 0

  // Subsystem semaforo
  const subSemaforo = red > 0 ? 'red' : green === total && total > 0 ? 'green' : total === 0 ? 'grey' : 'yellow'

  return (
    <div style={{ marginBottom: '12px' }}>
      {/* Subsystem header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left', padding: '10px 14px',
          background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: open ? '10px 10px 0 0' : '10px',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--gray-100)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--gray-50)' }}
      >
        <SemaforoDot semaforo={subSemaforo} size={8} />
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--border)', padding: '2px 7px', borderRadius: '4px' }}>
          {subsystemCode}
        </span>
        <span style={{ fontSize: '13px', color: '#334155', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {subsystemName}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>{total} tags</span>
          {red > 0 && <span style={{ fontSize: '11px', fontWeight: 600, color: '#ef4444', background: '#fef2f2', padding: '1px 6px', borderRadius: '5px' }}>A:{red}</span>}
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{pct}%</span>
          <span style={{ color: '#94a3b8', fontSize: '12px', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>›</span>
        </div>
      </button>

      {open && (
        <div style={{
          border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 10px 10px',
          padding: '12px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '10px',
          background: 'var(--card-bg)',
        }}>
          {tags.map(tag => (
            <TagCard
              key={tag.tag_id}
              tag={tag}
              projectId={projectId}
              highlight={tag.tag_id === highlightTagId}
            />
          ))}
          {tags.length === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', gridColumn: '1/-1' }}>
              Sin tags en este subsistema
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── System block ──────────────────────────────────────────────────────────────

function SystemBlock({
  systemCode, systemName,
  subsystems, tags, projectId, highlightTagId,
}: {
  systemCode: string
  systemName: string
  subsystems: Array<{ id: string; code: string; name: string }>
  tags: Tag360[]
  projectId: string
  highlightTagId: string | null
}) {
  const total   = tags.length
  const green   = tags.filter(t => t.semaforo_global === 'green').length
  const red     = tags.filter(t => t.semaforo_global === 'red').length
  const pct     = total > 0 ? Math.round((green / total) * 100) : 0
  const sysSema = red > 0 ? 'red' : green === total && total > 0 ? 'green' : total === 0 ? 'grey' : 'yellow'

  return (
    <div style={{ marginBottom: '24px' }}>
      {/* System header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '12px 16px', marginBottom: '12px',
        background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px',
        borderLeft: `4px solid ${SEMAFORO[sysSema].dot}`,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <SemaforoDot semaforo={sysSema} size={10} />
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '14px', fontWeight: 700, color: 'var(--text-strong)' }}>
              {systemCode}
            </span>
            <span style={{ fontSize: '14px', color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {systemName}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          {red > 0 && (
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#ef4444' }}>
              ⛔ {red} bloqueado{red > 1 ? 's' : ''}
            </span>
          )}
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{total} tags · {pct}% ITR</span>
        </div>
      </div>

      {/* Subsystem panels */}
      <div style={{ paddingLeft: '16px' }}>
        {subsystems.map(sub => {
          const subTags = tags.filter(t => t.subsystem_id === sub.id)
          return (
            <SubsystemPanel
              key={sub.id}
              subsystemCode={sub.code}
              subsystemName={sub.name}
              tags={subTags}
              projectId={projectId}
              highlightTagId={highlightTagId}
            />
          )
        })}
      </div>
    </div>
  )
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '11px', color: 'var(--text-muted)' }}>
      {Object.entries(SEMAFORO).map(([k, v]) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: v.dot, display: 'inline-block' }} />
          {v.label}
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: '#fef2f2', color: '#ef4444' }}>A:N</span>
        Punches Cat A
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: '#fffbeb', color: '#f59e0b' }}>B:N</span>
        Punches Cat B
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: '#ecfdf5', color: '#059669' }}>✓N</span>
        Certs emitidos
      </div>
    </div>
  )
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatsBar({ tags }: { tags: Tag360[] }) {
  const total   = tags.length
  const green   = tags.filter(t => t.semaforo_global === 'green').length
  const yellow  = tags.filter(t => t.semaforo_global === 'yellow').length
  const red     = tags.filter(t => t.semaforo_global === 'red').length
  const grey    = tags.filter(t => t.semaforo_global === 'grey').length
  const punchA  = tags.reduce((a, t) => a + t.open_punches_a, 0)
  const punchB  = tags.reduce((a, t) => a + t.open_punches_b, 0)
  const itrPct  = total > 0
    ? Math.round((tags.reduce((a, t) => a + t.itr_approved, 0) / Math.max(tags.reduce((a, t) => a + t.itr_total, 0), 1)) * 100)
    : 0

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
      gap: '12px', padding: '16px', background: 'var(--card-bg)',
      border: '1px solid var(--border)', borderRadius: '12px', marginBottom: '24px',
    }}>
      <Stat value={total} label="Tags totales" color="#334155" />
      <Stat value={`${itrPct}%`} label="Compl. ITR" color={itrPct === 100 ? '#059669' : '#3b82f6'} />
      <Stat value={green}  label="Completados" color="#059669" />
      <Stat value={yellow} label="En progreso" color="#f59e0b" />
      <Stat value={red}    label="Bloqueados"  color="#ef4444" />
      <Stat value={grey}   label="Sin ITRs"    color="#94a3b8" />
      <Stat value={punchA} label="Punches A"   color="#ef4444" />
      <Stat value={punchB} label="Punches B"   color="#f59e0b" />
    </div>
  )
}

function Stat({ value, label, color }: { value: string | number; label: string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '22px', fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{label}</div>
    </div>
  )
}

// ── Main TwinView ─────────────────────────────────────────────────────────────

export default function TwinView({
  projectId,
  tags,
}: {
  projectId: string
  tags: Tag360[]
}) {
  const searchParams = useSearchParams()
  const highlightTagId = searchParams.get('tag')
  const filterSystem   = searchParams.get('system')

  const [search, setSearch] = useState('')
  const [semaFilter, setSemaFilter] = useState<string>('ALL')

  // Build hierarchy from flat tag list
  const systems = useMemo(() => {
    const sysMap = new Map<string, { id: string; code: string; name: string }>()
    const subMap = new Map<string, Map<string, { id: string; code: string; name: string }>>()
    for (const t of tags) {
      if (!t.system_id) continue
      if (!sysMap.has(t.system_id)) sysMap.set(t.system_id, { id: t.system_id, code: t.system_code ?? '', name: t.system_name ?? '' })
      if (!subMap.has(t.system_id)) subMap.set(t.system_id, new Map())
      if (t.subsystem_id && !subMap.get(t.system_id)!.has(t.subsystem_id)) {
        subMap.get(t.system_id)!.set(t.subsystem_id, { id: t.subsystem_id, code: t.subsystem_code ?? '', name: t.subsystem_name ?? '' })
      }
    }
    return [...sysMap.values()]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map(sys => ({
        ...sys,
        subsystems: [...(subMap.get(sys.id) ?? new Map()).values()].sort((a, b) => a.code.localeCompare(b.code)),
      }))
  }, [tags])

  const filteredTags = useMemo(() => {
    return tags.filter(t => {
      if (semaFilter !== 'ALL' && t.semaforo_global !== semaFilter) return false
      if (filterSystem && t.system_id !== filterSystem) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !t.tag_number.toLowerCase().includes(q) &&
          !(t.description ?? '').toLowerCase().includes(q) &&
          !(t.subsystem_code ?? '').toLowerCase().includes(q) &&
          !(t.system_code ?? '').toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [tags, semaFilter, filterSystem, search])

  const filteredSystems = useMemo(() => {
    return systems.filter(sys => filteredTags.some(t => t.system_id === sys.id))
  }, [systems, filteredTags])

  const semaOptions = [
    { key: 'ALL',    label: 'Todos',       color: 'var(--text-muted)' },
    { key: 'red',    label: 'Bloqueados',  color: '#ef4444' },
    { key: 'yellow', label: 'En progreso', color: '#f59e0b' },
    { key: 'green',  label: 'Completados', color: '#059669' },
    { key: 'grey',   label: 'Sin ITRs',    color: '#94a3b8' },
  ]

  return (
    <div>
      {/* Stats */}
      <StatsBar tags={tags} />

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        {/* Semaforo filter chips */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {semaOptions.map(opt => {
            const count = opt.key === 'ALL' ? tags.length : tags.filter(t => t.semaforo_global === opt.key).length
            const active = semaFilter === opt.key
            return (
              <button
                key={opt.key}
                onClick={() => setSemaFilter(opt.key)}
                style={{
                  padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: active ? 600 : 400,
                  border: `1px solid ${active ? opt.color : 'var(--border)'}`,
                  background: active ? `${opt.color}15` : 'var(--card-bg)',
                  color: active ? opt.color : 'var(--text-muted)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
                }}
              >
                {opt.key !== 'ALL' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: opt.color, display: 'inline-block' }} />}
                {opt.label}
                <span style={{
                  padding: '0 5px', borderRadius: '999px', fontSize: '10px', fontWeight: 700,
                  background: active ? opt.color : 'var(--gray-100)',
                  color: active ? 'white' : 'var(--text-muted)',
                }}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar tag, descripción, sistema..."
          aria-label="Buscar tag, descripción, sistema"
          style={{
            padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px',
            fontSize: '13px', fontFamily: 'inherit', width: '240px', maxWidth: '100%',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Legend */}
      <div style={{ marginBottom: '16px' }}>
        <Legend />
      </div>

      {/* System blocks */}
      {filteredSystems.length === 0 ? (
        <div style={{ padding: '64px', textAlign: 'center', color: '#94a3b8', fontSize: '14px', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)' }}>
          {search || semaFilter !== 'ALL' ? 'Sin resultados para los filtros aplicados' : 'No hay tags registrados en este proyecto'}
        </div>
      ) : (
        filteredSystems.map(sys => (
          <SystemBlock
            key={sys.id}
            systemCode={sys.code}
            systemName={sys.name}
            subsystems={sys.subsystems}
            tags={filteredTags.filter(t => t.system_id === sys.id)}
            projectId={projectId}
            highlightTagId={highlightTagId}
          />
        ))
      )}
    </div>
  )
}
