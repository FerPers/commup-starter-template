'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { useSearchParams } from 'next/navigation'
import TagQuickViewModal from '@/components/TagQuickViewModal'
import { upsertHotspot, deleteHotspot } from '@/app/actions/pid-hotspots'

// Point to the worker we copied to public/ — safe for Cloudflare Workers runtime
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

// ── Types ────────────────────────────────────────────────────

type HotspotTag = {
  id: string; tag_number: string; description: string; status: string
  discipline: { id: string; code: string; name: string; color: string }
  open_punches_a: number
  itr_completion_pct: number
}

type Hotspot = {
  id: string; tag_id: string; page_num: number; x_pct: number; y_pct: number
  tag: Pick<HotspotTag, 'id' | 'tag_number' | 'description' | 'status'>
  discipline: { id: string; code: string; name: string; color: string }
  open_punches_a: number
  itr_completion_pct: number
}

type TagItem = {
  id: string; tag_number: string; description: string; status: string
  discipline: { id: string; code: string; name: string; color: string }
}

interface Props {
  signedUrl: string
  hotspots: Hotspot[]
  tags: TagItem[]
  projectId: string
  docId: string
  canEdit: boolean
}

// ── Tag Selector ─────────────────────────────────────────────

function TagSelector({
  tags,
  value,
  onChange,
}: {
  tags: TagItem[]
  value: string | null
  onChange: (id: string | null) => void
}) {
  const t = useTranslations('PidDocuments')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selected = value ? tags.find(t => t.id === value) : null
  const filtered = query
    ? tags.filter(t =>
        t.tag_number.toLowerCase().includes(query.toLowerCase()) ||
        t.description.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 30)
    : tags.slice(0, 30)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: '200px' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '6px 10px', background: 'var(--card-bg)', border: '1px solid var(--border)',
          borderRadius: '7px', fontSize: '12px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '6px', minWidth: '200px',
          color: selected ? 'var(--text-strong)' : 'var(--gray-400)',
        }}
      >
        {selected ? (
          <>
            <span style={{
              padding: '1px 5px', borderRadius: '4px', fontSize: '10px', fontWeight: 700,
              background: `${selected.discipline.color}18`, color: selected.discipline.color, flexShrink: 0,
            }}>
              {selected.discipline.code}
            </span>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>{selected.tag_number}</span>
            <button
              onClick={e => { e.stopPropagation(); onChange(null); setQuery('') }}
              aria-label="Limpiar selección"
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', fontSize: '14px', padding: 0 }}
            >×</button>
          </>
        ) : (
          <span>{t('viewer.tagSelectorPlaceholder')}</span>
        )}
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px',
          background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, overflow: 'hidden',
        }}>
          <div style={{ padding: '8px' }}>
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('viewer.tagSearchPlaceholder')}
              aria-label={t('viewer.tagSearchPlaceholder')}
              style={{
                width: '100%', padding: '6px 10px', border: '1px solid var(--border)',
                borderRadius: '6px', fontSize: '12px', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '12px', fontSize: '12px', color: 'var(--gray-400)', textAlign: 'center' }}>
                {t('viewer.tagSearchEmpty')}
              </div>
            ) : filtered.map(item => (
              <div
                key={item.id}
                onClick={() => { onChange(item.id); setOpen(false); setQuery('') }}
                style={{
                  padding: '7px 12px', cursor: 'pointer', fontSize: '12px',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--gray-50)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{
                  padding: '1px 5px', borderRadius: '4px', fontSize: '10px', fontWeight: 700,
                  background: `${item.discipline.color}18`, color: item.discipline.color, flexShrink: 0,
                }}>
                  {item.discipline.code}
                </span>
                <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: 'var(--text-strong)' }}>{item.tag_number}</span>
                <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────

export default function PidViewer({ signedUrl, hotspots: initialHotspots, tags, projectId, docId, canEdit }: Props) {
  const t = useTranslations('PidDocuments')
  const searchParams = useSearchParams()
  const highlightTagId = searchParams.get('tag')

  const [numPages, setNumPages] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [scale, setScale] = useState(1.0)
  const [editMode, setEditMode] = useState(false)
  const [placingTag, setPlacingTag] = useState<string | null>(null)
  const [pendingPos, setPendingPos] = useState<{ x: number; y: number } | null>(null)
  const [hotspots, setHotspots] = useState<Hotspot[]>(initialHotspots)
  const [selectedHotspot, setSelectedHotspot] = useState<Hotspot | null>(null)
  const [isPending, startTransition] = useTransition()
  const [pageWidth, setPageWidth] = useState(900)
  const [dragCursor, setDragCursor] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null)
  const wasDraggingRef = useRef(false)

  // Highlight tag hotspot from URL param on mount
  useEffect(() => {
    if (!highlightTagId) return
    const match = hotspots.find(h => h.tag_id === highlightTagId)
    if (match) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Initialize page + hotspot from URL highlightTagId param when arriving with a deep link
      setCurrentPage(match.page_num)
      setSelectedHotspot(match)
    }
  }, [highlightTagId]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Exit edit mode when no tag is selected
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Clear pending position when leaving placement mode so a stale ghost marker doesn't render
    if (!placingTag) setPendingPos(null)
  }, [placingTag])

  function handleOverlayMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (!editMode || !placingTag) return
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

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false
      return
    }
    if (!editMode || !placingTag) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setPendingPos({ x, y })
  }

  function handleConfirmHotspot() {
    if (!placingTag || !pendingPos) return
    const tagData = tags.find(t => t.id === placingTag)
    if (!tagData) return

    const optimistic: Hotspot = {
      id: `temp-${Date.now()}`,
      tag_id: placingTag,
      page_num: currentPage,
      x_pct: pendingPos.x,
      y_pct: pendingPos.y,
      tag: { id: tagData.id, tag_number: tagData.tag_number, description: tagData.description, status: tagData.status },
      discipline: tagData.discipline,
      open_punches_a: 0,
      itr_completion_pct: 0,
    }

    setHotspots(prev => [...prev.filter(h => !(h.tag_id === placingTag && h.page_num === currentPage)), optimistic])
    setPendingPos(null)
    setPlacingTag(null)

    startTransition(async () => {
      const result = await upsertHotspot({
        pid_document_id: docId,
        tag_id: placingTag,
        project_id: projectId,
        page_num: currentPage,
        x_pct: pendingPos.x,
        y_pct: pendingPos.y,
      })
      if (result.id) {
        setHotspots(prev => prev.map(h => h.id === optimistic.id ? { ...h, id: result.id! } : h))
      }
    })
  }

  function handleDeleteHotspot(hotspotId: string) {
    setHotspots(prev => prev.filter(h => h.id !== hotspotId))
    setSelectedHotspot(null)
    startTransition(async () => {
      await deleteHotspot({ hotspot_id: hotspotId, project_id: projectId, pid_document_id: docId })
    })
  }

  const pageHotspots = hotspots.filter(h => h.page_num === currentPage)
  const selectedTagData = selectedHotspot ? {
    id: selectedHotspot.tag.id,
    tag_number: selectedHotspot.tag.tag_number,
    description: selectedHotspot.tag.description,
    status: selectedHotspot.tag.status,
    discipline: selectedHotspot.discipline,
    open_punches_a: selectedHotspot.open_punches_a,
    open_punches_b: 0,
    itr_completion_pct: selectedHotspot.itr_completion_pct,
  } : null

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Left toolbar */}
      <div style={{
        width: '260px', minWidth: '260px', background: 'var(--card-bg)',
        borderRight: '1px solid var(--border)', padding: '16px 12px',
        display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto',
      }}>
        {/* Page navigation */}
        {numPages > 1 && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
              {t('viewer.pageLabel')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                style={{ padding: '5px 10px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--card-bg)', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '13px' }}
              >‹</button>
              <span style={{ fontSize: '13px', color: 'var(--text-strong)', flex: 1, textAlign: 'center' }}>
                {currentPage} / {numPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
                disabled={currentPage >= numPages}
                style={{ padding: '5px 10px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--card-bg)', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '13px' }}
              >›</button>
            </div>
          </div>
        )}

        {/* Zoom */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
            {t('viewer.zoomLabel')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setScale(s => Math.max(0.5, +(s - 0.25).toFixed(2)))}
              style={{ padding: '5px 10px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--card-bg)', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '13px' }}
            >−</button>
            <span style={{ fontSize: '13px', color: 'var(--text-strong)', flex: 1, textAlign: 'center' }}>
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => setScale(s => Math.min(3, +(s + 0.25).toFixed(2)))}
              style={{ padding: '5px 10px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--card-bg)', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '13px' }}
            >+</button>
          </div>
        </div>

        {/* Edit mode + tag selector */}
        {canEdit && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
              {t('viewer.editSectionLabel')}
            </div>
            <button
              onClick={() => { setEditMode(e => !e); setPlacingTag(null); setPendingPos(null) }}
              style={{
                width: '100%', padding: '7px 12px', borderRadius: '7px', fontSize: '12px', fontWeight: 500,
                cursor: 'pointer', marginBottom: '8px',
                background: editMode ? '#eff6ff' : 'var(--card-bg)',
                color: editMode ? '#2563eb' : 'var(--text-muted)',
                border: `1px solid ${editMode ? '#bfdbfe' : 'var(--border)'}`,
              }}
            >
              {editMode ? t('viewer.editModeOn') : t('viewer.editModeOff')}
            </button>
            {editMode && (
              <>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  {t('viewer.editStep1')}
                </div>
                <TagSelector tags={tags} value={placingTag} onChange={setPlacingTag} />
                {placingTag && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#2563eb', padding: '8px 10px', background: '#eff6ff', borderRadius: '7px', border: '1px solid #bfdbfe' }}>
                    {t('viewer.editStep2')}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Hotspot list for this page */}
        {pageHotspots.length > 0 && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
              {t('viewer.tagListLabel', { count: pageHotspots.length })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {pageHotspots.map(h => (
                <div
                  key={h.id}
                  onClick={() => setSelectedHotspot(h)}
                  style={{
                    padding: '6px 8px', borderRadius: '6px', cursor: 'pointer',
                    border: '1px solid #f1f5f9', background: selectedHotspot?.id === h.id ? '#eff6ff' : 'var(--card-bg)',
                    display: 'flex', alignItems: 'center', gap: '6px',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (selectedHotspot?.id !== h.id) (e.currentTarget as HTMLElement).style.background = 'var(--gray-50)' }}
                  onMouseLeave={e => { if (selectedHotspot?.id !== h.id) (e.currentTarget as HTMLElement).style.background = 'var(--card-bg)' }}
                >
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: h.discipline.color, flexShrink: 0, display: 'inline-block' }} />
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px', fontWeight: 600, color: 'var(--text-strong)' }}>{h.tag.tag_number}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main PDF area */}
      <div
        ref={containerRef}
        style={{ flex: 1, overflow: 'auto', background: 'var(--text-muted)', padding: '16px' }}
      >
        {/* width:max-content can exceed the container (unlike fit-content which caps at it).
            margin:0 auto centers when PDF < container; resolves to 0 when PDF > container
            so the left edge is always at scrollLeft=0 — no inaccessible left overflow. */}
        <div style={{ width: 'max-content', margin: '0 auto', position: 'relative', userSelect: 'none' }}>
          {/* PDF Document */}
          <Document
            file={signedUrl}
            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
            loading={
              <div style={{ width: `${pageWidth * scale}px`, height: '600px', background: 'var(--card-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)' }}>
                {t('viewer.pdfLoading')}
              </div>
            }
            error={
              <div style={{ width: `${pageWidth}px`, padding: '40px', background: 'var(--card-bg)', color: '#ef4444', borderRadius: '8px' }}>
                {t('viewer.pdfError')}
              </div>
            }
          >
            <Page
              pageNumber={currentPage}
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
              cursor: editMode && placingTag ? (dragCursor ? 'grabbing' : 'crosshair') : 'default',
              pointerEvents: editMode && placingTag ? 'auto' : 'none',
              zIndex: 5,
            }}
          />

          {/* Hotspot pins */}
          {pageHotspots.map(h => (
            <div
              key={h.id}
              onClick={() => { setSelectedHotspot(h) }}
              title={h.tag.tag_number}
              style={{
                position: 'absolute',
                left: `${h.x_pct}%`,
                top: `${h.y_pct}%`,
                transform: 'translate(-50%, -50%)',
                width: 20, height: 20,
                borderRadius: '50%',
                background: h.discipline.color,
                border: `2px solid white`,
                cursor: 'pointer',
                zIndex: 10,
                boxShadow: selectedHotspot?.id === h.id
                  ? `0 0 0 3px ${h.discipline.color}60`
                  : '0 2px 4px rgba(0,0,0,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'box-shadow 0.15s',
              }}
            >
              <span style={{ fontSize: '8px', color: '#fff', fontWeight: 700, lineHeight: 1 }}>
                {h.discipline.code.substring(0, 1)}
              </span>
            </div>
          ))}

          {/* Pending hotspot pin (before confirm) */}
          {pendingPos && (
            <div style={{
              position: 'absolute',
              left: `${pendingPos.x}%`,
              top: `${pendingPos.y}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: 20,
            }}>
              {/* Ghost pin */}
              <div style={{
                width: 20, height: 20, borderRadius: '50%',
                background: '#3b82f6', border: '2px solid white',
                boxShadow: '0 0 0 3px rgba(59,130,246,0.4)',
                marginBottom: '4px',
              }} />
              {/* Confirmation popover */}
              <div style={{
                position: 'absolute', top: '28px', left: '50%', transform: 'translateX(-50%)',
                background: 'var(--card-bg)', borderRadius: '8px', padding: '10px 12px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.2)', border: '1px solid var(--border)',
                display: 'flex', gap: '8px', whiteSpace: 'nowrap',
              }}>
                <button
                  onClick={e => { e.stopPropagation(); handleConfirmHotspot() }}
                  disabled={isPending}
                  style={{
                    padding: '5px 12px', background: '#3b82f6', color: '#fff',
                    border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 500,
                  }}
                >
                  {isPending ? '…' : t('viewer.confirm')}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setPendingPos(null) }}
                  style={{
                    padding: '5px 12px', background: 'var(--card-bg)', color: 'var(--text-muted)',
                    border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
                  }}
                >
                  {t('viewer.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tag Quick View Modal */}
      {selectedHotspot && selectedTagData && (
        <div style={{ position: 'relative' }}>
          <TagQuickViewModal
            tag={selectedTagData}
            projectId={projectId}
            onClose={() => setSelectedHotspot(null)}
          />
          {canEdit && (
            <div style={{
              position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
              zIndex: 60,
            }}>
              <button
                onClick={() => handleDeleteHotspot(selectedHotspot.id)}
                disabled={isPending}
                style={{
                  padding: '8px 16px', background: '#fef2f2', color: '#dc2626',
                  border: '1px solid #fecaca', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: 500,
                }}
              >
                {t('viewer.removeHotspot')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}