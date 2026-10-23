'use client'

import { useState, useEffect, useEffectEvent, useMemo, useRef, useTransition, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import TagQuickViewModal from '@/components/TagQuickViewModal'
import { upsertHotspot, deleteHotspot, confirmHotspots } from '@/app/actions/pid-hotspots'
import { createMarkup, updateMarkup, deleteMarkup, confirmMarkups } from '@/app/actions/pid-markups'
import { NO_SYSTEM_COLOR } from '@/lib/systems/colors'
import { pinStatusColor } from '@/lib/pid/pins'
import { clampPct, snapOrthogonal, type Pt } from '@/lib/pid/geometry'
import {
  defaultLimitSides, displayPoints, finishLine, limitBar, markupMetrics, markupSystemIds, nearestLine, type MarkupKind,
} from '@/lib/pid/markups'
import PidCanvas, { MAX_SCALE, MIN_SCALE } from './PidCanvas'
import PinLayer from './PinLayer'
import MarkupLayer from './MarkupLayer'
import PidLegend from './PidLegend'
import ToolRail from './ToolRail'
import TagSelector from './TagSelector'
import { LimitDraftPanel, SelectedMarkupPanel } from './MarkupPanel'
import type { ApprovedGates, ColorBy, Hotspot, MarkupView, PageInfo, SystemRef, TagItem, Tool } from './types'

// P1: el visor se separó en lienzo (PidCanvas), capa de pines (PinLayer), leyenda (PidLegend) y selector de tags.
// P2 (maqueta aprobada): barra de herramientas a la izquierda (Elegir · Mover · Resaltar línea · Límite · Etiqueta ·
// Pin de tag · Deshacer), capa SVG de marcas LOSH (MarkupLayer) y barra derecha con «Sistemas en esta hoja», lo que
// llegó «por revisar» de la revisión anterior y la marca elegida. Dibujan los editores en escritorio y tableta; en el
// teléfono el plano solo se ve (el dibujo táctil llega en P3). Las marcas se guardan en unidad 0..1 de la hoja ya
// rotada, con su tamaño y rotación (`PageInfo`).

interface Props {
  signedUrl: string
  hotspots: Hotspot[]
  markups: MarkupView[]
  /** Sistemas del proyecto (para elegir a qué sistema pertenece una marca). */
  systems: SystemRef[]
  approvedGates: ApprovedGates
  projectId: string
  /** N2d: documento P&ID y revisión abierta (pines y marcas son de la revisión). */
  documentId: string
  revisionId: string
  canEdit: boolean
}

type MarkupPatch = { system_id?: string; other_system_id?: string | null; label?: string | null; points?: Pt[] }
type UndoOp =
  | { type: 'created'; id: string }
  | { type: 'deleted'; markup: MarkupView }
  | { type: 'updated'; before: MarkupView }

const sectionLabel: React.CSSProperties = {
  fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px',
}
const floatBtn: React.CSSProperties = {
  minWidth: 40, height: 40, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card-bg)',
  color: 'var(--text-strong)', fontSize: 13, cursor: 'pointer',
}
const DRAW_TOOLS: Tool[] = ['line', 'limit', 'label']

export default function PidViewer({
  signedUrl, hotspots: initialHotspots, markups: initialMarkups, systems: systemList, approvedGates, projectId, documentId, revisionId, canEdit,
}: Props) {
  const t = useTranslations('PidDocuments')
  const searchParams = useSearchParams()
  const highlightTagId = searchParams.get('tag')

  const [numPages, setNumPages] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [scale, setScale] = useState(1.0)
  const [page, setPage] = useState<PageInfo | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [placingTag, setPlacingTag] = useState<TagItem | null>(null)
  const [pendingPos, setPendingPos] = useState<Pt | null>(null)
  const [hotspots, setHotspots] = useState<Hotspot[]>(initialHotspots)
  const [selectedHotspot, setSelectedHotspot] = useState<Hotspot | null>(null)
  const [markups, setMarkups] = useState<MarkupView[]>(initialMarkups)
  const [selectedMarkupId, setSelectedMarkupId] = useState<string | null>(null)
  const [activeSystem, setActiveSystem] = useState<string | null>(null)
  const [draft, setDraft] = useState<Pt[]>([])
  const [hover, setHover] = useState<Pt | null>(null)
  const [redrawOf, setRedrawOf] = useState<string | null>(null)
  const [pendingLimit, setPendingLimit] = useState<{ bar: [Pt, Pt]; system_id: string | null; other_system_id: string | null } | null>(null)
  const [undoStack, setUndoStack] = useState<UndoOp[]>([])
  const [error, setError] = useState<string | null>(null)
  // Fase 2 / P2: colorear los pines por sistema (por defecto, como la maqueta) o por estado; «Aislar» atenúa el resto.
  const [colorBy, setColorBy] = useState<ColorBy>('system')
  const [isolated, setIsolated] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isTouch, setIsTouch] = useState(false)
  const [wide, setWide] = useState(true)
  // Ids de las marcas optimistas mientras el servidor responde.
  const tempSeq = useRef(0)

  // Puntero grueso (tableta/teléfono) → pines más grandes; ancho < 768 (teléfono) → solo ver.
  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)')
    const desk = window.matchMedia('(min-width: 768px)')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- matchMedia solo existe en cliente; sincroniza tras montar para evitar mismatch de hidratación
    setIsTouch(coarse.matches)
    setWide(desk.matches)
    const onCoarse = (e: MediaQueryListEvent) => setIsTouch(e.matches)
    const onDesk = (e: MediaQueryListEvent) => setWide(e.matches)
    coarse.addEventListener('change', onCoarse)
    desk.addEventListener('change', onDesk)
    return () => { coarse.removeEventListener('change', onCoarse); desk.removeEventListener('change', onDesk) }
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

  const canDraw = canEdit && wide
  const systems = useMemo(() => new Map(systemList.map(s => [s.id, s])), [systemList])
  const size = page ? { w: page.w, h: page.h } : null

  const resetDrawing = useCallback(() => {
    setDraft([]); setHover(null); setPendingLimit(null); setRedrawOf(null); setPendingPos(null)
  }, [])

  function pickTool(next: Tool) {
    resetDrawing()
    setError(null)
    if (next !== 'pin') setPlacingTag(null)
    if (DRAW_TOOLS.includes(next) && !activeSystem && isolated) setActiveSystem(isolated)
    setTool(next)
  }

  function changePage(n: number) {
    resetDrawing()
    setSelectedMarkupId(null)
    setCurrentPage(n)
  }

  // ── Pines ───────────────────────────────────────────────────────────────────
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
      } else if (result.error) {
        setError(result.error)
        setHotspots(prev => prev.filter(h => h.id !== optimistic.id))
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
  const pinsToReview = hotspots.filter(h => h.needs_review && !h.id.startsWith('temp-'))
  function handleConfirm(ids?: string[]) {
    setHotspots(prev => prev.map(h => (!ids || ids.includes(h.id) ? { ...h, needs_review: false } : h)))
    setSelectedHotspot(sel => (sel && (!ids || ids.includes(sel.id)) ? { ...sel, needs_review: false } : sel))
    startTransition(async () => {
      await confirmHotspots({ project_id: projectId, revision_id: revisionId, hotspot_ids: ids })
    })
  }

  // ── Marcas ──────────────────────────────────────────────────────────────────
  const pageMarkups = markups.filter(m => m.page_num === currentPage)
  const markupsToReview = markups.filter(m => m.needs_review && !m.id.startsWith('temp-'))
  const selectedMarkup = markups.find(m => m.id === selectedMarkupId) ?? null

  /** Crea una marca (optimista). `record` = false cuando la crea «Deshacer» (no se apila). */
  function addMarkup(kind: MarkupKind, points: Pt[], sides: { system_id: string; other_system_id: string | null }, label: string | null, record = true) {
    if (!page) return
    const temp: MarkupView = {
      id: `temp-mk-${++tempSeq.current}`,
      page_num: currentPage, kind, system_id: sides.system_id, other_system_id: sides.other_system_id,
      points, page_width: page.w, page_height: page.h, page_rotation: page.rotation, label, needs_review: false,
    }
    setMarkups(prev => [...prev, temp])
    setError(null)
    startTransition(async () => {
      const res = await createMarkup({
        project_id: projectId, revision_id: revisionId, page_num: temp.page_num, kind, system_id: sides.system_id,
        other_system_id: sides.other_system_id, points, page_width: page.w, page_height: page.h, page_rotation: page.rotation, label,
      })
      if (res.id) {
        setMarkups(prev => prev.map(m => (m.id === temp.id ? { ...m, id: res.id! } : m)))
        setSelectedMarkupId(sel => (sel === temp.id ? res.id! : sel))
        if (record) setUndoStack(s => [...s, { type: 'created', id: res.id! }])
      } else {
        setMarkups(prev => prev.filter(m => m.id !== temp.id))
        setError(res.error ?? t('markups.saveError'))
      }
    })
  }

  function patchMarkup(id: string, patch: MarkupPatch, record = true) {
    const before = markups.find(m => m.id === id)
    if (!before || !page) return
    const next: MarkupView = {
      ...before,
      ...('system_id' in patch && patch.system_id ? { system_id: patch.system_id } : {}),
      ...('other_system_id' in patch ? { other_system_id: patch.other_system_id ?? null } : {}),
      ...('label' in patch ? { label: patch.label ?? null } : {}),
      ...(patch.points ? { points: patch.points, page_width: page.w, page_height: page.h, page_rotation: page.rotation, needs_review: false } : {}),
    }
    setMarkups(prev => prev.map(m => (m.id === id ? next : m)))
    setError(null)
    startTransition(async () => {
      const res = await updateMarkup({
        project_id: projectId, markup_id: id, ...patch,
        ...(patch.points ? { page_width: page.w, page_height: page.h, page_rotation: page.rotation } : {}),
      })
      if (res.error) {
        setMarkups(prev => prev.map(m => (m.id === id ? before : m)))
        setError(res.error)
      } else if (record) {
        setUndoStack(s => [...s, { type: 'updated', before }])
      }
    })
  }

  function removeMarkup(id: string, record = true) {
    const before = markups.find(m => m.id === id)
    if (!before) return
    setMarkups(prev => prev.filter(m => m.id !== id))
    setSelectedMarkupId(sel => (sel === id ? null : sel))
    startTransition(async () => {
      const res = await deleteMarkup({ project_id: projectId, markup_id: id, document_id: documentId })
      if (res.error) {
        setMarkups(prev => [...prev, before])
        setError(res.error)
      } else if (record) {
        setUndoStack(s => [...s, { type: 'deleted', markup: before }])
      }
    })
  }

  function confirmMarkupIds(ids?: string[]) {
    setMarkups(prev => prev.map(m => (!ids || ids.includes(m.id) ? { ...m, needs_review: false } : m)))
    startTransition(async () => {
      const res = await confirmMarkups({ project_id: projectId, revision_id: revisionId, markup_ids: ids })
      if (res.error) setError(res.error)
    })
  }

  function undo() {
    if (draft.length) { setDraft(d => d.slice(0, -1)); return }
    const op = undoStack[undoStack.length - 1]
    if (!op) return
    setUndoStack(s => s.slice(0, -1))
    if (op.type === 'created') removeMarkup(op.id, false)
    else if (op.type === 'deleted') {
      const m = op.markup
      // Se recrea tal como estaba (sus puntos se guardaron con su propia página y rotación).
      startTransition(async () => {
        const res = await createMarkup({
          project_id: projectId, revision_id: revisionId, page_num: m.page_num, kind: m.kind, system_id: m.system_id,
          other_system_id: m.other_system_id, points: m.points, page_width: m.page_width, page_height: m.page_height,
          page_rotation: m.page_rotation, label: m.label,
        })
        if (res.id) setMarkups(prev => [...prev, { ...m, id: res.id!, needs_review: false }])
        else setError(res.error ?? t('markups.saveError'))
      })
    } else {
      const b = op.before
      setMarkups(prev => prev.map(m => (m.id === b.id ? b : m)))
      startTransition(async () => {
        const res = await updateMarkup({
          project_id: projectId, markup_id: b.id, system_id: b.system_id, other_system_id: b.other_system_id, label: b.label,
          points: b.points, page_width: b.page_width, page_height: b.page_height, page_rotation: b.page_rotation,
        })
        if (res.error) setError(res.error)
      })
    }
  }

  function finishDraft() {
    if (!size || !activeSystem) return
    const pts = finishLine(draft, size)
    if (!pts) { setError(t('markups.lineTooShort')); return }
    if (redrawOf) {
      patchMarkup(redrawOf, { points: pts })
      setSelectedMarkupId(redrawOf)
      setTool('select')
    } else {
      addMarkup('line', pts, { system_id: activeSystem, other_system_id: null }, null)
    }
    setDraft([]); setHover(null); setRedrawOf(null)
  }

  function savePendingLimit() {
    if (!pendingLimit) return
    let { bar } = pendingLimit
    let sys = pendingLimit.system_id
    let other = pendingLimit.other_system_id
    // Límite de batería con el sistema del otro lado: la barra se invierte para que el sistema quede de su lado.
    if (!sys && other) { bar = [bar[1], bar[0]]; sys = other; other = null }
    if (!sys) return
    addMarkup('limit', bar, { system_id: sys, other_system_id: other }, null)
    setPendingLimit(null)
  }

  function handlePoint(u: Pt) {
    setError(null)
    if (tool === 'pin') { if (placingTag) setPendingPos({ x: clampPct(u.x * 100), y: clampPct(u.y * 100) }); return }
    if (!size) return
    if (tool === 'limit') {
      const lines = pageMarkups.filter(m => m.kind === 'line').map(m => ({ ...m, points: displayPoints(m, page!.rotation) }))
      const hit = nearestLine(u, lines, size, markupMetrics(size).hit)
      const bar = limitBar(u, hit, size)
      setPendingLimit({ bar, ...defaultLimitSides(bar, hit, lines, size, activeSystem) })
      return
    }
    if (!activeSystem) { setError(t('markups.pickSystemFirst')); return }
    if (tool === 'line') {
      setDraft(d => [...d, d.length ? snapOrthogonal(d[d.length - 1], u, size) : u])
    } else if (tool === 'label') {
      addMarkup('label', [u], { system_id: activeSystem, other_system_id: null }, null)
    }
  }

  function handleHover(u: Pt | null) {
    if (tool !== 'line' || !draft.length || !size) { if (hover) setHover(null); return }
    setHover(u ? snapOrthogonal(draft[draft.length - 1], u, size) : null)
  }

  // Teclado mientras se dibuja: Enter termina, Esc cancela, Retroceso quita el último vértice.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null
    if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
    if (e.key === 'Escape') { resetDrawing(); setSelectedMarkupId(null) }
    else if (e.key === 'Enter' && draft.length) { e.preventDefault(); finishDraft() }
    else if (e.key === 'Backspace' && draft.length) { e.preventDefault(); setDraft(d => d.slice(0, -1)) }
  })
  const listening = draft.length > 0 || !!pendingLimit || !!selectedMarkupId
  useEffect(() => {
    if (!listening) return
    const handler = (e: KeyboardEvent) => onKey(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [listening])

  function redraw(m: MarkupView) {
    if (m.kind !== 'line') { removeMarkup(m.id); return }
    resetDrawing()
    setActiveSystem(m.system_id)
    setRedrawOf(m.id)
    setTool('line')
  }

  // ── Leyenda: sistemas en esta hoja (pines + marcas) ─────────────────────────
  const pageHotspots = hotspots.filter(h => h.page_num === currentPage)
  const counts = new Map<string, { pins: number; markups: number }>()
  const bump = (id: string, k: 'pins' | 'markups') => { const v = counts.get(id) ?? { pins: 0, markups: 0 }; v[k]++; counts.set(id, v) }
  for (const h of pageHotspots) if (h.system) bump(h.system.id, 'pins')
  for (const m of pageMarkups) for (const id of markupSystemIds([m])) bump(id, 'markups')
  const sheetSystems = [...counts.keys()]
    .map(id => systems.get(id) ?? pageHotspots.find(h => h.system?.id === id)?.system)
    .filter((s): s is SystemRef => !!s)
    .sort((a, b) => a.code.localeCompare(b.code))

  const pinColor = (h: Hotspot) => colorBy === 'system' ? (systems.get(h.system?.id ?? '')?.color ?? h.system?.color ?? NO_SYSTEM_COLOR) : pinStatusColor(h)
  const dimmed = (h: Hotspot) => !!isolated && h.system?.id !== isolated
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

  const effectiveTool: Tool = canDraw ? tool : 'select'
  const interaction = effectiveTool === 'pan' ? 'pan'
    : DRAW_TOOLS.includes(effectiveTool) || (effectiveTool === 'pin' && !!placingTag) ? 'point'
      : 'none'
  const needsSystem = DRAW_TOOLS.includes(effectiveTool)
  const hint = redrawOf ? t('markups.hint_redraw') : t(`markups.hint_${effectiveTool}`)

  return (
    // Teléfono: el plano arriba y la leyenda abajo (antes la barra lateral dejaba el plano en ~130 px).
    <div style={{ display: 'flex', flexDirection: wide ? 'row' : 'column', flex: 1, overflow: 'hidden' }}>
      {canDraw && <ToolRail tool={tool} onTool={pickTool} canUndo={draft.length > 0 || undoStack.length > 0} onUndo={undo} busy={isPending} />}

      {/* Lienzo + barra de ayuda de la herramienta + zoom y páginas */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative', display: 'flex' }}>
        {canDraw && (
          <div style={{
            position: 'absolute', top: 12, left: 12, right: 12, zIndex: 30, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
            pointerEvents: 'none',
          }}>
            <div style={{
              display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: 'var(--card-bg)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--text-muted)', pointerEvents: 'auto', maxWidth: '100%',
            }}>
              {needsSystem && !redrawOf && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--text-strong)' }}>
                  <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: systems.get(activeSystem ?? '')?.color ?? 'var(--gray-300)' }} />
                  {t('markups.system')}
                  <select value={activeSystem ?? ''} onChange={e => setActiveSystem(e.target.value || null)}
                    style={{ minHeight: 30, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-strong)', fontSize: 12 }}>
                    <option value="">{t('markups.pickSystem')}</option>
                    {systemList.map(s => <option key={s.id} value={s.id}>{s.code}</option>)}
                  </select>
                </label>
              )}
              <strong style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{hint}</strong>
              {effectiveTool === 'line' && draft.length > 0 && (
                <>
                  <button type="button" onClick={finishDraft} disabled={isPending}
                    style={{ minHeight: 30, padding: '0 10px', border: 0, borderRadius: 6, background: 'var(--primary-600)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {t('markups.finish')}
                  </button>
                  <button type="button" onClick={resetDrawing}
                    style={{ minHeight: 30, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card-bg)', color: 'var(--text-strong)', fontSize: 12, cursor: 'pointer' }}>
                    {t('viewer.cancel')}
                  </button>
                </>
              )}
            </div>
            {error && (
              <div role="alert" style={{ pointerEvents: 'auto', background: 'var(--danger-50)', border: '1px solid var(--danger-200)', color: 'var(--danger-700)', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>
                {error}
              </div>
            )}
          </div>
        )}

        <PidCanvas
          signedUrl={signedUrl}
          pageNumber={currentPage}
          scale={scale}
          onScale={setScale}
          onNumPages={setNumPages}
          interaction={interaction}
          onPoint={handlePoint}
          onDoublePoint={() => { if (effectiveTool === 'line') finishDraft() }}
          onHover={handleHover}
          onPageInfo={setPage}
        >
          {page && (
            <MarkupLayer
              page={page}
              markups={pageMarkups}
              systems={systems}
              selectedId={selectedMarkupId}
              isolated={isolated}
              selectable={effectiveTool === 'select'}
              onSelect={id => { setSelectedMarkupId(id); setSelectedHotspot(null) }}
              draft={draft}
              draftColor={systems.get(activeSystem ?? '')?.color ?? NO_SYSTEM_COLOR}
              hover={hover}
              pendingLimit={pendingLimit}
            />
          )}
          <PinLayer
            pins={pageHotspots}
            colorOf={pinColor}
            dimmed={dimmed}
            selectedId={selectedHotspot?.id ?? null}
            onSelect={h => { setSelectedHotspot(h); setSelectedMarkupId(null) }}
            isTouch={isTouch}
            pending={pendingPos}
            pendingBusy={isPending}
            onConfirmPending={handleConfirmHotspot}
            onCancelPending={() => setPendingPos(null)}
          />
        </PidCanvas>

        <div style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 30, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" aria-label={t('markups.zoomIn')} onClick={() => setScale(s => Math.min(MAX_SCALE, +(s + 0.25).toFixed(2)))} style={{ ...floatBtn, fontSize: 18 }}>+</button>
          <button type="button" aria-label={t('markups.zoomOut')} onClick={() => setScale(s => Math.max(MIN_SCALE, +(s - 0.25).toFixed(2)))} style={{ ...floatBtn, fontSize: 18 }}>−</button>
          <button type="button" onClick={() => setScale(1)} style={floatBtn}>{t('markups.fit')} · {Math.round(scale * 100)}%</button>
          {numPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 4px' }}>
              <button type="button" aria-label={t('markups.prevPage')} onClick={() => changePage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1} style={{ ...floatBtn, border: 0, height: 38 }}>‹</button>
              <span style={{ fontSize: 13, color: 'var(--text-strong)' }}>{t('markups.sheet', { page: currentPage, total: numPages })}</span>
              <button type="button" aria-label={t('markups.nextPage')} onClick={() => changePage(Math.min(numPages, currentPage + 1))} disabled={currentPage >= numPages} style={{ ...floatBtn, border: 0, height: 38 }}>›</button>
            </div>
          )}
        </div>
      </div>

      {/* Barra derecha: sistemas de la hoja, por revisar, límite por confirmar, marca elegida, pines */}
      <aside aria-label={t('markups.sidebar')} style={{
        ...(wide
          ? { width: 'clamp(240px, 26vw, 330px)', borderLeft: '1px solid var(--border)' }
          : { width: '100%', maxHeight: '38%', borderTop: '1px solid var(--border)' }),
        flexShrink: 0, background: 'var(--card-bg)', display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        <PidLegend colorBy={colorBy} onColorBy={setColorBy} systems={sheetSystems} counts={counts} isolated={isolated} onIsolate={setIsolated} />

        {(markupsToReview.length > 0 || pinsToReview.length > 0) && (
          <div role="status" style={{ margin: '12px 16px 0', padding: 12, borderRadius: 10, background: 'var(--warning-50)', border: '1px solid var(--warning-300)', fontSize: 13, color: 'var(--warning-800)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {markupsToReview.length > 0 && (
              <>
                <strong>{t('markups.reviewBanner', { count: markupsToReview.length })}</strong>
                {canEdit && (
                  <button type="button" onClick={() => confirmMarkupIds()} disabled={isPending}
                    style={{ minHeight: 36, padding: '0 12px', borderRadius: 8, border: '1px solid var(--warning-300)', background: 'var(--card-bg)', color: 'var(--warning-800)', fontSize: 12, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start' }}>
                    {t('markups.confirmAll')}
                  </button>
                )}
              </>
            )}
            {pinsToReview.length > 0 && (
              <>
                <span>{t('viewer.reviewBanner', { count: pinsToReview.length })}</span>
                {canEdit && (
                  <button type="button" onClick={() => handleConfirm()} disabled={isPending}
                    style={{ minHeight: 36, padding: '0 12px', borderRadius: 8, border: '1px solid var(--warning-300)', background: 'var(--card-bg)', color: 'var(--warning-800)', fontSize: 12, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start' }}>
                    {t('viewer.confirmAll')}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {pendingLimit && page && (
          <LimitDraftPanel
            bar={pendingLimit.bar} page={page} systemId={pendingLimit.system_id} otherSystemId={pendingLimit.other_system_id}
            systems={systems} systemList={systemList} approved={approvedGates} busy={isPending}
            onChange={sides => setPendingLimit(p => (p ? { ...p, ...sides } : p))}
            onSave={savePendingLimit} onCancel={() => setPendingLimit(null)}
          />
        )}

        {selectedMarkup && page && (
          <SelectedMarkupPanel
            key={selectedMarkup.id}
            markup={{ ...selectedMarkup, points: displayPoints(selectedMarkup, page.rotation) }}
            page={page} systems={systems} systemList={systemList} approved={approvedGates}
            canEdit={canEdit && !selectedMarkup.id.startsWith('temp-')} busy={isPending}
            onChange={patch => {
              if (patch.swap) patchMarkup(selectedMarkup.id, { system_id: selectedMarkup.other_system_id!, other_system_id: selectedMarkup.system_id })
              else patchMarkup(selectedMarkup.id, patch)
            }}
            onDelete={() => removeMarkup(selectedMarkup.id)}
            onConfirm={() => confirmMarkupIds([selectedMarkup.id])}
            onRedraw={() => redraw(selectedMarkup)}
            onClose={() => setSelectedMarkupId(null)}
          />
        )}

        {/* Pin de tag: 1. elegir el tag, 2. clic en el plano */}
        {canDraw && tool === 'pin' && (
          <div style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>{t('viewer.editStep1')}</div>
            <TagSelector projectId={projectId} value={placingTag} onChange={setPlacingTag} />
            {placingTag && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--primary-700)', padding: '8px 10px', background: 'var(--primary-50)', borderRadius: '7px', border: '1px solid var(--primary-200)' }}>
                {t('viewer.editStep2')}
              </div>
            )}
          </div>
        )}

        {/* Pines de esta hoja */}
        {pageHotspots.length > 0 && (
          <div style={{ padding: '12px 16px' }}>
            <div style={sectionLabel}>{t('viewer.tagListLabel', { count: pageHotspots.length })}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {pageHotspots.map(h => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => { setSelectedHotspot(h); setSelectedMarkupId(null) }}
                  style={{
                    padding: '6px 8px', borderRadius: '6px', cursor: 'pointer', textAlign: 'left',
                    border: '1px solid var(--border)', background: selectedHotspot?.id === h.id ? 'var(--primary-50)' : 'var(--card-bg)',
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}
                >
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: pinColor(h), flexShrink: 0, display: 'inline-block' }} />
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px', fontWeight: 600, color: 'var(--text-strong)' }}>{h.tag.tag_number}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

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
                    padding: '8px 16px', marginRight: '8px', background: 'var(--warning-50)', color: 'var(--warning-800)',
                    border: '1px solid var(--warning-300)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: 600,
                  }}
                >
                  {t('viewer.confirmOne')}
                </button>
              )}
              <button
                onClick={() => handleDeleteHotspot(selectedHotspot.id)}
                disabled={isPending}
                style={{
                  padding: '8px 16px', background: 'var(--danger-50)', color: 'var(--danger-600)',
                  border: '1px solid var(--danger-200)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: 500,
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
