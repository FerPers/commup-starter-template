'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { normalizeRotation, pointerToUnit, type PageSize, type Pt } from '@/lib/pid/geometry'
import { scrollToBox, zoomToBox, type Box } from '@/lib/pid/view'
import type { PageInfo } from './types'

// Point to the worker we copied to public/ — safe for Cloudflare Workers runtime
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

export const MIN_SCALE = 0.5
export const MAX_SCALE = 3

// Lienzo del visor: la hoja del PDF, el desplazamiento (arrastrar con el mouse, un dedo nativo) y el pellizco de dos
// dedos. Las capas (pines y, desde P2, marcas) van como hijos encima de la hoja, en la misma caja, así que se
// posicionan en porcentaje (pines) o en unidad 0..1 (marcas) de la página.
// P2: `interaction` = 'none' (scroll nativo; los hijos reciben los clics), 'pan' (arrastrar mueve) o 'point' (un clic
// devuelve el punto en unidad 0..1 y arrastrar mueve). `onPageInfo` da el tamaño y la rotación de la hoja.
// P3 (maqueta «Tableta»): en 'point' con el dedo, un dedo dibuja (al soltar entrega el punto; mientras arrastra, el
// tramo elástico) y dos dedos mueven y hacen zoom; el clic de compatibilidad que sigue al toque se ignora. `focus`
// encuadra una caja de la hoja (abrir el plano en un sistema con `?system=`).
export default function PidCanvas({
  signedUrl,
  pageNumber,
  scale,
  onScale,
  onNumPages,
  interaction,
  onPoint,
  onDoublePoint,
  onHover,
  onPageInfo,
  focus,
  children,
}: {
  signedUrl: string
  pageNumber: number
  scale: number
  onScale: (update: (s: number) => number) => void
  onNumPages: (n: number) => void
  interaction: 'none' | 'pan' | 'point'
  /** Clic sin arrastre sobre la hoja: posición en unidad 0..1 (acotada al borde). */
  onPoint?: (unit: Pt) => void
  onDoublePoint?: (unit: Pt) => void
  /** Puntero sobre la hoja (null al salir): la línea elástica mientras se dibuja. */
  onHover?: (unit: Pt | null) => void
  onPageInfo?: (info: PageInfo) => void
  /** Caja (unidad 0..1) a encuadrar; `key` distinto = encuadrar otra vez. */
  focus?: { box: Box; key: number } | null
  children?: ReactNode
}) {
  const t = useTranslations('PidDocuments')
  // P3: cada guardado revalida la página y llega una URL firmada nueva del mismo PDF; con la primera se evita volver a
  // descargar y dibujar la hoja (perdía zoom y desplazamiento a mitad del trazo). El visor monta un lienzo por revisión.
  const [fileUrl] = useState(signedUrl)
  const [pageWidth, setPageWidth] = useState(900)
  // El encuadre espera el ancho real del lienzo (con el inicial de 900 px la escala salía 1).
  const [measured, setMeasured] = useState(false)
  const [dragCursor, setDragCursor] = useState(false)
  const [pinchPreview, setPinchPreview] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null)
  const wasDraggingRef = useRef(false)
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const [pageSize, setPageSize] = useState<PageSize | null>(null)
  const focusedKeyRef = useRef<number | null>(null)
  // Caja a centrar cuando la hoja termine de dibujarse a `scale` (un render a la escala anterior no cuenta).
  const pendingScrollRef = useRef<{ box: Box; scale: number } | null>(null)
  // Dedos sobre la capa de dibujo (P3) y momento del último toque (para ignorar el clic de compatibilidad).
  const touchesRef = useRef(new Map<number, { x: number; y: number }>())
  const gestureRef = useRef<{ kind: 'draw' } | { kind: 'pinch'; dist: number; mid: { x: number; y: number }; startScale: number } | { kind: 'done' } | null>(null)
  const lastTouchRef = useRef(0)
  // Vista previa del pellizco en un ref: los eventos de puntero llegan más rápido que los renders.
  const pinchPreviewRef = useRef<number | null>(null)
  const scaleRef = useRef(scale)
  useEffect(() => { scaleRef.current = scale }, [scale])

  // Track container width for responsive PDF rendering
  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w && w > 100) { setPageWidth(Math.min(w - 32, 1200)); setMeasured(true) }
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  function applyScroll(box: Box) {
    const el = containerRef.current, inner = pageRef.current
    if (!el || !inner) return
    const r = inner.getBoundingClientRect()
    const pos = scrollToBox(box, { w: r.width, h: r.height }, { w: el.clientWidth, h: el.clientHeight })
    el.scrollLeft = pos.left
    el.scrollTop = pos.top
  }

  // Encuadre: escala que contiene la caja y, cuando la hoja termina de dibujarse a esa escala, el desplazamiento.
  const focusKey = focus?.key
  useEffect(() => {
    if (!focus || !pageSize || !measured || !containerRef.current || focusedKeyRef.current === focus.key) return
    focusedKeyRef.current = focus.key
    const el = containerRef.current
    const target = zoomToBox(focus.box, pageSize, { w: el.clientWidth - 32, h: el.clientHeight - 32 }, pageWidth, MAX_SCALE)
    pendingScrollRef.current = { box: focus.box, scale: target }
    if (target === scaleRef.current) {
      requestAnimationFrame(() => { if (pendingScrollRef.current) { applyScroll(pendingScrollRef.current.box); pendingScrollRef.current = null } })
    } else {
      onScale(() => target)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se encuadra una vez por `focus.key`, cuando ya se conoce la hoja
  }, [focusKey, pageSize, measured])

  const active = interaction !== 'none'
  const recentTouch = () => Date.now() - lastTouchRef.current < 700

  function handleOverlayMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (!active || recentTouch()) return
    wasDraggingRef.current = false
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: containerRef.current?.scrollLeft ?? 0,
      scrollTop: containerRef.current?.scrollTop ?? 0,
    }
  }

  function handleOverlayMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (recentTouch()) return
    if (!dragRef.current) {
      if (interaction === 'point') onHover?.(pointerToUnit(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()))
      return
    }
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

  function handleOverlayMouseLeave() {
    handleOverlayMouseUp()
    onHover?.(null)
  }

  // Pinch-to-zoom: preview via CSS transform durante el gesto (barato),
  // commit del scale real (re-raster de react-pdf) solo al soltar.
  function touchDist(touches: React.TouchList) {
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.hypot(dx, dy)
  }

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    // En 'point' los dedos los maneja la capa de dibujo (handleOverlayPointer*).
    if (interaction === 'point') return
    if (e.touches.length === 2) {
      pinchRef.current = { startDist: touchDist(e.touches), startScale: scale }
    }
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (interaction === 'point' || !pinchRef.current || e.touches.length !== 2) return
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

  // ── Dedo sobre la capa de dibujo (P3) ─────────────────────────────────────
  function twoFinger() {
    const [a, b] = [...touchesRef.current.values()]
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
  }

  function handleOverlayPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (interaction !== 'point' || e.pointerType === 'mouse') return
    lastTouchRef.current = Date.now()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* puntero ya liberado: sin captura */ }
    touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (touchesRef.current.size === 1) {
      gestureRef.current = { kind: 'draw' }
      onHover?.(pointerToUnit(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()))
    } else if (touchesRef.current.size === 2) {
      // El segundo dedo cancela el punto en curso: ahora se mueve y se hace zoom.
      onHover?.(null)
      gestureRef.current = { kind: 'pinch', ...twoFinger(), startScale: scaleRef.current }
    }
  }

  function handleOverlayPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (interaction !== 'point' || e.pointerType === 'mouse' || !touchesRef.current.has(e.pointerId)) return
    lastTouchRef.current = Date.now()
    touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gestureRef.current
    if (g?.kind === 'draw') {
      onHover?.(pointerToUnit(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()))
    } else if (g?.kind === 'pinch' && touchesRef.current.size >= 2) {
      const now = twoFinger()
      const el = containerRef.current
      if (el) { el.scrollLeft -= now.mid.x - g.mid.x; el.scrollTop -= now.mid.y - g.mid.y }
      const target = Math.min(MAX_SCALE, Math.max(MIN_SCALE, g.startScale * (now.dist / g.dist)))
      pinchPreviewRef.current = target / scaleRef.current
      setPinchPreview(pinchPreviewRef.current)
      gestureRef.current = { ...g, mid: now.mid }
    }
  }

  function handleOverlayPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (interaction !== 'point' || e.pointerType === 'mouse' || !touchesRef.current.has(e.pointerId)) return
    lastTouchRef.current = Date.now()
    const g = gestureRef.current
    touchesRef.current.delete(e.pointerId)
    if (g?.kind === 'draw' && touchesRef.current.size === 0 && e.type === 'pointerup') {
      onHover?.(null)
      onPoint?.(pointerToUnit(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()))
    } else if (g?.kind === 'pinch' && touchesRef.current.size < 2) {
      const preview = pinchPreviewRef.current
      pinchPreviewRef.current = null
      setPinchPreview(null)
      if (preview) onScale(s => +Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * preview)).toFixed(2))
      // El dedo que queda no dibuja: el gesto termina cuando se levantan todos.
      gestureRef.current = { kind: 'done' }
    }
    if (touchesRef.current.size === 0) gestureRef.current = null
  }

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (recentTouch()) return
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false
      return
    }
    if (interaction !== 'point') return
    onPoint?.(pointerToUnit(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()))
  }

  function handleOverlayDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (interaction !== 'point' || recentTouch()) return
    onDoublePoint?.(pointerToUnit(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()))
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
      <div ref={pageRef} style={{
        width: 'max-content', margin: '0 auto', position: 'relative', userSelect: 'none',
        transform: pinchPreview ? `scale(${pinchPreview})` : undefined,
        transformOrigin: 'center top',
      }}>
        <Document
          file={fileUrl}
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
            onLoadSuccess={page => {
              const vp = page.getViewport({ scale: 1 })
              setPageSize(prev => (prev && prev.w === vp.width && prev.h === vp.height ? prev : { w: vp.width, h: vp.height }))
              onPageInfo?.({ w: vp.width, h: vp.height, rotation: normalizeRotation(page.rotate) })
            }}
            onRenderSuccess={() => {
              const pending = pendingScrollRef.current
              if (pending && pending.scale === scale) { applyScroll(pending.box); pendingScrollRef.current = null }
            }}
          />
        </Document>

        {/* Capa de captura: sin pointer-events en 'none' para que el scroll nativo y los clics sobre pines y marcas
            funcionen; activa, queda encima de pines y marcas (dibujar sobre un pin no lo abre). */}
        <div
          onClick={handleOverlayClick}
          onDoubleClick={handleOverlayDoubleClick}
          onMouseDown={handleOverlayMouseDown}
          onMouseMove={handleOverlayMouseMove}
          onMouseUp={handleOverlayMouseUp}
          onMouseLeave={handleOverlayMouseLeave}
          onPointerDown={handleOverlayPointerDown}
          onPointerMove={handleOverlayPointerMove}
          onPointerUp={handleOverlayPointerUp}
          onPointerCancel={handleOverlayPointerUp}
          style={{
            position: 'absolute', inset: 0,
            cursor: dragCursor ? 'grabbing' : interaction === 'point' ? 'crosshair' : interaction === 'pan' ? 'grab' : 'default',
            pointerEvents: active ? 'auto' : 'none',
            // P3: dibujando, el navegador no desplaza con el dedo (un dedo dibuja, dos mueven).
            touchAction: interaction === 'point' ? 'none' : undefined,
            zIndex: 15,
          }}
        />

        {children}
      </div>
    </div>
  )
}
