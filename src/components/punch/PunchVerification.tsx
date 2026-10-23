'use client'

import { useId, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { resolvePunch, verifyPunch } from '@/app/actions/punches'
import { punchVerificationRights } from '@/lib/punches/verification'
import { useAskDialog } from '@/components/ui'

// Resolver → verificar en campo (fase 4 · bloque A). Compartido por los modales de punch de la
// lista del proyecto y del tag. Las RPC aplican las reglas; aquí solo se anticipan.

export type VerifiablePunch = {
  id: string
  status: string
  resolved_at?: string | null
  resolved_by?: string | null
  resolved_by_name?: string | null
}

const box: React.CSSProperties = { marginBottom: '20px', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)' }
const area: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '13px',
  fontFamily: 'inherit', background: 'var(--card-bg)', color: 'var(--text-strong)', boxSizing: 'border-box', resize: 'vertical',
}
const btn = (bg: string, color: string, border: string, disabled: boolean): React.CSSProperties => ({
  padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, background: bg, color, border: `1px solid ${border}`,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
})

export function PunchVerification({ punch, projectId, tagId, userId, role, photoCount, onUpdated, formatWhen }: {
  punch: VerifiablePunch
  projectId: string
  tagId?: string | null
  userId: string
  role: string
  /** Fotos del punch, si el modal las conoce: resolver sin fotos pide confirmación. */
  photoCount?: number | null
  onUpdated: () => void
  /** Hora de la resolución con el mismo formato que el resto de la ficha (zona del proyecto, rotulada). */
  formatWhen: (iso: string) => string
}) {
  const t = useTranslations('PunchVerification')
  const uid = useId()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  // G-08: diálogo propio
  const { dialog, confirm } = useAskDialog()
  const rights = punchVerificationRights(punch, userId, role)
  if (!rights.canResolve && !rights.canVerify && !rights.waitingOther) return null

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) { setError(res.error); return }
      setText('')
      onUpdated()
    })
  }

  const base = { punchId: punch.id, projectId, tagId: tagId ?? null }
  const resolve = async () => {
    if (photoCount === 0 && !(await confirm({ message: t('confirmNoPhotos'), confirmLabel: t('resolve') }))) return
    run(() => resolvePunch({ ...base, comment: text }))
  }
  const accept = () => run(() => verifyPunch({ ...base, accept: true, comment: text }))
  const reject = () => run(() => verifyPunch({ ...base, accept: false, comment: text }))

  if (rights.canResolve) {
    const tooShort = text.trim().length < 5
    return (
      <div style={box}>
        {dialog}
        <label htmlFor={`${uid}-resolve`} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-body)', display: 'block', marginBottom: '6px' }}>{t('resolveLabel')}</label>
        <textarea id={`${uid}-resolve`} rows={2} style={area} value={text} placeholder={t('resolvePlaceholder')} onChange={e => setText(e.target.value)} disabled={isPending} />
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap' }}>
          <button type="button" onClick={resolve} disabled={isPending || tooShort} style={btn('#f5f3ff', '#7c3aed', '#ddd6fe', isPending || tooShort)}>
            {t('resolve')}
          </button>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t('resolveHint')}</span>
        </div>
        {error && <div role="alert" style={{ marginTop: '8px', fontSize: '12px', color: 'var(--danger-700)' }}>{error}</div>}
      </div>
    )
  }

  const when = punch.resolved_at ? formatWhen(punch.resolved_at) : ''
  return (
    <div style={{ ...box, background: 'var(--violet-50)', borderColor: 'var(--violet-200)' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--violet-800)' }}>
        {t('resolvedBy', { who: punch.resolved_by_name ?? t('someone'), when })}
      </div>
      {rights.waitingOther && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{t('waitingOther')}</div>}
      {rights.canVerify && (
        <>
          <textarea rows={2} style={{ ...area, marginTop: '8px' }} value={text} placeholder={t('verifyPlaceholder')} onChange={e => setText(e.target.value)} disabled={isPending} />
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
            <button type="button" onClick={accept} disabled={isPending} style={btn('#ecfdf5', '#059669', '#a7f3d0', isPending)}>{t('accept')}</button>
            <button type="button" onClick={reject} disabled={isPending || !text.trim()} style={btn('var(--card-bg)', 'var(--danger-700)', '#fecaca', isPending || !text.trim())}>{t('reject')}</button>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>{t('verifyHint')}</div>
        </>
      )}
      {error && <div role="alert" style={{ marginTop: '8px', fontSize: '12px', color: 'var(--danger-700)' }}>{error}</div>}
    </div>
  )
}
