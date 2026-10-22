'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { TAG_VIEWS, tagViewQuery, type TagView } from '@/lib/list/tag-view'

// N2c: Lista · Árbol · Tarjetas en la misma página; el modo va en la URL y se conservan los filtros compartidos.
export default function TagModeSwitch({ view }: { view: TagView }) {
  const t = useTranslations('TagsHub')
  const pathname = usePathname()
  const sp = useSearchParams()
  return (
    <div role="group" aria-label={t('modeLabel')} style={{ display: 'inline-flex', padding: 3, borderRadius: 10, background: 'var(--gray-100)', marginBottom: 16 }}>
      {TAG_VIEWS.map(v => {
        const on = v === view
        return (
          <Link key={v} href={`${pathname}${tagViewQuery(new URLSearchParams(sp.toString()), v)}`} aria-current={on ? 'page' : undefined}
            style={{
              minHeight: 38, padding: '0 16px', display: 'inline-flex', alignItems: 'center', borderRadius: 8, textDecoration: 'none',
              fontSize: 'var(--text-sm)', fontWeight: 600, color: on ? 'var(--text-strong)' : 'var(--text-muted)',
              background: on ? 'var(--card-bg)' : 'transparent', boxShadow: on ? '0 1px 3px rgba(20,33,61,.15)' : 'none',
            }}>
            {t(`mode.${v}`)}
          </Link>
        )
      })}
    </div>
  )
}
