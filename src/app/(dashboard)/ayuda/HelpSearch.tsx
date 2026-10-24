'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { searchHelp, type HelpEntry } from '@/lib/help/search'

// N3b: buscador de la ayuda (en el navegador, sobre el texto de todas las secciones).
export default function HelpSearch({ sections, base = '/ayuda?s=' }: { sections: HelpEntry[]; base?: string }) {
  const t = useTranslations('Help')
  const [q, setQ] = useState('')
  const hits = useMemo(() => searchHelp(sections, q), [sections, q])

  return (
    <div style={{ padding: '0 4px' }}>
      <label htmlFor="help-search" style={{ display: 'block', fontSize: 12, fontWeight: 700, letterSpacing: '.05em', color: 'var(--text-muted)', margin: '0 6px 6px', textTransform: 'uppercase' }}>
        {t('search')}
      </label>
      <input id="help-search" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t('searchPlaceholder')}
        style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--card-bg)', color: 'var(--text-strong)', fontFamily: 'inherit' }} />
      {q.trim().length >= 2 && (
        <ul aria-live="polite" style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }}>
          {hits.length === 0 && <li style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 6px' }}>{t('noResults')}</li>}
          {hits.map(h => (
            <li key={h.id}>
              <Link href={`${base}${encodeURIComponent(h.id)}`} onClick={() => setQ('')}
                style={{ display: 'block', padding: '6px', borderRadius: 6, textDecoration: 'none' }} className="create-option">
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>{h.title}</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>{h.snippet}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
