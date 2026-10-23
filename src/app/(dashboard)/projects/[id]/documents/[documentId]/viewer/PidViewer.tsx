'use client'

import { useState, useEffect, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import TagQuickViewModal from '@/components/TagQuickViewModal'
import { upsertHotspot, deleteHotspot, confirmHotspots } from '@/app/actions/pid-hotspots'
import { NO_SYSTEM_COLOR } from '@/lib/systems/colors'
import { pinStatusColor, systemsOnDrawing } from '@/lib/pid/pins'
import type { Pt } from '@/lib/pid/geometry'
import PidCanvas, { MAX_SCALE, MIN_SCALE } from './PidCanvas'
import PinLayer from './PinLayer'
import PidLegend from './PidLegend'
import TagSelector from './TagSelector'
import type { ColorBy, Hotspot, TagItem } from './types'

// P1: el visor se separó en lienzo (PidCanvas), capa de pines (PinLayer), leyenda (PidLegend) y selector de tags
// con búsqueda en el servidor (TagSelector). Este componente guarda el estado y arma la barra lateral.

interface Props {
  signedUrl: string
  hotspots: Hotspot[]
  projectId: string
  /** N2d: documento P&ID y revisión abierta (los pines son de la revisión). */
  documentId: string
  revisionId: string
  canEdit: boolean
}

const sectionLabel: React.CSSProperties = {
  fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px',
}
const stepBtn: React.CSSProperties = {
  padding: '5px 10px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--card-bg)', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '13px',
}

export default function PidViewer({ signedUrl, hotspots: initialHotspots, projectId, documentId, revisionId, canEdit }: Props) {
  const t = useTranslations('PidDocuments')
  const searchParams = useSearchParams()
  const highlightTagId = searchParams.get('tag')

  const [numPages, setNumPages] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [scale, setScale] = useState(1.0)
  const [editMode, setEditMode] = useState(false)
  const [placingTag, setPlacingTag] = useState<TagItem | null>(null)
  const [pendingPos, setPendingPos] = useState<Pt | null>(null)
  const [hotspots, setHotspots] = useState<Hotspot[]>(initialHotspots)
  const [selectedHotspot, setSelectedHotspot] = useState<Hotspot | null>(null)
  // Fase 2: colorear por estado (semáforo) o por sistema; clic en la leyenda filtra un sistema.
  const [colorBy, setColorBy] = useState<ColorBy>('status')
  const [systemFilter, setSystemFilter] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isTouch, setIsTouch] = useState(false)

  // Detect coarse pointer (tablet/phone) → larger touch targets
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- matchMedia solo existe en cliente; sincroniza tras montar para evitar mismatch de hidratación
    setIsTouch(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setIsTouch(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

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

  // Exit edit mode when no tag is selected
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Clear pending position when leaving placement mode so a stale ghost marker doesn't render
    if (!placingTag) setPendingPos(null)
  }, [placingTag])

  function handleConfirmHotspot() {
    if (!placingTag || !pendingPos) return
    const tagData = placingTag
    const pos = pendingPos

    const optimistic: Hotspot = {
      id: `temp-${Date.now()}`,
      tag_id: tagData.id,
      page_num: currentPage,
      x_pct: pos.x,
      y_pct: pos.y,
      needs_review: false,
      tag: { id: tagData.id, tag_number: tagData.tag_number, description: tagData.description, status: tagData.status },
      discipline: tagData.discipline,
      system: tagData.system,
      open_punches_a: 0,
      open_punches_b: 0,
      itr_completion_pct: 0,
    }

    setHotspots(prev => [...prev.filter(h => !(h.tag_id === tagData.id && h.page_num === currentPage)), optimistic])
    setPendingPos(null)
    setPlacingTag(null)

    startTransition(async () => {
      const result = await upsertHotspot({
        revision_id: revisionId,
        tag_id: tagData.id,
        project_id: projectId,
        page_num: currentPage,
        x_pct: pos.x,
        y_pct: pos.y,
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
      await deleteHotspot({ hotspot_id: hotspotId, project_id: projectId, document_id: documentId })
    })
  }

  // N2d: confirmar que los pines copiados de la revisión anterior quedaron en su lugar (uno o todos).
  const toReview = hotspots.filter(h => h.needs_review && !h.id.startsWith('temp-'))
  function handleConfirm(ids?: string[]) {
    setHotspots(prev => prev.map(h => (!ids || ids.includes(h.id) ? { ...h, needs_review: false } : h)))
    setSelectedHotspot(sel => (sel && (!ids || ids.includes(sel.id)) ? { ...sel, needs_review: false } : sel))
    startTransition(async () => {
      await confirmHotspots({ project_id: projectId, revision_id: revisionId, hotspot_ids: ids })
    })
  }

  const pageHotspots = hotspots.filter(h => h.page_num === currentPage)
  const docSystems = systemsOnDrawing(hotspots)
  const pinColor = (h: Hotspot) => colorBy === 'system' ? (h.system?.color ?? NO_SYSTEM_COLOR) : pinStatusColor(h)
  const dimmed = (h: Hotspot) => !!systemFilter && h.system?.id !== systemFilter
  const selectedTagData = selectedHotspot ? {
    id: selectedHotspot.tag.id,
    tag_number: selectedHotspot.tag.tag_number,
    description: selectedHotspot.tag.description,
    status: selectedHotspot.tag.status,
    discipline: selectedHotspot.discipline,
    open_punches_a: selectedHotspot.open_punches_a,
    open_punches_b: selectedHotspot.open_punches_b,
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
        {/* N2d: pines copiados de la revisión anterior */}
        {toReview.length > 0 && (
          <div role="status" style={{ padding: '10px 12px', borderRadius: '8px', background: '#fff8ec', border: '1px solid #f6d7a7', fontSize: '12px', color: '#7c4a03', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span>{t('viewer.reviewBanner', { count: toReview.length })}</span>
            {canEdit && (
              <button onClick={() => handleConfirm()} disabled={isPending}
                style={{ minHeight: '36px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #f6d7a7', background: 'var(--card-bg)', color: '#7c4a03', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                {t('viewer.confirmAll')}
              </button>
            )}
          </div>
        )}
        {/* Page navigation */}
        {numPages > 1 && (
          <div>
            <div style={sectionLabel}>{t('viewer.pageLabel')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} style={stepBtn}>‹</button>
              <span style={{ fontSize: '13px', color: 'var(--text-strong)', flex: 1, textAlign: 'center' }}>
                {currentPage} / {numPages}
              </span>
              <button onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} disabled={currentPage >= numPages} style={stepBtn}>›</button>
            </div>
          </div>
        )}

        {/* Zoom */}
        <div>
          <div style={sectionLabel}>{t('viewer.zoomLabel')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={() => setScale(s => Math.max(MIN_SCALE, +(s - 0.25).toFixed(2)))} style={stepBtn}>−</button>
            <span style={{ fontSize: '13px', color: 'var(--text-strong)', flex: 1, textAlign: 'center' }}>
              {Math.round(scale * 100)}%
            </span>
            <button onClick={() => setScale(s => Math.min(MAX_SCALE, +(s + 0.25).toFixed(2)))} style={stepBtn}>+</button>
          </div>
        </div>

        <PidLegend colorBy={colorBy} onColorBy={setColorBy} systems={docSystems} systemFilter={systemFilter} onSystemFilter={setSystemFilter} />

        {/* Edit mode + tag selector */}
        {canEdit && (
          <div>
            <div style={sectionLabel}>{t('viewer.editSectionLabel')}</div>
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
                <TagSelector projectId={projectId} value={placingTag} onChange={setPlacingTag} />
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
            <div style={sectionLabel}>{t('viewer.tagListLabel', { count: pageHotspots.length })}</div>
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
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: pinStatusColor(h), flexShrink: 0, display: 'inline-block' }} />
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px', fontWeight: 600, color: 'var(--text-strong)' }}>{h.tag.tag_number}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main PDF area */}
      <PidCanvas
        signedUrl={signedUrl}
        pageNumber={currentPage}
        scale={scale}
        onScale={setScale}
        onNumPages={setNumPages}
        placing={editMode && !!placingTag}
        onPlace={setPendingPos}
      >
        <PinLayer
          pins={pageHotspots}
          colorOf={pinColor}
          dimmed={dimmed}
          selectedId={selectedHotspot?.id ?? null}
          onSelect={setSelectedHotspot}
          isTouch={isTouch}
          pending={pendingPos}
          pendingBusy={isPending}
          onConfirmPending={handleConfirmHotspot}
          onCancelPending={() => setPendingPos(null)}
        />
      </PidCanvas>

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
              {selectedHotspot.needs_review && (
                <button
                  onClick={() => handleConfirm([selectedHotspot.id])}
                  disabled={isPending}
                  style={{
                    padding: '8px 16px', marginRight: '8px', background: '#fff8ec', color: '#7c4a03',
                    border: '1px solid #f6d7a7', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: 600,
                  }}
                >
                  {t('viewer.confirmOne')}
                </button>
              )}
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
