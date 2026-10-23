'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  acceptItrSuggestionAction,
  rejectItrSuggestionAction,
} from '@/app/actions/itr-suggestions'

export type ItrSuggestion = {
  id: string
  signal_tag: string | null
  signal_value: number | null
  signal_unit: string | null
  sampled_at: string | null
  message: string | null
  suggested_at: string
  expires_at: string | null
  pre_filled_data: Record<string, unknown>
}

export default function SuggestionsBar({ suggestions }: { suggestions: ItrSuggestion[] }) {
  const router = useRouter()
  const t = useTranslations('ItrSuggestions')
  const [items, setItems] = useState<ItrSuggestion[]>(suggestions)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (items.length === 0) return null

  const handle = (id: string, accept: boolean) => {
    setError(null)
    startTransition(async () => {
      const res = accept
        ? await acceptItrSuggestionAction(id)
        : await rejectItrSuggestionAction(id)
      if ('error' in res && res.error) return setError(res.error)
      setItems(curr => curr.filter(s => s.id !== id))
      router.refresh()
    })
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {error && (
        <div style={{
          padding: 10, background: 'var(--danger-50)', border: '1px solid var(--danger-200)',
          borderRadius: 6, color: 'var(--danger-800)', fontSize: 13, marginBottom: 10,
        }}>{error}</div>
      )}
      {items.map(s => (
        <div
          key={s.id}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
            background: 'var(--primary-50)', border: '1px solid var(--primary-200)', borderRadius: 8,
            marginBottom: 8,
          }}
        >
          <div style={{
            width: 28, height: 28, borderRadius: '50%', background: 'var(--primary-600)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: 700, flexShrink: 0, fontSize: 14,
          }}>⚡</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary-900)' }}>
              {t('title')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--primary-800)', marginTop: 2 }}>
              {s.message ?? t('defaultMessage', {
                tag: s.signal_tag ?? '—',
                value: s.signal_value?.toFixed(3) ?? '—',
                unit:  s.signal_unit ?? '',
              })}
            </div>
            {s.expires_at && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {t('expiresAt')}: {new Date(s.expires_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
              </div>
            )}
          </div>
          <button
            onClick={() => handle(s.id, true)}
            disabled={isPending}
            style={{
              padding: '6px 12px', background: 'var(--primary-600)', color: 'white',
              border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {t('accept')}
          </button>
          <button
            onClick={() => handle(s.id, false)}
            disabled={isPending}
            style={{
              padding: '6px 12px', background: 'white', color: 'var(--text-secondary)',
              border: '1px solid var(--gray-300)', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {t('reject')}
          </button>
        </div>
      ))}
    </div>
  )
}
