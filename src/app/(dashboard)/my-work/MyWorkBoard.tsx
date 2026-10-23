'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ChipGroup } from '@/lib/my-work/queues'

export type BoardQueue = {
  key: string
  label: string
  /** Pendientes de la cola (contador SQL, o filas cargadas si hay filtro de proyecto) */
  total: number
  /** Con filtro de proyecto y más filas que las cargadas: se muestra «20+» */
  capped: boolean
  rows: ReactNode[]
  moreHref: string
}
export type BoardGroup = { group: ChipGroup; label: string; queues: BoardQueue[] }
export type BoardLabels = {
  all: string; upToDate: string; upToDateHere: string; noPending: string
  /** «Ver los {n} →» (marcador {n}: las funciones no pasan del servidor al cliente) */
  seeAll: string
  project: string; allProjects: string
}

/** Paleta por grupo (maqueta N1). */
const G: Record<ChipGroup, { fg: string; bg: string }> = {
  execute: { fg: 'var(--orange-800)', bg: 'var(--orange-50)' },
  verify: { fg: 'var(--primary-700)', bg: 'var(--primary-50)' },
  sign: { fg: 'var(--violet-800)', bg: 'var(--violet-50)' },
  decide: { fg: 'var(--danger-700)', bg: 'var(--danger-50)' },
}
/** Filas por cola dentro de una columna; el resto en la pestaña del grupo. */
const COLUMN_ROWS = 3

const countText = (q: BoardQueue) => (q.capped ? `${q.rows.length}+` : String(q.total))

/**
 * Mi trabajo en columnas (N1, maqueta aprobada 2026-10-21): «Todo» = Ejecutar · Verificar · Firmar · Decidir;
 * cada pestaña de grupo = lista completa. Colas en 0 en gris y sin desplegar. El filtro de proyecto no se
 * recuerda (siempre arranca en «Todos») y no aparece si la org tiene un solo proyecto.
 */
export default function MyWorkBoard({ groups, labels, projects, currentProject }: {
  groups: BoardGroup[]
  labels: BoardLabels
  projects: { id: string; code: string; name: string }[]
  currentProject: string | null
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'all' | ChipGroup>('all')
  // Abierta por defecto: la primera cola con algo de cada columna.
  const [open, setOpen] = useState<Set<string>>(() => new Set(groups.map(g => g.queues.find(q => q.total > 0)?.key).filter((k): k is string => !!k)))
  const toggle = (k: string) => setOpen(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })

  const groupTotal = (g: BoardGroup) => g.queues.reduce((a, q) => a + q.total, 0)
  const total = groups.reduce((a, g) => a + groupTotal(g), 0)
  const tabs: { key: 'all' | ChipGroup; label: string; n: number }[] = [
    { key: 'all', label: labels.all, n: total },
    ...groups.map(g => ({ key: g.group, label: g.label, n: groupTotal(g) })),
  ]
  const current = tab === 'all' ? null : groups.find(g => g.group === tab) ?? null

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div role="tablist" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, flex: 1 }}>
          {tabs.map(x => {
            const sel = tab === x.key
            return (
              <button key={x.key} type="button" role="tab" aria-selected={sel} onClick={() => setTab(x.key)}
                style={{ minHeight: 40, padding: '0 16px', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'inherit',
                  border: `1px solid ${sel ? 'var(--sidebar-bg)' : 'var(--border)'}`, background: sel ? 'var(--sidebar-bg)' : 'var(--card-bg)', color: sel ? '#fff' : 'var(--text-strong)' }}>
                {x.label}
                <span style={{ borderRadius: 999, padding: '0 7px', fontSize: 12, fontVariantNumeric: 'tabular-nums', background: sel ? 'var(--brand-orange)' : 'var(--gray-100)', color: sel ? 'var(--brand-navy)' : 'var(--text-strong)' }}>{x.n}</span>
              </button>
            )
          })}
        </div>
        {projects.length > 1 && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            {labels.project}
            <select value={currentProject ?? ''} onChange={e => router.push(e.target.value ? `/my-work?project=${e.target.value}` : '/my-work')}
              style={{ minHeight: 40, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-strong)', padding: '0 10px', fontSize: 'var(--text-sm)' }}>
              <option value="">{labels.allProjects}</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {/* Todo: cuatro columnas */}
      {!current && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, alignItems: 'start' }}>
          {groups.map(g => {
            const n = groupTotal(g)
            return (
              <section key={g.group} aria-label={g.label} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                <button type="button" onClick={() => setTab(g.group)}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '14px 16px', background: G[g.group].bg, color: G[g.group].fg, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{g.label}</span>
                  <span style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
                </button>
                {n === 0 && <p style={{ margin: 0, padding: '10px 16px 0', fontSize: 'var(--text-sm)', color: 'var(--success-700)', fontWeight: 600 }}>{labels.upToDate}</p>}
                <div style={{ padding: '6px 0 8px' }}>
                  {g.queues.map(q => {
                    const zero = q.total === 0
                    const isOpen = !zero && open.has(q.key)
                    return (
                      <div key={q.key}>
                        <button type="button" onClick={() => { if (!zero) toggle(q.key) }} aria-expanded={zero ? undefined : isOpen} disabled={zero}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'transparent', border: 'none', cursor: zero ? 'default' : 'pointer', textAlign: 'left', fontFamily: 'inherit', fontSize: 'var(--text-sm)' }}>
                          <span style={{ flex: 1, color: zero ? 'var(--text-muted)' : 'var(--text-strong)', fontWeight: zero ? 400 : 600 }}>{q.label}</span>
                          <span style={{ minWidth: 28, textAlign: 'center', borderRadius: 999, padding: '2px 8px', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                            background: zero ? 'var(--gray-100)' : G[g.group].bg, color: zero ? 'var(--text-muted)' : G[g.group].fg }}>{countText(q)}</span>
                          <span style={{ width: 12, color: 'var(--text-muted)' }} aria-hidden="true">{zero ? null : isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
                        </button>
                        {isOpen && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '2px 12px 8px' }}>
                            {q.rows.slice(0, COLUMN_ROWS)}
                            {q.total > COLUMN_ROWS && (
                              <button type="button" onClick={() => setTab(g.group)}
                                style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none', padding: '4px 2px', color: 'var(--primary-700)', fontWeight: 600, fontSize: 'var(--text-sm)', cursor: 'pointer', fontFamily: 'inherit' }}>
                                {labels.seeAll.replace('{n}', countText(q))}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* Pestaña de un grupo: lista completa de cada cola con algo; las vacías, en una línea */}
      {current && (() => {
        const withItems = current.queues.filter(q => q.total > 0)
        const zero = current.queues.filter(q => q.total === 0)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {withItems.length === 0 && (
              <p style={{ margin: 0, padding: '22px 18px', textAlign: 'center', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', color: 'var(--success-700)', fontWeight: 600 }}>{labels.upToDateHere}</p>
            )}
            {withItems.map(q => (
              <section key={q.key} style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--gray-100)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-strong)', margin: 0, flex: 1 }}>{q.label}</h2>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, background: G[current.group].bg, color: G[current.group].fg, padding: '2px 8px', borderRadius: 999, fontVariantNumeric: 'tabular-nums' }}>{countText(q)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px' }}>{q.rows}</div>
                {(q.capped || q.total > q.rows.length) && (
                  <Link href={q.moreHref} style={{ display: 'block', padding: '9px 18px', borderTop: '1px solid var(--gray-100)', fontSize: 'var(--text-sm)', color: 'var(--primary-700)', fontWeight: 600, textDecoration: 'none' }}>
                    {labels.seeAll.replace('{n}', countText(q))}
                  </Link>
                )}
              </section>
            ))}
            {zero.length > 0 && (
              <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{labels.noPending} {zero.map(q => q.label).join(' · ')}</p>
            )}
          </div>
        )
      })()}
    </div>
  )
}
