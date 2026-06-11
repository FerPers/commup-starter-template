'use client'

// Modal de firma del PSSR (canvas) — extraído de PssrReviewForm.tsx (Q4).

import { useState, useTransition, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { addPssrSignature } from '@/app/actions/pssr'
import { PSSR_ALREADY_SIGNED } from '@/lib/constants/pssr'
import type { Signature } from './pssr-review-shared'

export default function PssrSignModal({
  reviewId, projectId, currentUserName, onSigned, onClose,
}: {
  reviewId: string
  projectId: string
  currentUserName: string
  onSigned: (sig: Signature) => void
  onClose: () => void
}) {
  const t = useTranslations('PSSR')
  const [isPending, startTransition] = useTransition()
  const [discipline, setDiscipline] = useState('')
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)
  const [signError, setSignError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
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
    setIsDrawing(true); setHasDrawn(true)
    const pt = getPoint(e)
    lastPoint.current = pt
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.beginPath(); ctx.arc(pt.x, pt.y, 1.2, 0, Math.PI * 2); ctx.fill()
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing) return
    const ctx = canvasRef.current!.getContext('2d')!
    const pt = getPoint(e)
    ctx.beginPath(); ctx.moveTo(lastPoint.current!.x, lastPoint.current!.y)
    ctx.lineTo(pt.x, pt.y); ctx.stroke()
    lastPoint.current = pt
  }

  function clearCanvas() {
    canvasRef.current!.getContext('2d')!.clearRect(0, 0, 392, 160)
    setHasDrawn(false)
  }

  function handleSign() {
    setSignError(null)
    const signatureData = canvasRef.current!.toDataURL('image/png')
    startTransition(async () => {
      const res = await addPssrSignature({ reviewId, projectId, discipline, signatureData })
      if (res.error) {
        setSignError(res.error === PSSR_ALREADY_SIGNED ? t('review.errorAlreadySigned') : res.error)
        return
      }
      onSigned({
        id: crypto.randomUUID(),
        user_id: '', discipline, signature_data: signatureData,
        signed_at: new Date().toISOString(),
        profiles: { full_name: currentUserName, id: '' },
      })
    })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--card-bg)', borderRadius: '16px', padding: '28px',
        width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 16px' }}>
          {t('signModal.title')}
        </h3>

        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>
            {t('signModal.disciplineLabel')}
          </label>
          <input
            value={discipline}
            onChange={e => setDiscipline(e.target.value)}
            placeholder={t('signModal.disciplinePlaceholder')}
            list="pssr-disciplines"
            style={{
              width: '100%', padding: '9px 12px', borderRadius: '8px',
              border: '1.5px solid #d1d5db', fontSize: '13px', outline: 'none',
              boxSizing: 'border-box', fontFamily: 'inherit',
            }}
          />
          <datalist id="pssr-disciplines">
            {['Process Engineer','HSE Lead','Operations Manager','Maintenance Lead',
              'Commissioning Lead','Electrical Engineer','Instrument Engineer',
              'Mechanical Engineer','Project Manager','QAQC Lead'].map(d => <option key={d} value={d} />)}
          </datalist>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)' }}>{t('signModal.signatureLabel')}</label>
          <button onClick={clearCanvas} style={{ background: 'none', border: 'none', fontSize: '12px', color: 'var(--gray-400)', cursor: 'pointer' }}>
            {t('signModal.clear')}
          </button>
        </div>
        <div style={{ border: '1.5px solid var(--border)', borderRadius: '8px', overflow: 'hidden', background: 'var(--gray-50)', marginBottom: '20px' }}>
          <canvas
            ref={canvasRef}
            width={432}
            height={160}
            style={{ display: 'block', width: '100%', height: '160px', cursor: 'crosshair', touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => setIsDrawing(false)}
            onPointerLeave={() => setIsDrawing(false)}
          />
        </div>

        {signError && (
          <div style={{
            padding: '10px 12px', borderRadius: '8px', background: '#fef2f2',
            border: '1px solid #fecaca', color: '#dc2626', fontSize: '12px', fontWeight: 500,
            marginBottom: '14px',
          }}>
            {signError}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
            background: 'var(--gray-100)', border: 'none', cursor: 'pointer', color: 'var(--gray-700)',
          }}>
            {t('signModal.cancel')}
          </button>
          <button
            onClick={handleSign}
            disabled={isPending || !hasDrawn}
            style={{
              padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              background: isPending || !hasDrawn ? '#ddd6fe' : '#7c3aed', color: '#fff', border: 'none',
              cursor: isPending || !hasDrawn ? 'not-allowed' : 'pointer',
            }}
          >
            {isPending ? t('signModal.saving') : t('signModal.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
