'use client'

// S07 (F-16): la cadena del loop check se ve y se corrige aquí (supervisor+), sin reimportar el índice.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { updateSignalChain } from '@/app/actions/signals'
import { SIGNAL_EDITABLE, type SignalEditable } from '@/lib/signals/editable'

export type SignalChain = Record<SignalEditable, string | number | null>

export default function SignalChainEditor({ projectId, signalId, chain, canEdit }: {
  projectId: string
  signalId: string
  chain: SignalChain
  canEdit: boolean
}) {
  const t = useTranslations('Signals.chain')
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const show = (v: string | number | null) => (v === null || v === '' ? '—' : String(v))

  function start() {
    setDraft(Object.fromEntries(SIGNAL_EDITABLE.map(k => [k, chain[k] === null ? '' : String(chain[k])])))
    setError(null); setEditing(true)
  }
  function save() {
    const patch = Object.fromEntries(SIGNAL_EDITABLE.filter(k => draft[k] !== (chain[k] === null ? '' : String(chain[k]))).map(k => [k, draft[k]]))
    if (!Object.keys(patch).length) { setEditing(false); return }
    startTransition(async () => {
      const res = await updateSignalChain({ projectId, signalId, patch })
      if (res.error) { setError(res.error); return }
      setEditing(false); router.refresh()
    })
  }

  const cell: React.CSSProperties = { background: 'var(--card-bg)', borderRadius: '8px', padding: '10px 12px', border: '1px solid var(--border)' }
  const label: React.CSSProperties = { fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }

  return (
    <div style={{ marginTop: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-body)' }}>{t('title')}</span>
        {canEdit && !editing && (
          <button onClick={start} style={{ padding: '5px 12px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-body)', cursor: 'pointer' }}>{t('edit')}</button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
        {SIGNAL_EDITABLE.map(k => (
          <div key={k} style={cell}>
            <div style={label}>{t(`fields.${k}`)}</div>
            {editing ? (
              <input value={draft[k] ?? ''} onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))}
                inputMode={k === 'range_min' || k === 'range_max' ? 'decimal' : undefined} aria-label={t(`fields.${k}`)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '5px 7px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', fontFamily: 'ui-monospace, monospace', background: 'var(--card-bg)', color: 'var(--text-strong)' }} />
            ) : (
              <div style={{ fontSize: '13px', color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace', wordBreak: 'break-word' }}>{show(chain[k])}</div>
            )}
          </div>
        ))}
      </div>
      {editing && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
          <button onClick={save} disabled={isPending} style={{ padding: '7px 14px', fontSize: '12px', fontWeight: 600, borderRadius: '6px', border: 'none', background: 'var(--primary-600)', color: '#fff', cursor: isPending ? 'wait' : 'pointer' }}>{isPending ? t('saving') : t('save')}</button>
          <button onClick={() => setEditing(false)} style={{ padding: '7px 14px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-muted)', cursor: 'pointer' }}>{t('cancel')}</button>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t('hint')}</span>
        </div>
      )}
      {error && <p role="alert" style={{ fontSize: '12px', color: 'var(--danger-700)', margin: '8px 0 0' }}>{error}</p>}
    </div>
  )
}
