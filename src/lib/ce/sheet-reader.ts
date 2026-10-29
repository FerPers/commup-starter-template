import { expandTagCell, looksLikeTag } from '@/lib/import/tag-shape'
import type { AiCeOutput } from './import'
import type { CeAction, CeVoting } from './matrix'

// Lectura SIN IA de una matriz C&E en Excel (decisión de Luis, 2026-10-29): las matrices de CPF Orotoy (GG-007
// proceso, GG-008 F&G) tienen estructura fija — efectos en columnas (fila de tags de salida, fila de acción, fila de
// descripción), causas en filas (tag, estado, valor, descripción, ítem) y cruces marcados con «x» — y la IA leía
// exactamente lo mismo (58 / 95 / 83 cruces) por ~0,35 USD y 2 minutos por hoja. Devuelve la misma forma que la IA
// (AiCeOutput) para reutilizar la revisión; null si la hoja no tiene esa estructura (entonces se ofrece la IA).
// Lo que no lee: retardos escritos en las notas al pie y avisos de inconsistencias del documento.
// Puro: lo prueba sheet-reader.test.ts.

const MARK = /^[xX•●✓]$/
// Cruce temporizado: «T20», «T 5 s», «20 s» (un número suelto no es cruce).
const DELAY = /^(?:T\s*(\d+(?:[.,]\d+)?)\s*(?:s|seg|sec)?|(\d+(?:[.,]\d+)?)\s*(?:s|seg|sec))$/i

const ACTIONS: Array<[RegExp, CeAction]> = [
  [/\b(cierra|cerrar|close|closes)\b/i, 'close'],
  [/\b(abre|abrir|open|opens)\b/i, 'open'],
  [/\b(para|parar|apaga|detiene|stop|stops)\b/i, 'stop'],
  [/\b(arranca|arrancar|enciende|start|starts)\b/i, 'start'],
  [/\b(disparo|dispara|trip)\b/i, 'trip'],
  [/\b(alarma|alarm|sirena|baliza|beacon)\b/i, 'alarm'],
]
const toAction = (...texts: string[]): CeAction => {
  for (const text of texts) for (const [re, action] of ACTIONS) if (re.test(text)) return action
  return 'other'
}
const toVoting = (v: string): CeVoting | null => {
  const m = /\b([12])\s*oo\s*([123])\b/i.exec(v)
  if (!m) return null
  const k = `${m[1]}oo${m[2]}`
  return (['1oo1', '1oo2', '2oo2', '2oo3'] as const).find(x => x === k) ?? 'other'
}

type CauseCols = { condition?: number; setpoint?: number; description?: number; item?: number; voting?: number }
const CAUSE_HEADERS: Array<[keyof CauseCols, RegExp]> = [
  ['condition', /^(ESTADO|CONDICI[OÓ]N|CONDITION|STATE)\b/i],
  ['setpoint', /^(VALOR|SET\s*POINT|SETPOINT|AJUSTE|ALARMA)\b/i],
  ['description', /^(DESCRIPCI[OÓ]N|DESCRIPTION)\b/i],
  ['item', /^(ITEM|ÍTEM|N[O°º]\.?)$/i],
  ['voting', /^(L[OÓ]GICA|VOTACI[OÓ]N|VOTING|LOGIC)\b/i],
]

export function readCeSheet(raw: unknown[][]): AiCeOutput | null {
  const rows = raw.map(r => (r ?? []).map(v => String(v ?? '').replace(/\s+/g, ' ').trim()))
  // Fila de tags de los efectos: la que más celdas con forma de tag tiene fuera de la primera columna (empate: la de
  // más abajo, la «OUTPUT (TAG NO.)» y no la de equipos del encabezado).
  let effRow = -1, best = 1
  rows.slice(0, 60).forEach((r, i) => {
    const n = r.slice(1).filter(looksLikeTag).length
    if (n >= best) { best = n; effRow = i }
  })
  if (effRow < 0) return null
  const effCols = rows[effRow].map((c, j) => (j > 0 && looksLikeTag(c) ? j : -1)).filter(j => j >= 0)
  const firstEff = Math.min(...effCols)

  // Encabezado de las causas (columnas antes de los efectos): la fila con más rótulos reconocidos.
  const cols: CauseCols = {}
  let headerRow = -1, headerHits = 0
  for (let i = 0; i < Math.min(rows.length, effRow + 6); i++) {
    const found: CauseCols = {}
    rows[i].slice(0, firstEff).forEach((c, j) => {
      for (const [k, re] of CAUSE_HEADERS) if (found[k] === undefined && re.test(c)) found[k] = j
    })
    const hits = Object.keys(found).length
    if (hits > headerHits) { headerHits = hits; headerRow = i; Object.assign(cols, found) }
  }

  // Filas de acción y de descripción de los efectos (arriba de la de tags).
  const above = rows.slice(0, effRow).map((r, i) => ({ r, i }))
  const actionRow = above.find(({ r }) => effCols.filter(j => toAction(r[j] ?? '') !== 'other').length > effCols.length / 3)?.i
  // La descripción puede venir en la misma fila que la acción (F&G: «ACTIVACIÓN ALARMA SONORA»); con empate gana
  // otra fila (GG-007: «cierra» arriba y «Válvula Solenoide de…» debajo).
  const descRow = above
    .map(({ r, i }) => ({ i, n: effCols.filter(j => (r[j] ?? '').length > 8 && !looksLikeTag(r[j])).length }))
    .sort((a, b) => b.n - a.n || Number(a.i === actionRow) - Number(b.i === actionRow) || b.i - a.i)[0]
  const effects = effCols.map((j, k) => {
    const tag = rows[effRow][j]
    const description = (descRow && descRow.n > 0 ? rows[descRow.i][j] : '') || tag
    return {
      code: `E-${String(k + 1).padStart(2, '0')}`, description, tag,
      action: toAction(actionRow !== undefined ? rows[actionRow][j] ?? '' : '', description),
      uncertain: false, note: null,
    }
  })

  // Causas: desde debajo del encabezado; una fila sin tag pero con cruces continúa la anterior (GD: pre-alarma,
  // alarma, falla). Los títulos de sección (número de P&ID, «Revisión: 3») no tienen descripción ni cruces.
  const causes: AiCeOutput['causes'] = []
  const links: AiCeOutput['links'] = []
  const codes = new Set<string>()
  let lastTag = ''
  const get = (r: string[], k: keyof CauseCols) => (cols[k] !== undefined ? r[cols[k]!] ?? '' : '')
  for (let i = Math.max(effRow, headerRow) + 1; i < rows.length; i++) {
    const r = rows[i]
    if (/^NOTAS?\b/i.test(r[0] ?? '')) break
    const marked = effCols.filter(j => MARK.test(r[j] ?? '') || DELAY.test(r[j] ?? ''))
    const tags = expandTagCell(r[0] ?? '')
    const description = get(r, 'description'), condition = get(r, 'condition')
    if (!marked.length && !(tags.length && (description || condition))) continue
    if (tags.length) lastTag = tags[0]
    const tag = tags[0] ?? lastTag
    if (!tag && !description) continue
    let code = get(r, 'item') || `C-${String(causes.length + 1).padStart(2, '0')}`
    for (let n = 2; codes.has(code.toUpperCase()); n++) code = `${get(r, 'item') || 'C'}-${n}`
    codes.add(code.toUpperCase())
    causes.push({
      code, description: description || condition || tag, tag: tag || null, signal: null,
      condition: condition || null, setpoint: get(r, 'setpoint') || null, voting: toVoting(get(r, 'voting') || r[0] || ''),
      uncertain: false, note: tags.length > 1 ? `Tags de la causa: ${tags.join(', ')}` : null,
    })
    for (const j of marked) {
      const d = DELAY.exec(r[j] ?? '')
      links.push({ cause_code: code, effect_code: effects[effCols.indexOf(j)].code, delay_s: d ? Number((d[1] ?? d[2]).replace(',', '.')) : null, uncertain: false })
    }
  }
  if (!causes.length || !links.length) return null

  const revision = rows.slice(0, 12).flat().map(c => /^Revisi[oó]n:?\s*([^\s:]\S*)$/i.exec(c)?.[1]).find(Boolean) ?? null
  // Número del documento de la matriz (no un P&ID citado en una causa).
  const document = rows.slice(0, 12).flat().find(c => /^[A-Z0-9]{2,}(-[A-Z0-9]+){4,}$/.test(c) && !/PID/i.test(c)) ?? null
  return {
    matrix_title: null, source_document: document, revision,
    causes, effects, links,
    warnings: ['Leída sin IA desde la estructura de la hoja: los retardos que solo figuran en las notas al pie no se leen (márcalos en la grilla) y no hay revisión de inconsistencias del documento.'],
  }
}
