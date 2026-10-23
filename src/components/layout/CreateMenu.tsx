'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, ChevronDown, X } from 'lucide-react'
import { NAV_STORAGE } from '@/lib/constants/navigation'
import { createContextFromPath, createHref, createKindsFor, type CreateContext, type CreateKind } from '@/lib/create/catalog'
import { readRecents } from './CommandPalette'

// N3b: ＋ Crear desde donde estés. En el Topbar es un menú; en el teléfono (roles de campo) lo abre el ＋ de la barra
// inferior como hoja. Lo que se precarga sale de la ruta (proyecto, tag o sistema de la ficha abierta).

export type CreateProject = { id: string; name: string }

type Snapshot = {
  ctx: CreateContext
  /** Proyecto elegido cuando la pantalla no es de un proyecto. */
  chosen: string
  /** Código de la ficha abierta (de los recientes de ⌘K, que la ficha anota al abrirse). */
  objectRef: string | null
  back: string
}

function recentProjectIds(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(NAV_STORAGE.recentProjects) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}

function snapshot(pathname: string, projects: readonly CreateProject[]): Snapshot {
  const ctx = createContextFromPath(pathname)
  const base = ctx.projectId && (ctx.tagId ?? ctx.systemId)
    ? `/projects/${ctx.projectId}/${ctx.tagId ? `tags/${ctx.tagId}` : `systems/${ctx.systemId}`}` : null
  const objectRef = base ? readRecents().find(r => r.href === base)?.ref ?? null : null
  const recent = recentProjectIds().find(id => projects.some(p => p.id === id))
  return {
    ctx,
    chosen: ctx.projectId ?? recent ?? projects[0]?.id ?? '',
    objectRef,
    back: `${window.location.pathname}${window.location.search}`.slice(0, 500),
  }
}

function CreateOptions({ kinds, projects, snap, onChoose, onPick }: {
  kinds: CreateKind[]
  projects: readonly CreateProject[]
  snap: Snapshot
  onChoose: (projectId: string) => void
  onPick: () => void
}) {
  const t = useTranslations('Create')
  const inProject = !!snap.ctx.projectId
  const projectId = snap.ctx.projectId ?? snap.chosen
  const projectName = projects.find(p => p.id === projectId)?.name ?? ''
  const objectLabel = snap.ctx.tagId ? t('thisTag') : snap.ctx.systemId ? t('thisSystem') : null

  if (!projectId) return <p style={{ margin: 0, padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>{t('noProjects')}</p>

  return (
    <>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {inProject ? (
          <>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', color: 'var(--text-muted)' }}>{t('preloaded')}</span>
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={chip}>{projectName}</span>
              {objectLabel && <span style={{ ...chip, fontFamily: 'ui-monospace, monospace' }}>{snap.objectRef ?? objectLabel}</span>}
            </span>
          </>
        ) : (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            {t('createIn')}
            <select value={projectId} onChange={e => onChoose(e.target.value)}
              style={{ flex: 1, minWidth: 0, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--card-bg)', color: 'var(--text-strong)', fontFamily: 'inherit' }}>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        {!objectLabel && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('tagHint')}</span>}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 6 }}>
        {kinds.map(k => (
          <li key={k}>
            <Link href={createHref(k, { ...snap.ctx, projectId }, snap.back)} onClick={onPick}
              style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 12px', minHeight: 44, boxSizing: 'border-box', borderRadius: 8, textDecoration: 'none' }}
              className="create-option">
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>{t(`kind.${k}`)}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t(`hint.${k}`)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

/** Menú del Topbar. `hideOnTabbar`: en el teléfono lo reemplaza el ＋ de la barra inferior. */
export default function CreateMenu({ role, projects, hideOnTabbar }: { role: string; projects: readonly CreateProject[]; hideOnTabbar?: boolean }) {
  const t = useTranslations('Create')
  const pathname = usePathname()
  const kinds = createKindsFor(role)
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!snap) return
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setSnap(null) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [snap])

  if (!kinds.length) return null

  return (
    <div ref={wrapRef} role="presentation" style={{ position: 'relative' }} className={hideOnTabbar ? 'create-trigger-wrap is-tabbar' : 'create-trigger-wrap'}
      onKeyDown={e => { if (e.key === 'Escape' && snap) { setSnap(null); triggerRef.current?.focus() } }}>
      <button ref={triggerRef} type="button" aria-haspopup="true" aria-expanded={!!snap} aria-label={t('open')} className="create-trigger"
        onClick={() => setSnap(s => s ? null : snapshot(pathname, projects))}
        style={{ height: 36, padding: '0 12px', border: 'none', borderRadius: 8, background: 'var(--primary-500)', color: '#fff', fontSize: 'var(--text-sm)', fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'inherit' }}>
        <Plus size={16} aria-hidden="true" />
        <span className="create-trigger-label">{t('button')}</span>
        <ChevronDown size={14} aria-hidden="true" className="create-trigger-label" />
      </button>
      {snap && (
        <div style={{ position: 'absolute', right: 0, top: 44, zIndex: 150, width: 320, maxWidth: 'calc(100vw - 24px)', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 16px 40px rgba(13,30,50,.22)' }}>
          <CreateOptions kinds={kinds} projects={projects} snap={snap} onChoose={id => setSnap(s => s && { ...s, chosen: id })} onPick={() => setSnap(null)} />
        </div>
      )}
    </div>
  )
}

/** Hoja inferior del teléfono (la abre el ＋ de MobileTabBar). */
export function CreateSheet({ role, projects, onClose }: { role: string; projects: readonly CreateProject[]; onClose: () => void }) {
  const t = useTranslations('Create')
  const pathname = usePathname()
  const [snap, setSnap] = useState<Snapshot>(() => snapshot(pathname, projects))
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { closeRef.current?.focus() }, [])

  return (
    <div role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(13,30,50,.45)', display: 'flex', alignItems: 'flex-end' }}>
      <div role="dialog" aria-modal="true" aria-label={t('title')}
        style={{ width: '100%', maxHeight: '85dvh', overflowY: 'auto', background: 'var(--card-bg)', borderRadius: '16px 16px 0 0', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 8px 0 16px' }}>
          <strong style={{ fontSize: 16, color: 'var(--text-strong)' }}>{t('title')}</strong>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={t('close')}
            style={{ width: 44, height: 44, border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <CreateOptions kinds={createKindsFor(role)} projects={projects} snap={snap} onChoose={id => setSnap(s => ({ ...s, chosen: id }))} onPick={onClose} />
      </div>
    </div>
  )
}

const chip: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'var(--gray-50)', border: '1px solid var(--border)', color: 'var(--text-strong)',
}
