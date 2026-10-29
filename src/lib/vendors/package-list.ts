import { cellText, detectHeaderRow, type ColumnKeywords } from '@/lib/excel/detect-header'
import { expandTagCell } from '@/lib/import/tag-shape'

// Paquetes de vendor desde la lista de equipos tipo paquete (decisión de Luis, 2026-10-29; CPF Orotoy MEE-LI-101):
// cada fila con número de ítem es un paquete (tags de la fila, título = EQUIPO, alcance = TIPO); los sub-ítems
// («3.1 Clarificador…») son componentes de su paquete; las filas con el mismo alcance se agrupan (19 skids de
// inyección de químicos = un paquete, un proveedor). Puro: lo prueba package-list.test.ts.

export const PACKAGE_LIST_COLUMNS: ColumnKeywords = {
  item:  ['=ITEM', '=ÍTEM', '=NO.', '=N°'],
  tag:   ['TAG', 'ETIQUETA'],
  title: ['EQUIPO', 'EQUIPMENT', 'DESCRIPCION', 'DESCRIPCIÓN', 'NOMBRE'],
  scope: ['=TIPO', 'ALCANCE', 'SCOPE', '=TYPE'],
}

export type ListedPackage = {
  /** Ítems de la lista que forman el paquete («7», «8»…). */
  items: string[]
  title: string
  scope: string
  tags: string[]
  components: string[]
}

const norm = (v: string) => v.replace(/\s+/g, ' ').trim()
const key = (v: string) => norm(v).toUpperCase()

/** Palabras comunes al inicio de varios títulos («Puente Grua shelter 1A…», «…1B…» → «Puente Grua shelter»). */
function commonTitle(titles: string[]): string {
  if (new Set(titles.map(key)).size === 1) return titles[0]
  const words = titles.map(t => t.split(' '))
  const out: string[] = []
  for (let i = 0; i < words[0].length && words.every(w => w[i] && w[i].toUpperCase() === words[0][i].toUpperCase()); i++) out.push(words[0][i])
  return out.length >= 2 ? out.join(' ') : titles[0]
}

/** Alcance final del paquete: el texto de la lista y, si los hay, sus componentes (sub-ítems). */
export function packageScope(p: ListedPackage): string {
  return [p.scope, p.components.length ? `Componentes:\n${p.components.map(c => `- ${c}`).join('\n')}` : ''].filter(Boolean).join('\n\n')
}

/**
 * Paquetes de la hoja (filas tal como salen de sheet_to_json con header: 1, texto formateado). `group` une las filas
 * con el mismo alcance (si es una descripción, no un rótulo corto). Sin columnas de ítem y título devuelve [].
 */
export function parsePackageList(raw: unknown[][], group = true): ListedPackage[] {
  const { headerRowIdx, colIndex } = detectHeaderRow(raw, PACKAGE_LIST_COLUMNS)
  if (colIndex.item === undefined || colIndex.title === undefined) return []
  const rows: ListedPackage[] = []
  let parent: ListedPackage | null = null
  for (let i = headerRowIdx + 1; i < raw.length; i++) {
    const get = (f: string) => norm(cellText(raw[i] ?? [], colIndex[f]))
    const item = get('item')
    if (/^NOTAS?\b/i.test(item)) break
    if (!/^\d+(\.\d+)?$/.test(item)) continue
    // «(NOTA 7)» remite a las notas de la lista, no es parte del nombre.
    const title = norm(get('title').replace(/\(\s*NOTAS?\s*[\d\s,y&]+\)/gi, '')), scope = get('scope')
    if (!title) continue
    const sub = /^(\d+)\.\d+$/.exec(item)
    if (sub && parent && parent.items[0] === sub[1]) {
      parent.components.push([title, scope].filter(Boolean).join(' — '))
      continue
    }
    parent = { items: [item], title, scope, tags: expandTagCell(get('tag')), components: [] }
    rows.push(parent)
  }
  if (!group) return rows
  // Solo un alcance descriptivo agrupa: dos filas con «Bomba centrífuga» no son el mismo suministro.
  const groups = new Map<string, ListedPackage[]>()
  const order: Array<ListedPackage | string> = []
  for (const p of rows) {
    if (p.scope.length <= 40) { order.push(p); continue }
    const k = key(p.scope)
    if (!groups.has(k)) { groups.set(k, []); order.push(k) }
    groups.get(k)!.push(p)
  }
  return order.map(o => {
    if (typeof o !== 'string') return o
    const members = groups.get(o)!
    if (members.length === 1) return members[0]
    return {
      items: members.flatMap(m => m.items), title: commonTitle(members.map(m => m.title)), scope: members[0].scope,
      tags: [...new Set(members.flatMap(m => m.tags))], components: members.flatMap(m => m.components),
    }
  })
}
