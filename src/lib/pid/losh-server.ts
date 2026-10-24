// P4 (plan referente): LOSH de un sistema en las revisiones VIGENTES de los P&ID del proyecto. Lo usan la pestaña
// «Planos» de la ficha del sistema (controles) y el PDF LOSH (src/lib/pdf/losh.ts, también dentro del paquete de
// handover). Corre con el cliente que le pasen: el del usuario (RLS) o el service role del paquete; siempre filtra
// por `projectId`.
//
// Hojas = las páginas con marcas del sistema (a un lado u otro de un límite). Controles (src/lib/pid/control.ts):
//  - pines cruzados en las hojas donde el sistema tiene marcas o pines: tag del sistema sobre la línea de otro, o
//    tag de otro sobre la línea del sistema;
//  - conectores del sistema sin conector de vuelta.
// Los pines están en la rotación con que se ve la hoja; las marcas guardan la suya. Sin abrir el PDF, la rotación
// de la hoja es la de su marca más reciente ya revisada (la que se dibujó sobre esta revisión).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import { fetchAllRows } from '@/lib/list/fetch-all'
import { normalizeRotation, type PageSize, type Rotation } from './geometry'
import { displayPoints, fromStoredPoints, type Markup, type MarkupKind } from './markups'
import { connectorPairs, pinConflicts } from './control'

type Db = SupabaseClient<Database>

export type LoshSystem = { id: string; code: string; name: string; color: string }

export type LoshSheet = {
  document_id: string
  number: string
  title: string | null
  revision_id: string
  rev: string
  rev_status: string
  file_path: string | null
  /** Páginas con marcas del sistema, en orden. */
  pages: number[]
  /** Marcas del sistema en esta revisión (las suyas y los límites donde es el otro lado). */
  markups: Markup[]
  review: number
}

export type LoshConflict = {
  document_id: string
  number: string
  page_num: number
  tag_id: string
  tag_number: string
  /** Sistema del tag del pin. */
  system_id: string
  /** Sistema ajeno sobre cuya línea cae. */
  other_system_id: string
  /** true = el tag es del sistema (cae sobre otro); false = un tag de otro sistema cae sobre el sistema. */
  own: boolean
}

export type LoshUnpaired = {
  markup_id: string
  document_id: string
  number: string
  page_num: number
  target_document_id: string | null
  target_number: string | null
  target_page: number | null
}

export type SystemLosh = {
  system: LoshSystem
  sheets: LoshSheet[]
  conflicts: LoshConflict[]
  unpaired: LoshUnpaired[]
  /** Código de cada sistema del proyecto (lados de los límites, pines cruzados). */
  codes: Record<string, string>
  /** Número de cada P&ID del proyecto (destino de los conectores). */
  pidNumbers: Record<string, string>
}

const MARKUP_COLS = 'id, revision_id, page_num, kind, system_id, other_system_id, points, page_width, page_height, page_rotation, label, needs_review, target_document_id, target_page, updated_at'

type MarkupRow = {
  id: string; revision_id: string; page_num: number; kind: string; system_id: string | null; other_system_id: string | null
  points: unknown; page_width: number; page_height: number; page_rotation: number; label: string | null; needs_review: boolean
  target_document_id: string | null; target_page: number | null; updated_at: string
}

function toMarkup(m: MarkupRow): Markup | null {
  if (!m.system_id) return null
  return {
    id: m.id, page_num: m.page_num, kind: m.kind as MarkupKind, system_id: m.system_id, other_system_id: m.other_system_id,
    points: fromStoredPoints(m.points), page_width: Number(m.page_width), page_height: Number(m.page_height),
    page_rotation: normalizeRotation(m.page_rotation), label: m.label, needs_review: m.needs_review,
    target_document_id: m.target_document_id, target_page: m.target_page,
  }
}

/** Rotación y tamaño (como se ve) de cada página: los de su marca más reciente ya revisada, o de la más reciente. */
function pageFrames(rows: MarkupRow[]): Map<string, { rotation: Rotation; size: PageSize }> {
  const best = new Map<string, MarkupRow>()
  for (const m of rows) {
    const k = `${m.revision_id}:${m.page_num}`
    const cur = best.get(k)
    const rank = (r: MarkupRow) => `${r.needs_review ? 0 : 1}${r.updated_at}`
    if (!cur || rank(m) > rank(cur)) best.set(k, m)
  }
  return new Map([...best].map(([k, m]) => [k, { rotation: normalizeRotation(m.page_rotation), size: { w: Number(m.page_width), h: Number(m.page_height) } }]))
}

export async function loadSystemLosh(db: Db, x: { projectId: string; systemId: string }): Promise<SystemLosh | null> {
  const [{ data: system }, { data: systems }, { data: docs }] = await Promise.all([
    db.from('systems').select('id, code, name, color').eq('id', x.systemId).eq('project_id', x.projectId).maybeSingle(),
    // bounded: sistemas de un proyecto (< 1000)
    db.from('systems').select('id, code').eq('project_id', x.projectId).limit(1000),
    // bounded: P&ID de un proyecto (tope de PostgREST, 1000)
    db.from('documents').select('id, number, title, current_revision_id').eq('project_id', x.projectId).eq('doc_type', 'pid').limit(1000),
  ])
  if (!system) return null
  const codes = Object.fromEntries((systems ?? []).map(s => [s.id, s.code]))
  const pidNumbers = Object.fromEntries((docs ?? []).map(d => [d.id, d.number]))
  const docOfRev = new Map((docs ?? []).filter(d => d.current_revision_id).map(d => [d.current_revision_id!, d]))

  // Marcas del sistema (a un lado u otro) y pines de sus tags, solo en revisiones vigentes.
  const [ownMarks, ownPins] = await Promise.all([
    fetchAllRows(() => db.from('pid_markups').select(MARKUP_COLS).eq('project_id', x.projectId).eq('layer', 'losh')
      .or(`system_id.eq.${x.systemId},other_system_id.eq.${x.systemId}`)),
    fetchAllRows(() => db.from('pid_hotspots').select('id, revision_id, tags!inner(subsystems!inner(system_id))')
      .eq('project_id', x.projectId).eq('tags.subsystems.system_id', x.systemId)),
  ])
  const marks = (ownMarks).filter(m => docOfRev.has(m.revision_id))
  const revIds = [...new Set([...marks.map(m => m.revision_id), ...(ownPins as { revision_id: string }[]).map(p => p.revision_id)])]
    .filter(r => docOfRev.has(r))
  if (revIds.length === 0) return { system, sheets: [], conflicts: [], unpaired: [], codes, pidNumbers }

  const [{ data: revs }, allLines, allPins] = await Promise.all([
    db.from('document_revisions').select('id, rev, status, file_path').in('id', revIds),
    fetchAllRows(() => db.from('pid_markups').select(MARKUP_COLS).in('revision_id', revIds).eq('layer', 'losh').eq('kind', 'line')),
    fetchAllRows(() => db.from('pid_hotspots')
      .select('id, revision_id, tag_id, page_num, x_pct, y_pct, tags(tag_number, subsystems(system_id))')
      .in('revision_id', revIds).eq('project_id', x.projectId)),
  ])
  const revOf = new Map((revs ?? []).map(r => [r.id, r]))
  const lineRows = allLines
  const frames = pageFrames([...lineRows, ...marks])

  // Hojas: páginas con marcas del sistema.
  const sheets: LoshSheet[] = []
  for (const revId of revIds) {
    const doc = docOfRev.get(revId)!
    const rev = revOf.get(revId)
    const list = marks.filter(m => m.revision_id === revId).map(toMarkup).filter((m): m is Markup => !!m)
    if (!rev || list.length === 0) continue
    sheets.push({
      document_id: doc.id, number: doc.number, title: doc.title, revision_id: revId, rev: rev.rev, rev_status: rev.status,
      file_path: rev.file_path, pages: [...new Set(list.map(m => m.page_num))].sort((a, b) => a - b),
      markups: list, review: list.filter(m => m.needs_review).length,
    })
  }
  sheets.sort((a, b) => a.number.localeCompare(b.number))

  // Pines cruzados que tocan al sistema, por revisión.
  const conflicts: LoshConflict[] = []
  const pins = (allPins)
  for (const revId of revIds) {
    const doc = docOfRev.get(revId)!
    const frameOf = (page: number) => frames.get(`${revId}:${page}`) ?? null
    const lines = lineRows.filter(l => l.revision_id === revId && l.system_id).flatMap(l => {
      const f = frameOf(l.page_num)
      const m = toMarkup(l)
      return f && m ? [{ page_num: l.page_num, system_id: m.system_id, points: displayPoints(m, f.rotation) }] : []
    })
    const revPins = pins.filter(p => p.revision_id === revId)
    const found = pinConflicts(
      revPins.map(p => ({ id: p.id, page_num: p.page_num, x_pct: Number(p.x_pct), y_pct: Number(p.y_pct), system_id: p.tags?.subsystems?.system_id ?? null })),
      lines,
      page => frameOf(page)?.size ?? null,
    )
    for (const c of found) {
      const own = c.system_id === x.systemId
      if (!own && !c.other_system_ids.includes(x.systemId)) continue
      const pin = revPins.find(p => p.id === c.pin_id)!
      conflicts.push({
        document_id: doc.id, number: doc.number, page_num: c.page_num, tag_id: pin.tag_id, tag_number: pin.tags?.tag_number ?? '',
        system_id: c.system_id, other_system_id: own ? c.other_system_id : x.systemId, own,
      })
    }
  }
  conflicts.sort((a, b) => a.number.localeCompare(b.number) || a.page_num - b.page_num || a.tag_number.localeCompare(b.tag_number))

  // Conectores del sistema sin par (el par también es del sistema, así que alcanza con los suyos).
  const connectors = sheets.flatMap(s => s.markups.filter(m => m.kind === 'connector' && m.system_id === x.systemId)
    .map(m => ({ id: m.id, document_id: s.document_id, page_num: m.page_num, system_id: m.system_id, target_document_id: m.target_document_id, target_page: m.target_page })))
  const pairs = connectorPairs(connectors)
  const unpaired: LoshUnpaired[] = connectors.filter(c => !pairs.get(c.id)).map(c => ({
    markup_id: c.id, document_id: c.document_id, number: pidNumbers[c.document_id] ?? '', page_num: c.page_num,
    target_document_id: c.target_document_id, target_number: c.target_document_id ? pidNumbers[c.target_document_id] ?? null : null,
    target_page: c.target_page,
  }))

  return { system, sheets, conflicts, unpaired, codes, pidNumbers }
}
