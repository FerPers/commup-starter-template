'use client'

// Lista de zonas de una matriz C&E leída por zonas (decisión de Luis, 2026-10-29; src/lib/ce/zones.ts): cada zona
// es una propuesta de la IA que se revisa y se guarda aparte, con el código «<prefijo>-NN» y el sistema elegidos aquí.

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { ReviewState } from '@/lib/ce/import'

export type ZoneStatus = 'pending' | 'reading' | 'ready' | 'error' | 'saved' | 'discarded'
export type ZoneRun = {
  title: string
  status: ZoneStatus
  review?: ReviewState
  revision?: string
  sourceDocument?: string
  error?: string
  matrixId?: string
}

const field = { width: '100%', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--card-bg)', color: 'var(--text-strong)', fontSize: '12px', boxSizing: 'border-box' } as const
const button = { padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-strong)', cursor: 'pointer', fontSize: '12px' } as const
const STATUS_COLOR: Record<ZoneStatus, string> = {
  pending: 'var(--text-muted)', reading: 'var(--primary-700)', ready: 'var(--violet-700)', error: 'var(--danger-700)', saved: 'var(--success-700)', discarded: 'var(--text-muted)',
}

export function zoneCode(prefix: string, index: number): string {
  return `${prefix.trim() || 'CE'}-${String(index + 1).padStart(2, '0')}`
}

export default function CeZoneList({ projectId, runs, prefix, systemId, systems, onPrefix, onSystem, onOpen, onRetry, onRestart }: {
  projectId: string
  runs: ZoneRun[]
  prefix: string
  systemId: string
  systems: { id: string; code: string; name: string }[]
  onPrefix: (v: string) => void
  onSystem: (v: string) => void
  onOpen: (index: number) => void
  onRetry: (index: number) => void
  onRestart: () => void
}) {
  const ti = useTranslations('CeMatrix.import.zones')
  const saved = runs.filter(r => r.status === 'saved').length
  const busy = runs.some(r => r.status === 'pending' || r.status === 'reading')
  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', maxWidth: '760px' }}>
        <label style={{ fontSize: '12px' }}>{ti('prefix')}<input style={field} maxLength={50} value={prefix} onChange={e => onPrefix(e.target.value)} placeholder="CE-FG" /></label>
        <label style={{ fontSize: '12px' }}>{ti('system')}
          <select style={field} value={systemId} onChange={e => onSystem(e.target.value)}>
            <option value="">—</option>{systems.map(s => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
          </select>
        </label>
        <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>{ti('hint')}</p>
      </div>

      <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>{ti('summary', { saved, total: runs.length })}</p>
      <section style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '12px', width: '100%' }}>
          <thead><tr>{[ti('col.code'), ti('col.zone'), ti('col.content'), ti('col.status'), ''].map((h, i) => <th key={i} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{h || <span className="sr-only">{ti('col.actions')}</span>}</th>)}</tr></thead>
          <tbody>{runs.map((r, i) => {
            const doubts = r.review ? r.review.causes.filter(c => c.uncertain || !c.tagMatched).length + r.review.effects.filter(e => e.uncertain || !e.tagMatched).length : 0
            return (
              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 10px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{zoneCode(prefix, i)}</td>
                <td style={{ padding: '6px 10px', minWidth: '240px' }}>{r.title}</td>
                <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>
                  {r.review && ti('content', { causes: r.review.causes.length, effects: r.review.effects.length, links: r.review.links.length })}
                  {doubts > 0 && <span style={{ color: 'var(--warning-700)' }}> · {ti('doubts', { n: doubts })}</span>}
                  {r.error && <span style={{ color: 'var(--danger-700)' }}>{r.error}</span>}
                </td>
                <td style={{ padding: '6px 10px', color: STATUS_COLOR[r.status], fontWeight: 600, whiteSpace: 'nowrap' }}>{ti(`status.${r.status}`)}</td>
                <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                  {(r.status === 'ready' || r.status === 'discarded') && <button type="button" style={button} onClick={() => onOpen(i)}>{ti('review')}</button>}
                  {r.status === 'error' && <button type="button" style={button} disabled={busy} onClick={() => onRetry(i)}>{ti('retry')}</button>}
                  {r.status === 'saved' && r.matrixId && <Link href={`/projects/${projectId}/ce-matrices/${r.matrixId}`} style={{ fontSize: '12px', color: 'var(--primary-700)' }}>{ti('open')}</Link>}
                </td>
              </tr>
            )
          })}</tbody>
        </table>
      </section>
      <div><button type="button" style={button} disabled={busy} onClick={onRestart}>{ti('restart')}</button></div>
    </div>
  )
}
