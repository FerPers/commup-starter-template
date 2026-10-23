// P4 (plan referente, «Control y entregable»): controles del LOSH, puros y sin DOM. Los usan el visor, la pestaña
// «Planos» de la ficha del sistema y la portada del PDF LOSH, así los tres cuentan lo mismo.
//  - Pin cruzado: el pin de un tag cae sobre el resalte de OTRO sistema y no sobre uno del suyo (decisión de Luis
//    2026-10-23: solo avisa, nunca bloquea; un instrumento puede estar dibujado junto a una línea ajena).
//  - Conector sin par: la hoja A dice que el sistema sigue en B (página p), pero B no tiene un conector del mismo
//    sistema que vuelva a A en esa página.

import { distanceToPolyline, type PageSize, type Pt } from './geometry'
import { markupMetrics } from './markups'

export type PinForControl = { id: string; page_num: number; x_pct: number; y_pct: number; system_id: string | null }
/** Línea resaltada con sus puntos ya en la rotación de la hoja (la misma de los pines). */
export type LineForControl = { page_num: number; system_id: string; points: Pt[] }

export type PinConflict = {
  pin_id: string
  page_num: number
  /** Sistema del tag del pin. */
  system_id: string
  /** Sistema de la línea ajena más cercana. */
  other_system_id: string
  /** Todos los sistemas ajenos con línea a tiro, del más cercano al más lejano. */
  other_system_ids: string[]
}

/**
 * Pines que caen sobre el resalte de otro sistema (a menos de `markupMetrics.hit` de la línea, medido en la página)
 * sin tener cerca una línea de su propio sistema. Un pin sin sistema no se controla. `sizeOf` da el tamaño de cada
 * hoja (null = sin tamaño conocido, la hoja no se controla).
 */
export function pinConflicts(pins: PinForControl[], lines: LineForControl[], sizeOf: (page: number) => PageSize | null): PinConflict[] {
  const byPage = new Map<number, LineForControl[]>()
  for (const l of lines) {
    if (l.points.length < 2) continue
    const list = byPage.get(l.page_num) ?? []
    list.push(l)
    byPage.set(l.page_num, list)
  }
  const out: PinConflict[] = []
  for (const pin of pins) {
    if (!pin.system_id) continue
    const pageLines = byPage.get(pin.page_num)
    const size = pageLines ? sizeOf(pin.page_num) : null
    if (!pageLines || !size) continue
    const tol = markupMetrics(size).hit
    const p = { x: pin.x_pct / 100, y: pin.y_pct / 100 }
    let own = false
    const foreign = new Map<string, number>()
    for (const l of pageLines) {
      const d = distanceToPolyline(p, l.points, size)
      if (d > tol) continue
      if (l.system_id === pin.system_id) { own = true; break }
      foreign.set(l.system_id, Math.min(d, foreign.get(l.system_id) ?? Infinity))
    }
    if (own || foreign.size === 0) continue
    const others = [...foreign.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id)
    out.push({ pin_id: pin.id, page_num: pin.page_num, system_id: pin.system_id, other_system_id: others[0], other_system_ids: others })
  }
  return out
}

export type ConnectorForControl = {
  id: string
  /** Documento P&ID donde está el conector. */
  document_id: string
  page_num: number
  system_id: string
  target_document_id: string | null
  target_page: number | null
}

/** ¿`b` es el conector de vuelta de `a`? Mismo sistema, cada uno en la hoja y página a la que apunta el otro. */
export function isConnectorPair(a: ConnectorForControl, b: ConnectorForControl): boolean {
  return a.id !== b.id && a.system_id === b.system_id
    && a.target_document_id === b.document_id && (a.target_page ?? 1) === b.page_num
    && b.target_document_id === a.document_id && (b.target_page ?? 1) === a.page_num
}

/** Par de cada conector (id → id del conector de vuelta, o null si no tiene). */
export function connectorPairs(connectors: ConnectorForControl[]): Map<string, string | null> {
  const out = new Map<string, string | null>()
  for (const c of connectors) out.set(c.id, connectors.find(o => isConnectorPair(c, o))?.id ?? null)
  return out
}

/** Texto del conector: número de la hoja destino y la página si no es la 1 («PID-002 · h. 2»). */
export function connectorText(target: { number: string } | null | undefined, page: number | null, sheetWord: string): string {
  if (!target) return '?'
  return (page ?? 1) > 1 ? `${target.number} · ${sheetWord} ${page}` : target.number
}
