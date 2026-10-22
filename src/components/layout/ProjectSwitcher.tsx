'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ChevronDown, Check } from 'lucide-react'
import { NAV_STORAGE } from '@/lib/constants/navigation'

const MAX_RECENT = 3
const MAX_LISTED = 8

function readRecent(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(NAV_STORAGE.recentProjects) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}

/** Anota un proyecto como reciente (más nuevo primero, sin repetir). */
export function rememberRecentProject(id: string) {
  try {
    const next = [id, ...readRecent().filter(x => x !== id)].slice(0, 10)
    window.localStorage.setItem(NAV_STORAGE.recentProjects, JSON.stringify(next))
  } catch { /* sin almacenamiento: se ignora */ }
}

/**
 * Selector de proyecto en el encabezado del bloque Proyecto (N1, H-17a): búsqueda, recientes y todos.
 * Cambiar de proyecto lleva a su Resumen.
 */
export default function ProjectSwitcher({ currentId, projectNames }: { currentId: string | null; projectNames: Record<string, string> }) {
  const t = useTranslations('Sidebar.groups')
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [recent, setRecent] = useState<string[]>([])
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lee los recientes al abrir (localStorage no existe en SSR)
    setRecent(readRecent().filter(id => projectNames[id]))
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open, projectNames])

  const all = useMemo(() => Object.entries(projectNames).sort((a, b) => a[1].localeCompare(b[1])), [projectNames])
  const needle = q.trim().toLowerCase()
  const matches = needle ? all.filter(([, name]) => name.toLowerCase().includes(needle)) : all
  const label = currentId ? projectNames[currentId] ?? '…' : t('pickProject')

  const item = (id: string, name: string) => (
    <Link key={id} href={`/projects/${id}`} onClick={() => setOpen(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', fontSize: 13, color: 'var(--text-strong)', textDecoration: 'none',
        background: id === currentId ? 'var(--primary-50, #eef2ff)' : 'transparent' }}>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      {id === currentId && <Check size={14} aria-hidden="true" />}
    </Link>
  )

  return (
    <div ref={box} style={{ position: 'relative', margin: '2px 10px 6px' }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="true" title={t('switchProject')}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 'var(--radius-md)',
          background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', fontSize: 'var(--text-sm)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div role="dialog" aria-label={t('switchProject')}
          style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, width: 280, zIndex: 50, background: 'var(--card-bg, #fff)', color: 'var(--text-strong)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: '0 12px 32px rgba(15,23,42,0.18)', overflow: 'hidden' }}>
          <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
            <input type="search" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={t('searchProject')} aria-label={t('searchProject')}
              style={{ width: '100%', boxSizing: 'border-box', height: 36, border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', fontSize: 13, background: 'var(--card-bg, #fff)', color: 'var(--text-strong)' }} />
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {!needle && recent.length > 0 && (
              <>
                <div style={{ padding: '8px 12px 2px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('recent')}</div>
                {recent.slice(0, MAX_RECENT).map(id => item(id, projectNames[id]))}
              </>
            )}
            <div style={{ padding: '8px 12px 2px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('allProjects')} ({matches.length})</div>
            {matches.slice(0, MAX_LISTED).map(([id, name]) => item(id, name))}
          </div>
          <Link href="/projects" onClick={() => setOpen(false)} style={{ display: 'block', padding: '10px 12px', borderTop: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--primary-600, #4f46e5)', textDecoration: 'none' }}>
            {t('seeAllProjects')}
          </Link>
        </div>
      )}
    </div>
  )
}
