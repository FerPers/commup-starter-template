'use client'

import { useState, useEffect, useId, useRef } from 'react'
import { useTranslations } from 'next-intl'
import type { Item, Signature, SigningRole } from './types'
import { DialogSurface } from '@/components/ui'

// ── Sign Modal (canvas drawing pad) ──────────────────────────────────

export default function SignModal({
  itrNumber,
  itrSignatures,
  requiredRoles,
  allowedRoles,
  ready,
  criticalBlocked,
  isPending,
  signError,
  onClose,
  onSign,
}: {
  itrNumber: string
  itrSignatures: Signature[]
  /** S04: solo los roles que exige este ITR. */
  requiredRoles: SigningRole[]
  allowedRoles: SigningRole[]
  ready: boolean
  criticalBlocked: Item[]
  isPending: boolean
  signError: string | null
  onClose: () => void
  onSign: (role: 'executor' | 'supervisor' | 'client', signatureImage: string) => void
}) {
  const t = useTranslations('ItrExecution')
  const titleId = useId()
  const [signRole, setSignRole] = useState<'executor' | 'supervisor' | 'client'>(() => {
    return allowedRoles[0] ?? 'executor'
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)

  // Init canvas stroke style
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.fillStyle = '#0f172a'
  }, [])

  function getPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    setIsDrawing(true)
    setHasDrawn(true)
    const pt = getPoint(e)
    lastPoint.current = pt
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, 1.2, 0, Math.PI * 2)
    ctx.fill()
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing) return
    const ctx = canvasRef.current!.getContext('2d')!
    const pt = getPoint(e)
    ctx.beginPath()
    ctx.moveTo(lastPoint.current!.x, lastPoint.current!.y)
    ctx.lineTo(pt.x, pt.y)
    ctx.stroke()
    lastPoint.current = pt
  }

  function onPointerUp() {
    setIsDrawing(false)
    lastPoint.current = null
  }

  function clearCanvas() {
    const canvas = canvasRef.current!
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
  }

  const blocked = criticalBlocked.length > 0
  const cannotSign = !ready || !allowedRoles.includes(signRole) || isPending || blocked || !hasDrawn

  return (
    <div
      role="presentation"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <DialogSurface onClose={isPending ? undefined : onClose} labelledBy={titleId} style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h2 id={titleId} style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px' }}>{t('signModal.title')}</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 18px' }}>{itrNumber}</p>

        {/* Role selector */}
        <div role="group" aria-labelledby={`${titleId}-as`} style={{ marginBottom: '18px' }}>
          <span id={`${titleId}-as`} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '8px' }}>{t('signModal.signAs')}</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            {requiredRoles.map(role => {
              const alreadySigned = itrSignatures.some(s => s.role === role)
              return (
                <button
                  key={role}
                  onClick={() => allowedRoles.includes(role) && setSignRole(role)}
                  disabled={alreadySigned || !allowedRoles.includes(role)}
                  aria-pressed={signRole === role}
                  style={{ flex: 1, padding: '10px 8px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, border: '2px solid', borderColor: signRole === role ? 'var(--violet-600)' : 'var(--border)', background: alreadySigned ? 'var(--gray-50)' : signRole === role ? 'var(--violet-50)' : 'var(--card-bg)', color: alreadySigned ? 'var(--gray-400)' : signRole === role ? 'var(--violet-600)' : 'var(--gray-700)', cursor: alreadySigned ? 'not-allowed' : 'pointer', textAlign: 'center' }}
                >
                  {alreadySigned ? '✓ ' : ''}{t(`roles.${role}` as Parameters<typeof t>[0])}
                </button>
              )
            })}
          </div>
        </div>

        {/* Canvas drawing pad */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)' }}>{t('signModal.signatureLabel')}</span>
            <button onClick={clearCanvas} style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
              {t('signModal.clearCanvas')}
            </button>
          </div>
          <div style={{ position: 'relative', border: '1.5px solid var(--border)', borderRadius: '8px', overflow: 'hidden', background: 'var(--gray-50)' }}>
            <canvas
              ref={canvasRef}
              width={392}
              height={160}
              style={{ display: 'block', width: '100%', height: '160px', cursor: 'crosshair', touchAction: 'none' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            />
            {!hasDrawn && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <span style={{ fontSize: '13px', color: 'var(--gray-300)' }}>{t('signModal.placeholder')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Critical blocker warning */}
        {blocked && (
          <div style={{ padding: '10px 14px', background: 'var(--danger-100)', borderRadius: '8px', marginBottom: '16px' }}>
            <p style={{ fontSize: '12px', color: 'var(--danger-500)', margin: 0, fontWeight: 600 }}>
              {t('signModal.blockedMsg', { count: criticalBlocked.length })}
            </p>
          </div>
        )}

        {signError && (
          <p style={{ fontSize: '12px', color: 'var(--danger-500)', padding: '8px 12px', background: 'var(--danger-100)', borderRadius: '6px', margin: '0 0 16px' }}>
            {signError}
          </p>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '9px 16px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            {t('signModal.cancel')}
          </button>
          <button
            onClick={() => { if (!cannotSign) onSign(signRole, canvasRef.current!.toDataURL('image/png')) }}
            disabled={cannotSign}
            style={{ padding: '9px 20px', background: cannotSign ? 'var(--violet-200)' : 'var(--violet-600)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: cannotSign ? 'not-allowed' : 'pointer' }}
          >
            {isPending ? t('signModal.signing') : t('signModal.confirm')}
          </button>
        </div>
      </DialogSurface>
    </div>
  )
}
