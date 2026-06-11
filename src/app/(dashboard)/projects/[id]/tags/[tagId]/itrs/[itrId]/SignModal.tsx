'use client'

import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import type { Item, Signature } from './types'

// ── Sign Modal (canvas drawing pad) ──────────────────────────────────

export default function SignModal({
  itrNumber,
  itrSignatures,
  criticalBlocked,
  isPending,
  signError,
  onClose,
  onSign,
}: {
  itrNumber: string
  itrSignatures: Signature[]
  criticalBlocked: Item[]
  isPending: boolean
  signError: string | null
  onClose: () => void
  onSign: (role: 'executor' | 'supervisor' | 'client', signatureImage: string) => void
}) {
  const t = useTranslations('ItrExecution')
  const [signRole, setSignRole] = useState<'executor' | 'supervisor' | 'client'>(() => {
    const roles = ['executor', 'supervisor', 'client'] as const
    return roles.find(r => !itrSignatures.some(s => s.role === r)) ?? 'executor'
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

  const blocked = signRole === 'executor' && criticalBlocked.length > 0

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px' }}>{t('signModal.title')}</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 18px' }}>{itrNumber}</p>

        {/* Role selector */}
        <div style={{ marginBottom: '18px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '8px' }}>{t('signModal.signAs')}</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['executor', 'supervisor', 'client'] as const).map(role => {
              const alreadySigned = itrSignatures.some(s => s.role === role)
              return (
                <button
                  key={role}
                  onClick={() => !alreadySigned && setSignRole(role)}
                  disabled={alreadySigned}
                  style={{ flex: 1, padding: '10px 8px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, border: '2px solid', borderColor: signRole === role ? '#7c3aed' : 'var(--border)', background: alreadySigned ? 'var(--gray-50)' : signRole === role ? '#f5f3ff' : 'var(--card-bg)', color: alreadySigned ? 'var(--gray-400)' : signRole === role ? '#7c3aed' : '#374151', cursor: alreadySigned ? 'not-allowed' : 'pointer', textAlign: 'center' }}
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
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)' }}>{t('signModal.signatureLabel')}</label>
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
          <div style={{ padding: '10px 14px', background: '#fee2e2', borderRadius: '8px', marginBottom: '16px' }}>
            <p style={{ fontSize: '12px', color: '#ef4444', margin: 0, fontWeight: 600 }}>
              {t('signModal.blockedMsg', { count: criticalBlocked.length })}
            </p>
          </div>
        )}

        {signError && (
          <p style={{ fontSize: '12px', color: '#ef4444', padding: '8px 12px', background: '#fee2e2', borderRadius: '6px', margin: '0 0 16px' }}>
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
            onClick={() => onSign(signRole, canvasRef.current!.toDataURL('image/png'))}
            disabled={isPending || blocked || !hasDrawn}
            style={{ padding: '9px 20px', background: isPending || blocked || !hasDrawn ? '#ddd6fe' : '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: isPending || blocked || !hasDrawn ? 'not-allowed' : 'pointer' }}
          >
            {isPending ? t('signModal.signing') : t('signModal.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
