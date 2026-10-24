'use client'

// N3a (H-17, «Maquetas N3»): buscar cualquier cosa sin saber en qué módulo vive. ⌘K / Ctrl+K o el botón de la barra
// superior. Dentro de un proyecto el alcance por defecto es ese proyecto (un clic a «Todos»); con la caja vacía se ven
// los recientes de este dispositivo. Enter abre el resaltado: el número exacto (TQ-0042) va primero.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Search } from 'lucide-react'
import { searchEverything } from '@/app/actions/search'
import {
  RECENTS_KEY, groupHits, parseRecents, projectFromPath, pushRecent,
  type RecentItem, type SearchHit, type SearchKind,
} from '@/lib/search/catalog'

const KIND_TONE: Partial<Record<SearchKind, { bg: string; fg: string }>> = {
  tag: { bg: 'var(--primary-50)', fg: 'var(--primary-700)' }, system: { bg: 'var(--success-50)', fg: 'var(--success-700)' }, subsystem: { bg: 'var(--success-50)', fg: 'var(--success-700)' },
  itr: { bg: 'var(--violet-50)', fg: 'var(--violet-800)' }, punch: { bg: 'var(--danger-50)', fg: 'var(--danger-700)' }, certificate: { bg: 'var(--warning-50)', fg: 'var(--warning-800)' },
}

export function readRecents(): RecentItem[] {
  try { return parseRecents(window.localStorage.getItem(RECENTS_KEY)) } catch { return [] }
}
/** Registra un objeto abierto (lo usan la paleta y las fichas, vía RememberRecent). */
export function rememberRecent(item: RecentItem) {
  try { window.localStorage.setItem(RECENTS_KEY, JSON.stringify(pushRecent(readRecents(), item))) } catch { /* sin almacenamiento */ }
}

export default function CommandPalette() {
  const t = useTranslations('Search')
  const router = useRouter()
  const pathname = usePathname()
  const projectId = projectFromPath(pathname)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [scope, setScope] = useState<'project' | 'all'>('project')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [recents, setRecents] = useState<RecentItem[]>([])
  const [active, setActive] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const seq = useRef(0)

  const openPalette = useCallback(() => {
    returnFocus.current = document.activeElement as HTMLElement | null
    setRecents(readRecents())
    setScope('project')
    setOpen(true)
  }, [])
  const close = useCallback(() => {
    setOpen(false)
    setQ('')
    setHits([])
    setError(null)
    returnFocus.current?.focus?.()
  }, [])

  // ⌘K / Ctrl+K desde cualquier pantalla (no interfiere con escribir: requiere el modificador).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (open) close(); else openPalette()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close, openPalette])

  useEffect(() => { if (open) inputRef.current?.focus() }, [open])
  // Elegir un resultado cierra la paleta antes de navegar (go).

  const effectiveProject = projectId && scope === 'project' ? projectId : null
  useEffect(() => {
    if (!open) return
    const term = q.trim()
    if (term.length < 2) return  // con menos de 2 caracteres se ven los recientes
    const my = ++seq.current
    const h = setTimeout(() => {
      startTransition(async () => {
        const res = await searchEverything({ q: term, projectId: effectiveProject })
        if (my !== seq.current) return  // llegó una búsqueda más nueva
        if (res.error) { setError(res.error); setHits([]); return }
        setError(null)
        setHits(res.hits ?? [])
        setActive(0)
      })
    }, 200)
    return () => clearTimeout(h)
  }, [q, effectiveProject, open])

  // Cada grupo con la posición de su primer resultado en la lista plana (para el teclado y aria-activedescendant).
  const groups = useMemo(() => {
    const gs = groupHits(hits)
    return gs.map((g, i) => ({ ...g, offset: gs.slice(0, i).reduce((n, x) => n + x.hits.length, 0) }))
  }, [hits])
  const flat = useMemo(() => groups.flatMap(g => g.hits), [groups])
  const showRecents = q.trim().length < 2
  const items: { href: string; kind: SearchKind; ref: string; title: string | null; projectCode?: string }[] = showRecents ? recents : flat

  function go(item: (typeof items)[number]) {
    rememberRecent({ kind: item.kind, ref: item.ref, title: item.title, href: item.href, projectCode: item.projectCode })
    close()
    router.push(item.href)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return }
    if (!items.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % items.length) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + items.length) % items.length) }
    if (e.key === 'Enter') { e.preventDefault(); go(items[Math.min(active, items.length - 1)]) }
  }

  const optionId = (i: number) => `cmdk-opt-${i}`
  const row = (item: (typeof items)[number], i: number) => {
    const tone = KIND_TONE[item.kind] ?? { bg: 'var(--gray-100)', fg: 'var(--text-strong)' }
    const on = i === active
    return (
      <li key={item.href} id={optionId(i)} role="option" aria-selected={on}
        onMouseEnter={() => setActive(i)} onMouseDown={e => { e.preventDefault(); go(item) }}
        style={{ display: 'flex', gap: 12, alignItems: 'center', minHeight: 44, padding: '0 16px', cursor: 'pointer',
          background: on ? 'var(--primary-50)' : 'transparent', boxShadow: on ? 'inset 3px 0 0 var(--primary-500)' : 'none' }}>
        <span style={{ minWidth: 104, padding: '2px 8px', borderRadius: 6, fontSize: 'var(--text-xs)', fontWeight: 600, background: tone.bg, color: tone.fg, whiteSpace: 'nowrap' }}>{t(`kind.${item.kind}`)}</span>
        <strong style={{ fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-sm)', color: 'var(--text-strong)', whiteSpace: 'nowrap' }}>{item.ref}</strong>
        <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title ?? ''}</span>
        {item.projectCode && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{item.projectCode}</span>}
      </li>
    )
  }

  return (
    <>
      <button type="button" onClick={openPalette} aria-label={t('open')} className="cmdk-trigger"
        style={{ height: 36, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--gray-50)', color: 'var(--text-muted)',
          fontSize: 'var(--text-sm)', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'inherit' }}>
        <Search size={15} aria-hidden="true" />
        <span className="cmdk-trigger-label">{t('placeholderShort')}</span>
        <kbd className="cmdk-trigger-label" style={{ marginLeft: 12, fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, padding: '0 5px', fontFamily: 'inherit' }}>⌘K</kbd>
      </button>

      {open && (
        <div role="presentation" className="cmdk-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close() }} onKeyDown={onKeyDown}
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(13,30,50,.45)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '10vh' }}>
          <div role="dialog" aria-modal="true" aria-label={t('title')} className="cmdk-panel"
            style={{ width: 'min(720px, 100vw - 24px)', maxHeight: '70vh', background: 'var(--card-bg)', borderRadius: 14, boxShadow: '0 24px 60px rgba(13,30,50,.35)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <Search size={18} aria-hidden="true" color="var(--text-muted)" />
              <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder={t('placeholder')} aria-label={t('title')}
                role="combobox" aria-expanded={items.length > 0} aria-controls="cmdk-list" aria-autocomplete="list"
                aria-activedescendant={items.length ? optionId(Math.min(active, items.length - 1)) : undefined}
                style={{ flex: '1 1 220px', minWidth: 0, border: 0, outline: 'none', fontSize: 17, color: 'var(--text-strong)', background: 'transparent', minHeight: 36, fontFamily: 'inherit' }} />
              {projectId && (
                <div role="group" aria-label={t('scope')} style={{ display: 'inline-flex', padding: 2, borderRadius: 8, background: 'var(--gray-100)' }}>
                  {(['project', 'all'] as const).map(s => (
                    <button key={s} type="button" aria-pressed={scope === s} onClick={() => { setScope(s); inputRef.current?.focus() }}
                      style={{ minHeight: 32, padding: '0 12px', border: 0, borderRadius: 6, fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        background: scope === s ? 'var(--card-bg)' : 'transparent', color: scope === s ? 'var(--text-strong)' : 'var(--text-muted)' }}>
                      {t(`scope_${s}`)}
                    </button>
                  ))}
                </div>
              )}
              <button type="button" onClick={close} className="cmdk-close" aria-label={t('close')}
                style={{ minHeight: 36, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card-bg)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}>Esc</button>
            </div>

            <div style={{ overflowY: 'auto', padding: '6px 0' }} aria-busy={isPending}>
              {error && !showRecents && <p role="alert" style={{ margin: 0, padding: '16px', color: 'var(--danger-700)', fontSize: 'var(--text-sm)' }}>{error}</p>}
              {showRecents ? (
                recents.length ? (
                  <>
                    <div style={{ padding: '6px 16px', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', color: 'var(--text-muted)' }}>{t('recents')}</div>
                    <ul id="cmdk-list" role="listbox" style={{ listStyle: 'none', margin: 0, padding: 0 }}>{recents.map((r, i) => row(r, i))}</ul>
                  </>
                ) : <p style={{ margin: 0, padding: 16, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>{t('hint')}</p>
              ) : (
                <ul id="cmdk-list" role="listbox" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {groups.map(g => (
                    <li key={g.kind} role="presentation">
                      <div style={{ padding: '8px 16px 4px', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t(`group.${g.kind}`)}</div>
                      <ul role="presentation" style={{ listStyle: 'none', margin: 0, padding: 0 }}>{g.hits.map((h, j) => row(h, g.offset + j))}</ul>
                    </li>
                  ))}
                  {!isPending && !error && flat.length === 0 && (
                    <li role="presentation" style={{ padding: 16, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                      {effectiveProject ? t('noneProject', { q: q.trim() }) : t('none', { q: q.trim() })}
                    </li>
                  )}
                </ul>
              )}
            </div>

            <div className="cmdk-footer" style={{ display: 'flex', gap: 18, padding: '8px 16px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)', background: 'var(--gray-50)', flexWrap: 'wrap' }}>
              <span>{t('keys.move')}</span><span>{t('keys.open')}</span><span>{t('keys.exact')}</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
