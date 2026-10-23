'use client'

import { useState, useEffect, useEffectEvent, useMemo, useRef, useTransition, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import TagQuickViewModal from '@/components/TagQuickViewModal'
import { upsertHotspot, deleteHotspot, confirmHotspots } from '@/app/actions/pid-hotspots'
import { createMarkup, updateMarkup, deleteMarkup, confirmMarkups } from '@/app/actions/pid-markups'
import { createRedline } from '@/app/actions/pid-redlines'
import type { RedlineMark } from '@/lib/pid/redlines'
import { NO_SYSTEM_COLOR } from '@/lib/systems/colors'
import { pinStatusColor } from '@/lib/pid/pins'
import { bounds, clampPct, snapOrthogonal, type Pt } from '@/lib/pid/geometry'
import { ROW_STATE_COLORS, systemFocus, type Box } from '@/lib/pid/view'
import { connectorPairs, connectorText, pinConflicts, type ConnectorForControl } from '@/lib/pid/control'
import {
  defaultLimitSides, displayPoints, finishLine, limitBar, markupMetrics, markupSystemIds, nearestLine, type MarkupKind,
} from '@/lib/pid/markups'
import PidCanvas, { MAX_SCALE, MIN_SCALE } from './PidCanvas'
import PinLayer from './PinLayer'
import MarkupLayer from './MarkupLayer'
import PidLegend from './PidLegend'
import ToolRail from './ToolRail'
import TagSelector from './TagSelector'
import { ConnectorDraftPanel, LimitDraftPanel, SelectedMarkupPanel, type ConnectorInfo } from './MarkupPanel'
import RedlineLayer from './RedlineLayer'
import { RedlineDraftPanel, RedlineListPanel, RedlineTextPrompt, uploadPhotos } from './RedlinePanel'
import type { ApprovedGates, ColorBy, Hotspot, IncomingConnector, Layers, MarkupView, PageInfo, PidDoc, RedlineView, SystemRef, SystemStates, TagItem, Tool } from './types'

// P1: el visor se separó en lienzo (PidCanvas), capa de pines (PinLayer), leyenda (PidLegend) y selector de tags.
// P2 (maqueta aprobada): barra de herramientas a la izquierda (Elegir · Mover · Resaltar línea · Límite · Etiqueta ·
// Pin de tag · Deshacer), capa SVG de marcas LOSH (MarkupLayer) y barra derecha con «Sistemas en esta hoja», lo que
// llegó «por revisar» de la revisión anterior y la marca elegida. Dibujan los editores en escritorio y tableta; en el
// teléfono el plano solo se ve (el dibujo táctil llega en P3). Las marcas se guardan en unidad 0..1 de la hoja ya
// rotada, con su tamaño y rotación (`PageInfo`).
// P3 (maqueta «Tableta»): en tableta un dedo dibuja y dos mueven (PidCanvas), con Deshacer · Cancelar · Terminar
// grandes abajo; los vértices de la marca elegida se arrastran; la leyenda se pliega. «Por estado» colorea las marcas
// con el estado de la liberación siguiente de su sistema. `?system=` aísla el sistema y encuadra su hoja;
// `?place=<tag>` abre «Pin de tag» con ese tag elegido (desde la pestaña Planos de la ficha del sistema).
// P4 (decisiones de Luis 2026-10-23): herramienta Conector (el sistema sigue en otra hoja: P&ID + página); elegir un
// conector lleva a la otra hoja enfocando el conector de vuelta (`?mk=`) o, si no tiene, a la página destino con el
// sistema aislado; «Controles de esta hoja» lista los conectores sin par y los pines que caen sobre el resalte de
// otro sistema (solo avisa, también al colocar un pin).
// F-21a (maquetas aprobadas): red-line de campo. Herramientas Nube (dos toques: esquinas), Trazo (toques; «Terminar
// trazo») y Texto (un toque y el texto en el panel); las marcas se juntan y «Terminar marcas» abre el formulario
// (qué cambió, sistema, tag, fotos). Crea Líder en adelante (los editores); capas Pines · Límites · Red-line.

interface Props {
  signedUrl: string
  hotspots: Hotspot[]
  markups: MarkupView[]
  /** Sistemas del proyecto (para elegir a qué sistema pertenece una marca). */
  systems: SystemRef[]
  approvedGates: ApprovedGates
  /** P3: liberación siguiente de cada sistema del proyecto (color «Por estado»). */
  systemStates: SystemStates
  /** `?system=`: sistema a aislar y encuadrar al abrir. */
  focusSystemId: string | null
  /** `?place=`: tag a ubicar con «Pin de tag» al abrir (editores). */
  placeTag: TagItem | null
  /** P4 `?mk=`: marca a encuadrar y elegir al abrir (el conector de vuelta). */
  focusMarkupId: string | null
  /** P4 `?page=`: página a abrir. */
  initialPage: number | null
  /** P4: P&ID del proyecto (destino de los conectores). */
  pidDocs: PidDoc[]
  /** P4: conectores de otras hojas vigentes que apuntan a esta. */
  incoming: IncomingConnector[]
  projectId: string
  /** N2d: documento P&ID y revisión abierta (pines y marcas son de la revisión). */
  documentId: string
  revisionId: string
  canEdit: boolean
  /** F-21a: red-lines de la revisión abierta, nombres de las personas, usuario actual y zona del proyecto. */
  redlines: RedlineView[]
  names: Record<string, string>
  userId: string
  timezone: string | null
}

type MarkupPatch = { system_id?: string; other_system_id?: string | null; label?: string | null; points?: Pt[]; target_document_id?: string | null; target_page?: number }
type Target = { target_document_id: string | null; target_page: number | null }
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
const DRAW_TOOLS: Tool[] = ['line', 'limit', 'label', 'connector']
const RL_TOOLS: Tool[] = ['rl_cloud', 'rl_pen', 'rl_text']

export default function PidViewer({
  signedUrl, hotspots: initialHotspots, markups: initialMarkups, systems: systemList, approvedGates, systemStates, focusSystemId, placeTag,
  focusMarkupId, initialPage, pidDocs, incoming, projectId, documentId, revisionId, canEdit, redlines, names, userId, timezone,
}: Props) {
  const t = useTranslations('PidDocuments')
  const router = useRouter()
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
  const [pendingConnector, setPendingConnector] = useState<{ point: Pt; target_document_id: string | null; target_page: number } | null>(null)
  const [undoStack, setUndoStack] = useState<UndoOp[]>([])
  const [error, setError] = useState<string | null>(null)
  // Fase 2 / P2: colorear los pines por sistema (por defecto, como la maqueta) o por estado; «Aislar» atenúa el resto.
  const [colorBy, setColorBy] = useState<ColorBy>('system')
  const [isolated, setIsolated] = useState<string | null>(null)
  const [focus, setFocus] = useState<{ box: Box; key: number } | null>(null)
  const [focusMissing, setFocusMissing] = useState(false)
  const [legendOpen, setLegendOpen] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [isTouch, setIsTouch] = useState(false)
  // F-21a: capas visibles, red-line en curso (marcas, esquina de la nube, texto por escribir), formulario y elegido.
  const [layers, setLayers] = useState<Layers>({ pins: true, losh: true, redline: true })
  const [rlMarks, setRlMarks] = useState<RedlineMark[]>([])
  const [cloudStart, setCloudStart] = useState<Pt | null>(null)
  const [pendingText, setPendingText] = useState<Pt | null>(null)
  const [rlForm, setRlForm] = useState(false)
  const [selectedRedlineId, setSelectedRedlineId] = useState<string | null>(null)
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

  // `?system=` / botón «Ver» de la leyenda: hoja con más presencia del sistema y caja a encuadrar.
  const focusOn = useCallback((systemId: string, onlyPage?: number) => {
    const items = [
      ...hotspots.map(h => ({ page: h.page_num, systemIds: h.system ? [h.system.id] : [], points: [{ x: h.x_pct / 100, y: h.y_pct / 100 }] })),
      ...markups.map(m => ({ page: m.page_num, systemIds: markupSystemIds([m]), points: m.points })),
    ].filter(it => onlyPage == null || it.page === onlyPage)
    const f = systemFocus(systemId, items)
    if (!f) return false
    setCurrentPage(f.page)
    setFocus(prev => ({ box: f.box, key: (prev?.key ?? 0) + 1 }))
    return true
  }, [hotspots, markups])

  useEffect(() => {
    if (!focusSystemId || focusMarkupId) return
    // P4: `?page=` (conector sin par) abre esa página aunque el sistema aún no tenga nada en ella.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- encuadre inicial desde el enlace `?system=` (una vez al montar)
    if (initialPage) setCurrentPage(initialPage)
    if (focusOn(focusSystemId, initialPage ?? undefined)) { setIsolated(focusSystemId); setFocusMissing(false) }
    else setFocusMissing(true)
    setActiveSystem(focusSystemId)
  }, [focusSystemId, initialPage]) // eslint-disable-line react-hooks/exhaustive-deps

  // P4 `?mk=`: hoja de la marca, encuadre y la marca elegida (al seguir un conector, el de vuelta).
  useEffect(() => {
    const mk = focusMarkupId ? markups.find(m => m.id === focusMarkupId) : null
    if (!mk) return
    const b = bounds(mk.points)!
    // eslint-disable-next-line react-hooks/set-state-in-effect -- encuadre inicial desde el enlace `?mk=`
    setCurrentPage(mk.page_num)
    setFocus(prev => ({ box: b, key: (prev?.key ?? 0) + 1 }))
    setSelectedMarkupId(mk.id)
    setIsolated(mk.system_id)
    setActiveSystem(mk.system_id)
  }, [focusMarkupId]) // eslint-disable-line react-hooks/exhaustive-deps

  // `?page=` sin `?system=`: solo la página.
  useEffect(() => {
    if (!initialPage || focusSystemId || focusMarkupId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- página inicial desde el enlace `?page=`
    setCurrentPage(initialPage)
  }, [initialPage]) // eslint-disable-line react-hooks/exhaustive-deps

  // Una página del enlace que el PDF no tiene: la última.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- acota la página al conocer el total del PDF
    if (numPages > 0 && currentPage > numPages) setCurrentPage(numPages)
  }, [numPages, currentPage])

  const canDraw = canEdit && wide

  // `?place=`: abre «Pin de tag» con el tag elegido (solo quien puede dibujar).
  // Por id: guardar revalida la página y el tag llega como objeto nuevo; no debe volver a elegir la herramienta.
  const placeId = placeTag?.id ?? null
  useEffect(() => {
    if (!placeTag || !canDraw) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- herramienta inicial desde el enlace `?place=`
    setTool('pin')
    setPlacingTag(placeTag)
  }, [placeId, canDraw]) // eslint-disable-line react-hooks/exhaustive-deps
  const systems = useMemo(() => new Map(systemList.map(s => [s.id, s])), [systemList])
  const size = page ? { w: page.w, h: page.h } : null

  const resetDrawing = useCallback(() => {
    setDraft([]); setHover(null); setPendingLimit(null); setPendingConnector(null); setRedrawOf(null); setPendingPos(null)
    setCloudStart(null); setPendingText(null)
  }, [])

  /** Descarta el red-line en curso (marcas y formulario). */
  function discardRedline() {
    resetDrawing(); setRlMarks([]); setRlForm(false)
  }

  function pickTool(next: Tool) {
    resetDrawing()
    setError(null)
    if (next !== 'pin') setPlacingTag(null)
    if (DRAW_TOOLS.includes(next) && !activeSystem && isolated) setActiveSystem(isolated)
    if (RL_TOOLS.includes(next)) { setLayers(l => ({ ...l, redline: true })); setRlForm(false) }
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
  function addMarkup(kind: MarkupKind, points: Pt[], sides: { system_id: string; other_system_id: string | null }, label: string | null, record = true,
    target: Target = { target_document_id: null, target_page: null }) {
    if (!page) return
    const temp: MarkupView = {
      id: `temp-mk-${++tempSeq.current}`,
      page_num: currentPage, kind, system_id: sides.system_id, other_system_id: sides.other_system_id,
      points, page_width: page.w, page_height: page.h, page_rotation: page.rotation, label, needs_review: false, ...target,
    }
    setMarkups(prev => [...prev, temp])
    setError(null)
    startTransition(async () => {
      const res = await createMarkup({
        project_id: projectId, revision_id: revisionId, page_num: temp.page_num, kind, system_id: sides.system_id,
        other_system_id: sides.other_system_id, points, page_width: page.w, page_height: page.h, page_rotation: page.rotation, label, ...target,
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
      ...('target_document_id' in patch ? { target_document_id: patch.target_document_id ?? null, target_page: patch.target_page ?? 1 } : {}),
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
    if (RL_TOOLS.includes(tool)) {
      if (cloudStart) { setCloudStart(null); return }
      if (pendingText) { setPendingText(null); return }
      setRlMarks(m => m.slice(0, -1))
      return
    }
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
          page_rotation: m.page_rotation, label: m.label, target_document_id: m.target_document_id, target_page: m.target_page,
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
          ...(b.kind === 'connector' && b.target_document_id ? { target_document_id: b.target_document_id, target_page: b.target_page ?? 1 } : {}),
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

  function savePendingConnector() {
    if (!pendingConnector || !activeSystem || !pendingConnector.target_document_id) return
    addMarkup('connector', [pendingConnector.point], { system_id: activeSystem, other_system_id: null }, null, true,
      { target_document_id: pendingConnector.target_document_id, target_page: pendingConnector.target_page })
    setPendingConnector(null)
  }

  function handlePoint(u: Pt) {
    setError(null)
    if (tool === 'pin') { if (placingTag) setPendingPos({ x: clampPct(u.x * 100), y: clampPct(u.y * 100) }); return }
    if (!size) return
    if (tool === 'rl_cloud') {
      if (!cloudStart) { setCloudStart(u); return }
      if (Math.abs(u.x - cloudStart.x) * size.w < 4 || Math.abs(u.y - cloudStart.y) * size.h < 4) return
      setRlMarks(m => [...m, { k: 'cloud', p: [cloudStart, u] }])
      setCloudStart(null); setHover(null)
      return
    }
    if (tool === 'rl_pen') { setDraft(d => [...d, u]); return }
    if (tool === 'rl_text') { setPendingText(u); return }
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
    } else if (tool === 'connector') {
      // Destino por defecto: el último elegido (los conectores de una hoja suelen ir a la misma de al lado).
      setPendingConnector(prev => ({ point: u, target_document_id: prev?.target_document_id ?? null, target_page: prev?.target_page ?? 1 }))
    }
  }

  function handleHover(u: Pt | null) {
    if ((tool === 'rl_pen' && draft.length) || (tool === 'rl_cloud' && cloudStart)) { setHover(u); return }
    if (tool !== 'line' || !draft.length || !size) { if (hover) setHover(null); return }
    setHover(u ? snapOrthogonal(draft[draft.length - 1], u, size) : null)
  }

  /** Cierra el trazo en curso como una marca del red-line. */
  function finishPen() {
    if (!size) return
    const pts = finishLine(draft, size)
    if (!pts) { setError(t('markups.lineTooShort')); return }
    setRlMarks(m => [...m, { k: 'pen', p: pts }])
    setDraft([]); setHover(null)
  }

  /** «Terminar marcas»: cierra lo que esté en curso y abre el formulario. */
  function finishRedlineMarks() {
    if (draft.length >= 2 && tool === 'rl_pen') finishPen()
    setCloudStart(null); setPendingText(null)
    setRlForm(true)
  }

  function saveRedline(v: { description: string; system_id: string | null; tag: TagItem | null; photos: File[] }) {
    if (!page || !rlMarks.length) return
    setError(null)
    startTransition(async () => {
      const res = await createRedline({
        project_id: projectId, document_id: documentId, revision_id: revisionId, page_num: currentPage,
        description: v.description, system_id: v.system_id, tag_id: v.tag?.id ?? null, marks: rlMarks,
        page_width: page.w, page_height: page.h, page_rotation: page.rotation,
      })
      if (!res.id) { setError(res.error ?? t('redline.saveError')); return }
      if (v.photos.length) {
        const err = await uploadPhotos(v.photos, { projectId, documentId, redlineId: res.id }, name => t('redline.photoTooBig', { name }))
        if (err) setError(err)
      }
      discardRedline()
      setTool('select')
      setSelectedRedlineId(res.id)
      router.refresh()
    })
  }

  // Teclado mientras se dibuja: Enter termina, Esc cancela, Retroceso quita el último vértice.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null
    if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
    if (e.key === 'Escape') { resetDrawing(); setSelectedMarkupId(null) }
    else if (e.key === 'Enter' && draft.length) { e.preventDefault(); if (tool === 'rl_pen') finishPen(); else finishDraft() }
    else if (e.key === 'Backspace' && draft.length) { e.preventDefault(); setDraft(d => d.slice(0, -1)) }
  })
  const listening = draft.length > 0 || !!pendingLimit || !!pendingConnector || !!selectedMarkupId || !!cloudStart
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

  // «Por estado»: las marcas toman el color de la liberación siguiente de su sistema; los pines, el de su tag.
  const markupColor = (id: string | null) => {
    if (!id) return NO_SYSTEM_COLOR
    if (colorBy === 'status') { const st = systemStates[id]; return st ? ROW_STATE_COLORS[st.state] : NO_SYSTEM_COLOR }
    return systems.get(id)?.color ?? NO_SYSTEM_COLOR
  }
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

  // ── P4: controles de esta hoja ──────────────────────────────────────────────
  const docNumber = useMemo(() => new Map(pidDocs.map(d => [d.id, d.number])), [pidDocs])
  const viewerHref = (docId: string, query: string) => `/projects/${projectId}/documents/${docId}/viewer?${query}`
  const connectorLabel = (m: Pick<MarkupView, 'target_document_id' | 'target_page'>) =>
    connectorText(m.target_document_id ? { number: docNumber.get(m.target_document_id) ?? '?' } : null, m.target_page, t('markups.sheetShort'))
  const localConnectors: ConnectorForControl[] = markups.filter(m => m.kind === 'connector' && !m.id.startsWith('temp-'))
    .map(m => ({ id: m.id, document_id: documentId, page_num: m.page_num, system_id: m.system_id, target_document_id: m.target_document_id, target_page: m.target_page }))
  const pairs = connectorPairs([...localConnectors, ...incoming])
  const unpaired = new Set(localConnectors.filter(c => !pairs.get(c.id)).map(c => c.id))
  /** Conectores de otras hojas que llegan aquí sin conector de vuelta. */
  const orphanIncoming = incoming.filter(c => !pairs.get(c.id))
  function connectorInfo(m: MarkupView): ConnectorInfo {
    const pair = pairs.get(m.id)
    const href = !m.target_document_id ? null
      : pair ? viewerHref(m.target_document_id, `mk=${pair}`)
        : viewerHref(m.target_document_id, `system=${m.system_id}&page=${m.target_page ?? 1}`)
    return { href, paired: !!pair, targetText: connectorLabel(m) }
  }
  const pageLines = page ? pageMarkups.filter(m => m.kind === 'line').map(m => ({ page_num: m.page_num, system_id: m.system_id, points: displayPoints(m, page.rotation) })) : []
  const crossedPins = page ? pinConflicts(
    pageHotspots.map(h => ({ id: h.id, page_num: h.page_num, x_pct: h.x_pct, y_pct: h.y_pct, system_id: h.system?.id ?? null })),
    pageLines, () => page,
  ) : []
  const codeOf = (id: string) => systems.get(id)?.code ?? '?'
  const crossedText = new Map(crossedPins.map(c => {
    const h = pageHotspots.find(x => x.id === c.pin_id)
    return [c.pin_id, t('markups.pinCrossed', { tag: h?.tag.tag_number ?? '', system: codeOf(c.system_id), other: codeOf(c.other_system_id) })]
  }))
  const pendingCross = page && pendingPos && placingTag?.system
    ? pinConflicts([{ id: 'pending', page_num: currentPage, x_pct: pendingPos.x, y_pct: pendingPos.y, system_id: placingTag.system.id }], pageLines, () => page)[0] ?? null
    : null
  const pageUnpaired = pageMarkups.filter(m => unpaired.has(m.id))
  const pageOrphans = orphanIncoming.filter(c => (c.target_page ?? 1) === currentPage)

  const effectiveTool: Tool = canDraw ? tool : 'select'
  const rlTool = RL_TOOLS.includes(effectiveTool)
  const interaction = effectiveTool === 'pan' ? 'pan'
    : DRAW_TOOLS.includes(effectiveTool) || rlTool || (effectiveTool === 'pin' && !!placingTag) ? 'point'
      : 'none'
  const needsSystem = DRAW_TOOLS.includes(effectiveTool)
  const hint = redrawOf ? t('markups.hint_redraw')
    : rlTool ? t(`redline.hint_${effectiveTool}${effectiveTool === 'rl_cloud' && cloudStart ? '_second' : ''}`)
      : t(`markups.hint_${effectiveTool}` as Parameters<typeof t>[0])
  const touchDrawing = isTouch && canDraw && DRAW_TOOLS.includes(effectiveTool)
  const pageRedlines = redlines.filter(r => r.page_num === currentPage)
  const rlBusy = rlMarks.length > 0 || draft.length > 0 || !!cloudStart
  const bigBtn: React.CSSProperties = { minWidth: 112, height: 56, padding: '0 16px', borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-strong)' }

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
              {rlTool && !isTouch && (
                <>
                  {effectiveTool === 'rl_pen' && draft.length >= 2 && (
                    <button type="button" onClick={finishPen}
                      style={{ minHeight: 30, padding: '0 10px', border: '1px solid var(--danger-200)', borderRadius: 6, background: 'var(--card-bg)', color: 'var(--danger-700)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {t('redline.finishPen')}
                    </button>
                  )}
                  {(rlMarks.length > 0 || draft.length >= 2) && !rlForm && (
                    <button type="button" onClick={finishRedlineMarks}
                      style={{ minHeight: 30, padding: '0 10px', border: 0, borderRadius: 6, background: 'var(--danger-600)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      {t('redline.finishMarks', { count: rlMarks.length + (draft.length >= 2 ? 1 : 0) })}
                    </button>
                  )}
                  {rlBusy && (
                    <button type="button" onClick={discardRedline}
                      style={{ minHeight: 30, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card-bg)', color: 'var(--text-strong)', fontSize: 12, cursor: 'pointer' }}>
                      {t('viewer.cancel')}
                    </button>
                  )}
                </>
              )}
              {effectiveTool === 'line' && draft.length > 0 && !isTouch && (
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
            {touchDrawing && (
              <div style={{ pointerEvents: 'none', background: 'var(--text-strong)', color: 'var(--card-bg)', borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 600 }}>
                {t('markups.touchHint')}
              </div>
            )}
            {!legendOpen && wide && (
              <button type="button" onClick={() => setLegendOpen(true)} style={{ ...floatBtn, pointerEvents: 'auto', marginLeft: 'auto', height: 44, fontWeight: 600 }}>
                {t('markups.legendOpen', { count: sheetSystems.length })}
              </button>
            )}
            {error && (
              <div role="alert" style={{ pointerEvents: 'auto', background: 'var(--danger-50)', border: '1px solid var(--danger-200)', color: 'var(--danger-700)', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>
                {error}
              </div>
            )}
          </div>
        )}

        <PidCanvas
          key={revisionId}
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
          focus={focus}
        >
          {page && (layers.redline || rlBusy) && (
            <RedlineLayer
              page={page}
              redlines={layers.redline ? pageRedlines : []}
              selectedId={selectedRedlineId}
              selectable={effectiveTool === 'select'}
              onSelect={id => { setSelectedRedlineId(id); setSelectedMarkupId(null); setSelectedHotspot(null) }}
              draftMarks={rlMarks}
              cloudStart={cloudStart}
              penDraft={effectiveTool === 'rl_pen' ? draft : []}
              hover={hover}
            />
          )}
          {page && layers.losh && (
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
              colorFor={markupColor}
              editable={canDraw && effectiveTool === 'select' && !!selectedMarkupId && !selectedMarkupId.startsWith('temp-')}
              onEditPoints={(id, pts) => patchMarkup(id, { points: pts })}
              connectorLabel={connectorLabel}
              unpaired={unpaired}
            />
          )}
          {layers.pins && <PinLayer
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
            crossed={crossedText}
            pendingWarning={pendingCross && placingTag?.system
              ? t('markups.pinCrossedPending', { system: placingTag.system.code, other: codeOf(pendingCross.other_system_id) })
              : null}
          />}
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
        {/* F-21a: en tableta, Deshacer · Cancelar · Terminar marcas grandes mientras se dibuja un red-line. */}
        {isTouch && canDraw && rlTool && rlBusy && !rlForm && (
          <div style={{ position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 35, display: 'flex', gap: 10, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 10, boxShadow: '0 10px 30px rgba(13,30,50,.18)' }}>
            <button type="button" onClick={undo} style={bigBtn}>{t('markups.undo')}</button>
            <button type="button" onClick={discardRedline} style={bigBtn}>{t('viewer.cancel')}</button>
            {effectiveTool === 'rl_pen' && draft.length >= 2 && <button type="button" onClick={finishPen} style={bigBtn}>{t('redline.finishPen')}</button>}
            <button type="button" onClick={finishRedlineMarks} disabled={!rlMarks.length && draft.length < 2}
              style={{ ...bigBtn, minWidth: 160, border: 0, fontWeight: 700, background: 'var(--danger-600)', color: '#ffffff' }}>
              {t('redline.finishMarks', { count: rlMarks.length + (draft.length >= 2 ? 1 : 0) })}
            </button>
          </div>
        )}
        {/* P3: en tableta, Deshacer · Cancelar · Terminar grandes mientras se dibuja una línea. */}
        {touchDrawing && effectiveTool === 'line' && (draft.length > 0 || undoStack.length > 0) && (
          <div style={{ position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 35, display: 'flex', gap: 10, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 10, boxShadow: '0 10px 30px rgba(13,30,50,.18)' }}>
            <button type="button" onClick={undo} disabled={isPending} style={bigBtn}>{t('markups.undo')}</button>
            <button type="button" onClick={resetDrawing} disabled={!draft.length} style={{ ...bigBtn, opacity: draft.length ? 1 : 0.5 }}>{t('viewer.cancel')}</button>
            <button type="button" onClick={finishDraft} disabled={isPending || draft.length < 2}
              style={{ ...bigBtn, minWidth: 160, border: 0, fontWeight: 700, background: draft.length >= 2 ? 'var(--solid-primary-700)' : 'var(--gray-200)', color: draft.length >= 2 ? '#ffffff' : 'var(--text-muted)' }}>
              {t('markups.finishSegment')}
            </button>
          </div>
        )}
      </div>

      {/* Barra derecha: sistemas de la hoja, por revisar, límite por confirmar, marca elegida, pines */}
      {(legendOpen || !wide) && <aside aria-label={t('markups.sidebar')} style={{
        ...(wide
          ? { width: 'clamp(240px, 26vw, 330px)', borderLeft: '1px solid var(--border)' }
          : { width: '100%', maxHeight: '38%', borderTop: '1px solid var(--border)' }),
        flexShrink: 0, background: 'var(--card-bg)', display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        {wide && (
          <button type="button" onClick={() => setLegendOpen(false)} aria-label={t('markups.legendClose')}
            style={{ alignSelf: 'flex-end', minWidth: 44, minHeight: 44, margin: '4px 4px -8px 0', border: 0, background: 'transparent', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer' }}>›</button>
        )}
        {focusMissing && focusSystemId && (
          <p role="status" style={{ margin: '8px 16px 0', fontSize: 12, color: 'var(--text-muted)' }}>
            {t('markups.focusMissing', { system: systems.get(focusSystemId)?.code ?? '' })}
          </p>
        )}
        {/* F-21a: capas que se ven en el plano */}
        <div role="group" aria-label={t('redline.layers')} style={{ display: 'flex', gap: 4, margin: '12px 16px 0', padding: 4, background: 'var(--gray-100)', borderRadius: 10 }}>
          {(['pins', 'losh', 'redline'] as const).map(k => (
            <button key={k} type="button" aria-pressed={layers[k]} onClick={() => setLayers(l => ({ ...l, [k]: !l[k] }))}
              style={{ flex: 1, minHeight: 34, border: 0, borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                background: layers[k] ? 'var(--card-bg)' : 'transparent', fontWeight: layers[k] ? 700 : 400,
                color: k === 'redline' ? 'var(--danger-700)' : layers[k] ? 'var(--text-strong)' : 'var(--text-muted)' }}>
              {t(`redline.layer_${k}`)}
            </button>
          ))}
        </div>
        {pendingText && (
          <RedlineTextPrompt
            onAdd={text => { setRlMarks(m => [...m, { k: 'text', p: [pendingText], t: text }]); setPendingText(null) }}
            onCancel={() => setPendingText(null)}
          />
        )}
        {rlForm && rlMarks.length > 0 && (
          <RedlineDraftPanel markCount={rlMarks.length} systemList={systemList} defaultSystemId={activeSystem ?? isolated} projectId={projectId}
            busy={isPending} onSave={saveRedline} onDiscard={discardRedline} onBack={() => setRlForm(false)} />
        )}
        {layers.redline && (
          <RedlineListPanel redlines={redlines} selectedId={selectedRedlineId} onSelect={setSelectedRedlineId} currentPage={currentPage}
            onGoToPage={changePage} systems={systems} names={names} userId={userId} canEdit={canEdit}
            projectId={projectId} documentId={documentId} timezone={timezone} />
        )}
        <PidLegend colorBy={colorBy} onColorBy={setColorBy} systems={sheetSystems} counts={counts} isolated={isolated} onIsolate={setIsolated}
          states={systemStates} onFocus={id => { setIsolated(id); focusOn(id, currentPage) }} />

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

        {pendingConnector && page && (
          <ConnectorDraftPanel
            systemId={activeSystem} systems={systems} docs={pidDocs} documentId={documentId} page={currentPage}
            value={{ target_document_id: pendingConnector.target_document_id, target_page: pendingConnector.target_page }}
            busy={isPending}
            onChange={v => setPendingConnector(p => (p ? { ...p, ...v } : p))}
            onSave={savePendingConnector} onCancel={() => setPendingConnector(null)}
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
            connector={selectedMarkup.kind === 'connector' ? connectorInfo(selectedMarkup) : null}
            pidDocs={pidDocs}
            documentId={documentId}
          />
        )}

        {/* P4: controles de esta hoja (solo avisan) */}
        {(crossedPins.length > 0 || pageUnpaired.length > 0 || pageOrphans.length > 0) && (
          <section aria-label={t('markups.controls')} style={{ margin: '12px 16px 0', padding: 12, borderRadius: 10, border: '1px solid var(--warning-300)', background: 'var(--warning-50)', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--warning-800)' }}>
            <strong style={{ fontSize: 13 }}>{t('markups.controls')}</strong>
            {crossedPins.map(c => {
              const h = pageHotspots.find(x => x.id === c.pin_id)
              return (
                <button key={c.pin_id} type="button" onClick={() => { if (h) { setSelectedHotspot(h); setSelectedMarkupId(null) } }}
                  style={{ textAlign: 'left', border: 0, background: 'transparent', color: 'inherit', padding: '4px 0', cursor: 'pointer', fontSize: 12, minHeight: 28 }}>
                  ⚠ {crossedText.get(c.pin_id)}
                </button>
              )
            })}
            {pageUnpaired.map(m => (
              <button key={m.id} type="button" onClick={() => { setSelectedMarkupId(m.id); setSelectedHotspot(null) }}
                style={{ textAlign: 'left', border: 0, background: 'transparent', color: 'inherit', padding: '4px 0', cursor: 'pointer', fontSize: 12, minHeight: 28 }}>
                ⚠ {m.target_document_id
                  ? t('markups.connectorUnpairedItem', { system: codeOf(m.system_id), target: connectorLabel(m) })
                  : t('markups.connectorNoTargetItem', { system: codeOf(m.system_id) })}
              </button>
            ))}
            {pageOrphans.map(c => (
              <Link key={c.id} href={viewerHref(c.document_id, `mk=${c.id}`)} style={{ color: 'inherit', padding: '4px 0', fontSize: 12, minHeight: 28 }}>
                ⚠ {t('markups.connectorIncoming', { system: codeOf(c.system_id), source: connectorLabel({ target_document_id: c.document_id, target_page: c.page_num }) })}
              </Link>
            ))}
          </section>
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
      </aside>}

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
                  padding: '8px 16px', background: 'var(--danger-50)', color: 'var(--danger-700)',
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
