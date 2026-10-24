'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { searchPidTags } from '@/app/actions/tag-search'
import type { TagItem } from './types'
import { ink } from '@/lib/theme'

// P1: búsqueda en el servidor por páginas de 30 (antes la página cargaba todos los tags del proyecto).

function DisciplineChip({ discipline }: { discipline: TagItem['discipline'] }) {
  return (
    <span style={{
      padding: '1px 5px', borderRadius: '4px', fontSize: '12px', fontWeight: 700,
      background: `color-mix(in srgb, ${discipline.color} 10%, transparent)`, color: ink(discipline.color), flexShrink: 0,
    }}>
      {discipline.code}
    </span>
  )
}

export default function TagSelector({
  projectId,
  value,
  onChange,
}: {
  projectId: string
  value: TagItem | null
  onChange: (tag: TagItem | null) => void
}) {
  const t = useTranslations('PidDocuments')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [hits, setHits] = useState<TagItem[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [searching, startSearch] = useTransition()
  const ref = useRef<HTMLDivElement>(null)
  // Respuestas que llegan tarde (se escribió otra letra) no pisan la lista actual.
  const seq = useRef(0)

  function load(q: string, offset: number) {
    const n = ++seq.current
    startSearch(async () => {
      const res = await searchPidTags({ projectId, q, offset })
      if (n !== seq.current) return
      const page = res.tags ?? []
      setHits(prev => (offset === 0 ? page : [...prev, ...page]))
      setHasMore(!!res.hasMore)
    })
  }

  // Al abrir y al escribir (con un pequeño retardo) se busca desde la primera página.
  useEffect(() => {
    if (!open) return
    const h = setTimeout(() => load(query, 0), query ? 250 : 0)
    return () => clearTimeout(h)
  }, [open, query]) // eslint-disable-line react-hooks/exhaustive-deps -- load solo depende de projectId (estable)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: '200px' }}>
      {/* G-12: la parte principal es un botón (abre/cierra) y la ✕ va al lado, no adentro. El relleno pasa del
          contenedor a cada botón para que toda la caja siga respondiendo al clic. */}
      <div
        style={{
          background: 'var(--card-bg)', border: '1px solid var(--border)',
          borderRadius: '7px', fontSize: '12px',
          display: 'flex', alignItems: 'center', minWidth: '200px',
          color: value ? 'var(--text-strong)' : 'var(--text-muted)',
        }}
      >
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          style={{
            flex: 1, minWidth: 0, padding: value ? '6px 0 6px 10px' : '6px 10px', background: 'none', border: 'none',
            font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          {value ? (
            <>
              <DisciplineChip discipline={value.discipline} />
              <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>{value.tag_number}</span>
            </>
          ) : (
            <span>{t('viewer.tagSelectorPlaceholder')}</span>
          )}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => { onChange(null); setQuery('') }}
            aria-label={t('viewer.tagClear')}
            style={{ alignSelf: 'stretch', marginLeft: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px', padding: '0 10px 0 0' }}
          >×</button>
        )}
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px',
          background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, overflow: 'hidden',
        }}>
          <div style={{ padding: '8px' }}>
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('viewer.tagSearchPlaceholder')}
              aria-label={t('viewer.tagSearchPlaceholder')}
              style={{
                width: '100%', padding: '6px 10px', border: '1px solid var(--border)',
                borderRadius: '6px', fontSize: '12px', outline: 'none', boxSizing: 'border-box',
                background: 'var(--card-bg)', color: 'var(--text-strong)',
              }}
            />
          </div>
          <div style={{ maxHeight: '240px', overflowY: 'auto' }} aria-busy={searching}>
            {hits.length === 0 ? (
              <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                {searching ? t('viewer.tagSearching') : t('viewer.tagSearchEmpty')}
              </div>
            ) : hits.map(item => (
              <button
                type="button"
                key={item.id}
                onClick={() => { onChange(item); setOpen(false); setQuery('') }}
                style={{
                  font: 'inherit', padding: '7px 12px', cursor: 'pointer', fontSize: '12px',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  transition: 'background 0.1s',
                  width: '100%', border: 'none', background: 'transparent', textAlign: 'left',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--gray-50)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <DisciplineChip discipline={item.discipline} />
                <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: 'var(--text-strong)' }}>{item.tag_number}</span>
                <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</span>
              </button>
            ))}
            {hasMore && hits.length > 0 && (
              <button type="button" disabled={searching} onClick={() => load(query, hits.length)}
                style={{ width: '100%', padding: '8px', border: 'none', borderTop: '1px solid var(--border)', background: 'transparent',
                  color: 'var(--primary-700)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                {searching ? t('viewer.tagSearching') : t('viewer.tagLoadMore')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
