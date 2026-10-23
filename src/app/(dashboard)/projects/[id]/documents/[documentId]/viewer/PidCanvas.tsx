'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { pointerToPct, type Pt } from '@/lib/pid/geometry'

// Point to the worker we copied to public/ — safe for Cloudflare Workers runtime
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

export const MIN_SCALE = 0.5
export const MAX_SCALE = 3

// Lienzo del visor: la hoja del PDF, el desplazamiento (arrastrar con el mouse mientras se ubica, un dedo nativo) y
// el pellizco de dos dedos. Las capas (pines y, desde P2, marcas) van como hijos encima de la hoja, en la misma
// caja, así que se posicionan en porcentaje de la página.
export default function PidCanvas({
  signedUrl,
  pageNumber,
  scale,
  onScale,
  onNumPages,
  placing,
  onPlace,
  children,
}: {
  signedUrl: string
  pageNumber: number
  scale: number
  onScale: (update: (s: number) => number) => void
  onNumPages: (n: number) => void
  /** Ubicando un pin: el clic sobre la hoja devuelve su posición en porcentaje (acotada a 0..100). */
  placing: boolean
  onPlace: (pct: Pt) => void
  children?: ReactNode
}) {
  const t = useTranslations('PidDocuments')
  const [pageWidth, setPageWidth] = useState(900)
  const [dragCursor, setDragCursor] = useState(false)
  const [pinchPreview, setPinchPreview] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null)
  const wasDraggingRef = useRef(false)
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null)

  // Track container width for responsive PDF rendering
  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w && w > 100) setPageWidth(Math.min(w - 32, 1200))
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  function handleOverlayMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (!placing) return
    wasDraggingRef.current = false
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: containerRef.current?.scrollLeft ?? 0,
      scrollTop: containerRef.current?.scrollTop ?? 0,
    }
  }

  function handleOverlayMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      if (!wasDraggingRef.current) {
        wasDraggingRef.current = true
        setDragCursor(true)
      }
      if (containerRef.current) {
        containerRef.current.scrollLeft = dragRef.current.scrollLeft - dx
        containerRef.current.scrollTop = dragRef.current.scrollTop - dy
      }
    }
  }

  function handleOverlayMouseUp() {
    dragRef.current = null
    if (wasDraggingRef.current) setDragCursor(false)
  }

  // Pinch-to-zoom: preview via CSS transform durante el gesto (barato),
  // commit del scale real (re-raster de react-pdf) solo al soltar.
  function touchDist(touches: React.TouchList) {
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.hypot(dx, dy)
  }

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length === 2) {
      pinchRef.current = { startDist: touchDist(e.touches), startScale: scale }
    }
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (!pinchRef.current || e.touches.length !== 2) return
    const factor = touchDist(e.touches) / pinchRef.current.startDist
    const target = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchRef.current.startScale * factor))
    setPinchPreview(target / scale)
  }

  function handleTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    if (pinchRef.current && e.touches.length < 2) {
      const preview = pinchPreview
      pinchRef.current = null
      setPinchPreview(null)
      if (preview) {
        onScale(s => +Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * preview)).toFixed(2))
      }
    }
  }

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false
      return
    }
    if (!placing) return
    onPlace(pointerToPct(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()))
  }

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      style={{
        flex: 1, overflow: 'auto', background: 'var(--text-muted)', padding: '16px',
        // Un dedo = scroll/pan nativo; dos dedos = nuestro pinch-zoom (sin zoom del navegador)
        touchAction: 'pan-x pan-y',
      }}
    >
      {/* width:max-content can exceed the container (unlike fit-content which caps at it).
          margin:0 auto centers when PDF < container; resolves to 0 when PDF > container
          so the left edge is always at scrollLeft=0 — no inaccessible left overflow. */}
      <div style={{
        width: 'max-content', margin: '0 auto', position: 'relative', userSelect: 'none',
        transform: pinchPreview ? `scale(${pinchPreview})` : undefined,
        transformOrigin: 'center top',
      }}>
        <Document
          file={signedUrl}
          onLoadSuccess={({ numPages }) => onNumPages(numPages)}
          loading={
            <div style={{ width: `${pageWidth * scale}px`, height: '600px', background: 'var(--card-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)' }}>
              {t('viewer.pdfLoading')}
            </div>
          }
          error={
            <div style={{ width: `${pageWidth}px`, padding: '40px', background: 'var(--card-bg)', color: 'var(--danger-500)', borderRadius: '8px' }}>
              {t('viewer.pdfError')}
            </div>
          }
        >
          <Page
            pageNumber={pageNumber}
            width={Math.round(pageWidth * scale)}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        </Document>

        {/* Click-capture overlay — pointer-events:none when not placing so native scroll/pan works */}
        <div
          onClick={handleOverlayClick}
          onMouseDown={handleOverlayMouseDown}
          onMouseMove={handleOverlayMouseMove}
          onMouseUp={handleOverlayMouseUp}
          onMouseLeave={handleOverlayMouseUp}
          style={{
            position: 'absolute', inset: 0,
            cursor: placing ? (dragCursor ? 'grabbing' : 'crosshair') : 'default',
            pointerEvents: placing ? 'auto' : 'none',
            zIndex: 5,
          }}
        />

        {children}
      </div>
    </div>
  )
}
