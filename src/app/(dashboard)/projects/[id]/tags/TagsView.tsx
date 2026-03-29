'use client'

import { useState } from 'react'

type Discipline = { id: string; code: string; name: string; color: string }
type Area       = { id: string; code: string; name: string }
type System     = { id: string; code: string; name: string; areas: Area }
type Subsystem  = { id: string; code: string; name: string; systems: System }
type Tag = {
  id: string
  tag_number: string
  description: string
  status: string
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  preservation_required: boolean
  disciplines: Discipline
  subsystems: Subsystem
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  not_started: { label: 'Sin iniciar', color: '#94a3b8', bg: '#f1f5f9' },
  in_progress:  { label: 'En progreso', color: '#3b82f6', bg: '#eff6ff' },
  complete:     { label: 'Completo',    color: '#10b981', bg: '#ecfdf5' },
}

export default function TagsView({
  projectId,
  tags,
  canEdit,
}: {
  projectId: string
  tags: Tag[]
  canEdit: boolean
}) {
  const [activeDiscipline, setActiveDiscipline] = useState<string>('ALL')

  // Build discipline summary with counts
  const disciplineMap = new Map<string, { code: string; name: string; color: string; count: number }>()
  for (const tag of tags) {
    const d = tag.disciplines
    if (!disciplineMap.has(d.code)) {
      disciplineMap.set(d.code, { code: d.code, name: d.name, color: d.color, count: 0 })
    }
    disciplineMap.get(d.code)!.count++
  }
  const disciplines = [...disciplineMap.values()].sort((a, b) => a.code.localeCompare(b.code))

  const filtered = activeDiscipline === 'ALL'
    ? tags
    : tags.filter(t => t.disciplines.code === activeDiscipline)

  return (
    <div>
      {/* Discipline filter tabs */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <FilterTab
          label="Todos"
          count={tags.length}
          active={activeDiscipline === 'ALL'}
          color="#3b82f6"
          onClick={() => setActiveDiscipline('ALL')}
        />
        {disciplines.map(d => (
          <FilterTab
            key={d.code}
            label={`${d.code} — ${d.name}`}
            count={d.count}
            active={activeDiscipline === d.code}
            color={d.color}
            onClick={() => setActiveDiscipline(d.code)}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '64px', color: '#94a3b8',
          fontSize: '14px', background: 'white', borderRadius: '12px',
          border: '1px solid #e2e8f0',
        }}>
          No hay tags en esta disciplina
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <Th>#</Th>
                <Th>TAG</Th>
                <Th>Descripción</Th>
                <Th>Área / Sistema / Subsistema</Th>
                <Th>Fabricante · Modelo</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tag, i) => {
                const status = STATUS_CONFIG[tag.status] ?? STATUS_CONFIG.not_started
                const area = tag.subsystems?.systems?.areas
                const sys  = tag.subsystems?.systems
                const sub  = tag.subsystems
                const hier = [area?.code, sys?.code, sub?.code].filter(Boolean).join(' › ')
                const d = tag.disciplines
                const maker = [tag.manufacturer, tag.model].filter(Boolean).join(' · ')

                return (
                  <tr key={tag.id} style={{
                    borderBottom: '1px solid #f1f5f9',
                    transition: 'background 0.1s',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={tdStyle}>
                      <span style={{ fontSize: '11px', color: '#cbd5e1' }}>{i + 1}</span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          padding: '2px 7px', borderRadius: '5px', fontSize: '10px', fontWeight: 700,
                          background: `${d.color}18`, color: d.color, flexShrink: 0,
                        }}>
                          {d.code}
                        </span>
                        <span style={{
                          fontWeight: 600, fontSize: '13px', color: '#0f172a',
                          fontFamily: 'ui-monospace, monospace',
                        }}>
                          {tag.tag_number}
                        </span>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '13px', color: '#334155' }}>{tag.description || '—'}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '12px', color: '#64748b', fontFamily: 'ui-monospace, monospace' }}>
                        {hier || '—'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>{maker || '—'}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 500,
                        background: status.bg, color: status.color,
                      }}>
                        {status.label}
                      </span>
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

function FilterTab({
  label, count, active, color, onClick,
}: {
  label: string; count: number; active: boolean; color: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 14px', borderRadius: '8px', border: '1px solid',
        borderColor: active ? color : '#e2e8f0',
        background: active ? `${color}15` : 'white',
        color: active ? color : '#64748b',
        fontSize: '13px', fontWeight: active ? 600 : 400,
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
        transition: 'all 0.15s',
      }}
    >
      {label}
      <span style={{
        padding: '1px 7px', borderRadius: '999px', fontSize: '11px', fontWeight: 700,
        background: active ? color : '#f1f5f9',
        color: active ? 'white' : '#64748b',
      }}>
        {count}
      </span>
    </button>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{
      padding: '10px 16px', textAlign: 'left',
      fontSize: '11px', fontWeight: 600, color: '#94a3b8',
      textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>
      {children}
    </th>
  )
}

const tdStyle: React.CSSProperties = {
  padding: '12px 16px', verticalAlign: 'middle',
}
