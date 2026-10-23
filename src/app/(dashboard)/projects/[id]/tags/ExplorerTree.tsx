'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { FolderOpen } from 'lucide-react'
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
    <span style={{ display: 'block', width: '80px', height: '5px', background: 'var(--gray-100)', borderRadius: '999px', overflow: 'hidden', flexShrink: 0 }}>
      <span style={{
        display: 'block',
        height: '100%',
        width: `${pct}%`,
        background: pct === 100 ? 'var(--success-500)' : 'var(--primary-500)',
        borderRadius: '999px',
      }} />
    </span>
  )
}

function SubsystemRow({ sub, projectId }: { sub: ExplorerSubsystem; projectId: string }) {
  const [hover, setHover] = useState(false)
  const pct = sub.itr_total > 0 ? Math.round((sub.itr_approved / sub.itr_total) * 100) : 0

  // G-12: la fila navega → enlace de verdad (Tab, Enter, abrir en otra pestaña).
  return (
    <Link
      href={`/projects/${projectId}/tags?subsystem=${sub.id}`}
      prefetch={false}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '8px 12px 8px 48px',
        cursor: 'pointer',
        background: hover ? 'var(--gray-50)' : 'transparent',
        borderRadius: '6px',
        transition: 'background 0.1s',
        color: 'inherit', textDecoration: 'none',
      }}
    >
      <span style={{ color: 'var(--text-muted)', fontSize: '13px', flexShrink: 0 }}>└─</span>
      <span style={{
        fontFamily: 'ui-monospace, monospace', fontSize: '12px', fontWeight: 600,
        color: 'var(--text-muted)', background: 'var(--gray-100)', padding: '2px 7px',
        borderRadius: '5px', flexShrink: 0,
      }}>
        {sub.code}
      </span>
      <span style={{ fontSize: '13px', color: 'var(--text-muted)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {sub.name}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {sub.open_punches_a > 0 && (
          <span style={{
            fontSize: '11px', fontWeight: 600, color: 'var(--danger-700)',
            background: 'var(--danger-50)', padding: '1px 7px', borderRadius: '999px',
            border: '1px solid var(--danger-200)',
          }}>
            ● {sub.open_punches_a} Cat-A
          </span>
        )}
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{sub.tag_count} tags</span>
        <ProgressBar pct={pct} />
        <span style={{ fontSize: '11px', fontWeight: 600, color: pct === 100 ? 'var(--success-700)' : 'var(--text-muted)', width: '32px', textAlign: 'right' }}>
          {pct}%
        </span>
      </span>
    </Link>
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
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '9px 12px 9px 24px',
          cursor: 'pointer',
          background: hover ? 'var(--gray-50)' : 'transparent',
          borderRadius: '6px',
          width: '100%', border: 'none', font: 'inherit', color: 'inherit', textAlign: 'left',
        }}
      >
        <span style={{ color: 'var(--text-muted)', fontSize: '11px', width: '14px', textAlign: 'center', flexShrink: 0 }}>
          {isOpen ? '▾' : '▸'}
        </span>
        <span style={{
          fontFamily: 'ui-monospace, monospace', fontSize: '12px', fontWeight: 600,
          color: 'var(--text-body)', background: 'var(--border)', padding: '2px 7px',
          borderRadius: '5px', flexShrink: 0,
        }}>
          {sys.code}
        </span>
        <span style={{ fontSize: '13px', color: 'var(--text-body)', fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sys.name}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {roll.punches > 0 && (
            <span style={{
              fontSize: '11px', fontWeight: 600, color: 'var(--danger-700)',
              background: 'var(--danger-50)', padding: '1px 7px', borderRadius: '999px',
              border: '1px solid var(--danger-200)',
            }}>
              ● {roll.punches} Cat-A
            </span>
          )}
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{roll.tags} tags</span>
          <ProgressBar pct={roll.pct} />
          <span style={{ fontSize: '11px', fontWeight: 600, color: roll.pct === 100 ? 'var(--success-700)' : 'var(--text-muted)', width: '32px', textAlign: 'right' }}>
            {roll.pct}%
          </span>
        </span>
      </button>
      {isOpen && sys.subsystems.map(sub => (
        <SubsystemRow key={sub.id} sub={sub} projectId={projectId} />
      ))}
    </>
  )
}

export default function ExplorerTree({ explorerData, projectId }: Props) {
  const tx = useTranslations('ExplorerTree')
  const [openAreas, setOpenAreas] = useState<Set<string>>(new Set(explorerData.map(a => a.id)))
  const [openSystems, setOpenSystems] = useState<Set<string>>(new Set())

  function toggleArea(id: string) {
    setOpenAreas(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSystem(id: string) {
    setOpenSystems(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  if (explorerData.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)',
        background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
          <FolderOpen size={32} aria-hidden="true" />
        </div>
        <div style={{ fontWeight: 500 }}>{tx('emptyTitle')}</div>
        <div style={{ fontSize: '13px', marginTop: '4px' }}>{tx('emptyHint')}</div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--card-bg)', borderRadius: '12px',
      border: '1px solid var(--border)', overflow: 'hidden',
    }}>
      {explorerData.map((area, aIdx) => {
        const roll = rollupArea(area)
        const isAreaOpen = openAreas.has(area.id)

        return (
          <div key={area.id} style={{ borderBottom: aIdx < explorerData.length - 1 ? '1px solid var(--gray-100)' : 'none' }}>
            {/* Area row */}
            <button
              type="button"
              aria-expanded={isAreaOpen}
              onClick={() => toggleArea(area.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '12px 12px',
                cursor: 'pointer',
                background: 'var(--gray-50)',
                width: '100%', border: 'none', font: 'inherit', color: 'inherit', textAlign: 'left',
              }}
            >
              <span style={{ color: 'var(--text-muted)', fontSize: '12px', width: '14px', textAlign: 'center', flexShrink: 0 }}>
                {isAreaOpen ? '▾' : '▸'}
              </span>
              <span style={{
                fontFamily: 'ui-monospace, monospace', fontSize: '12px', fontWeight: 700,
                color: 'var(--text-strong)', background: 'var(--border)', padding: '3px 8px',
                borderRadius: '5px', flexShrink: 0,
              }}>
                {area.code}
              </span>
              <span style={{ fontSize: '14px', color: 'var(--text-strong)', fontWeight: 600, flex: 1 }}>
                {area.name}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                {roll.punches > 0 && (
                  <span style={{
                    fontSize: '11px', fontWeight: 600, color: 'var(--danger-700)',
                    background: 'var(--danger-50)', padding: '2px 8px', borderRadius: '999px',
                    border: '1px solid var(--danger-200)',
                  }}>
                    ● {roll.punches} Cat-A
                  </span>
                )}
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{roll.tags} tags</span>
                <ProgressBar pct={roll.pct} />
                <span style={{ fontSize: '12px', fontWeight: 700, color: roll.pct === 100 ? 'var(--success-700)' : 'var(--text-strong)', width: '36px', textAlign: 'right' }}>
                  {roll.pct}%
                </span>
              </span>
            </button>

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
