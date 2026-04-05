'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ExplorerArea, ExplorerSystem, ExplorerSubsystem } from '@/types/database'

interface Props {
  explorerData: ExplorerArea[]
  projectId: string
}

function rollupArea(area: ExplorerArea) {
  let tags = 0, total = 0, approved = 0, punches = 0
  for (const sys of area.systems) {
    for (const sub of sys.subsystems) {
      tags += sub.tag_count
      total += sub.itr_total
      approved += sub.itr_approved
      punches += sub.open_punches_a
    }
  }
  return { tags, total, approved, punches, pct: total > 0 ? Math.round((approved / total) * 100) : 0 }
}

function rollupSystem(sys: ExplorerSystem) {
  let tags = 0, total = 0, approved = 0, punches = 0
  for (const sub of sys.subsystems) {
    tags += sub.tag_count
    total += sub.itr_total
    approved += sub.itr_approved
    punches += sub.open_punches_a
  }
  return { tags, total, approved, punches, pct: total > 0 ? Math.round((approved / total) * 100) : 0 }
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div style={{ width: '80px', height: '5px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden', flexShrink: 0 }}>
      <div style={{
        height: '100%',
        width: `${pct}%`,
        background: pct === 100 ? '#10b981' : '#3b82f6',
        borderRadius: '999px',
      }} />
    </div>
  )
}

function SubsystemRow({ sub, projectId }: { sub: ExplorerSubsystem; projectId: string }) {
  const router = useRouter()
  const [hover, setHover] = useState(false)
  const pct = sub.itr_total > 0 ? Math.round((sub.itr_approved / sub.itr_total) * 100) : 0

  return (
    <div
      onClick={() => router.push(`/projects/${projectId}/tags?subsystem=${sub.id}`)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '8px 12px 8px 48px',
        cursor: 'pointer',
        background: hover ? '#f8fafc' : 'transparent',
        borderRadius: '6px',
        transition: 'background 0.1s',
      }}
    >
      <span style={{ color: '#94a3b8', fontSize: '13px', flexShrink: 0 }}>└─</span>
      <span style={{
        fontFamily: 'ui-monospace, monospace', fontSize: '12px', fontWeight: 600,
        color: '#475569', background: '#f1f5f9', padding: '2px 7px',
        borderRadius: '5px', flexShrink: 0,
      }}>
        {sub.code}
      </span>
      <span style={{ fontSize: '13px', color: '#64748b', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {sub.name}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {sub.open_punches_a > 0 && (
          <span style={{
            fontSize: '11px', fontWeight: 600, color: '#dc2626',
            background: '#fef2f2', padding: '1px 7px', borderRadius: '999px',
            border: '1px solid #fecaca',
          }}>
            ● {sub.open_punches_a} Cat-A
          </span>
        )}
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{sub.tag_count} tags</span>
        <ProgressBar pct={pct} />
        <span style={{ fontSize: '11px', fontWeight: 600, color: pct === 100 ? '#10b981' : '#64748b', width: '32px', textAlign: 'right' }}>
          {pct}%
        </span>
      </div>
    </div>
  )
}

function SystemRow({
  sys, projectId, isOpen, onToggle,
}: {
  sys: ExplorerSystem; projectId: string; isOpen: boolean; onToggle: () => void
}) {
  const [hover, setHover] = useState(false)
  const roll = rollupSystem(sys)

  return (
    <>
      <div
        onClick={onToggle}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '9px 12px 9px 24px',
          cursor: 'pointer',
          background: hover ? '#f8fafc' : 'transparent',
          borderRadius: '6px',
        }}
      >
        <span style={{ color: '#94a3b8', fontSize: '11px', width: '14px', textAlign: 'center', flexShrink: 0 }}>
          {isOpen ? '▾' : '▸'}
        </span>
        <span style={{
          fontFamily: 'ui-monospace, monospace', fontSize: '12px', fontWeight: 600,
          color: '#334155', background: '#e2e8f0', padding: '2px 7px',
          borderRadius: '5px', flexShrink: 0,
        }}>
          {sys.code}
        </span>
        <span style={{ fontSize: '13px', color: '#334155', fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sys.name}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {roll.punches > 0 && (
            <span style={{
              fontSize: '11px', fontWeight: 600, color: '#dc2626',
              background: '#fef2f2', padding: '1px 7px', borderRadius: '999px',
              border: '1px solid #fecaca',
            }}>
              ● {roll.punches} Cat-A
            </span>
          )}
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>{roll.tags} tags</span>
          <ProgressBar pct={roll.pct} />
          <span style={{ fontSize: '11px', fontWeight: 600, color: roll.pct === 100 ? '#10b981' : '#64748b', width: '32px', textAlign: 'right' }}>
            {roll.pct}%
          </span>
        </div>
      </div>
      {isOpen && sys.subsystems.map(sub => (
        <SubsystemRow key={sub.id} sub={sub} projectId={projectId} />
      ))}
    </>
  )
}

export default function ExplorerTree({ explorerData, projectId }: Props) {
  const [openAreas, setOpenAreas] = useState<Set<string>>(new Set(explorerData.map(a => a.id)))
  const [openSystems, setOpenSystems] = useState<Set<string>>(new Set())

  function toggleArea(id: string) {
    setOpenAreas(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSystem(id: string) {
    setOpenSystems(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (explorerData.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '60px 20px', color: '#94a3b8',
        background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0',
      }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>🗂️</div>
        <div style={{ fontWeight: 500 }}>No hay áreas definidas en este proyecto</div>
        <div style={{ fontSize: '13px', marginTop: '4px' }}>Importa tags para generar la jerarquía automáticamente</div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'white', borderRadius: '12px',
      border: '1px solid #e2e8f0', overflow: 'hidden',
    }}>
      {explorerData.map((area, aIdx) => {
        const roll = rollupArea(area)
        const isAreaOpen = openAreas.has(area.id)

        return (
          <div key={area.id} style={{ borderBottom: aIdx < explorerData.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
            {/* Area row */}
            <div
              onClick={() => toggleArea(area.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '12px 12px',
                cursor: 'pointer',
                background: '#f8fafc',
              }}
            >
              <span style={{ color: '#64748b', fontSize: '12px', width: '14px', textAlign: 'center', flexShrink: 0 }}>
                {isAreaOpen ? '▾' : '▸'}
              </span>
              <span style={{
                fontFamily: 'ui-monospace, monospace', fontSize: '12px', fontWeight: 700,
                color: '#0f172a', background: '#e2e8f0', padding: '3px 8px',
                borderRadius: '5px', flexShrink: 0,
              }}>
                {area.code}
              </span>
              <span style={{ fontSize: '14px', color: '#0f172a', fontWeight: 600, flex: 1 }}>
                {area.name}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                {roll.punches > 0 && (
                  <span style={{
                    fontSize: '11px', fontWeight: 600, color: '#dc2626',
                    background: '#fef2f2', padding: '2px 8px', borderRadius: '999px',
                    border: '1px solid #fecaca',
                  }}>
                    ● {roll.punches} Cat-A
                  </span>
                )}
                <span style={{ fontSize: '12px', color: '#64748b' }}>{roll.tags} tags</span>
                <ProgressBar pct={roll.pct} />
                <span style={{ fontSize: '12px', fontWeight: 700, color: roll.pct === 100 ? '#10b981' : '#0f172a', width: '36px', textAlign: 'right' }}>
                  {roll.pct}%
                </span>
              </div>
            </div>

            {/* Systems */}
            {isAreaOpen && (
              <div style={{ padding: '4px 0' }}>
                {area.systems.map(sys => (
                  <SystemRow
                    key={sys.id}
                    sys={sys}
                    projectId={projectId}
                    isOpen={openSystems.has(sys.id)}
                    onToggle={() => toggleSystem(sys.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
