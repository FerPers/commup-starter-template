import { looksLikeTag } from '@/lib/import/tag-shape'

/**
 * Sistema › subsistema desde los TÍTULOS DE SECCIÓN de una lista de ingeniería (decisión de Luis, 2026-10-26).
 * Las listas de instrumentos y de señales no traen columnas de sistema: lo agrupan con filas de título
 * («SISTEMA DE CRUDO» › «MULTIPLES DE RECIBO», luego las filas de tags). Reglas:
 *  - Título = fila con UNA sola celda con texto, en mayúsculas, que no es un tag ni una nota («1. …», «NOTAS:»).
 *  - Los títulos seguidos se apilan; la primera fila de datos después de la pila la resuelve:
 *    · subsistema = el último título de la pila;
 *    · sistema = el último título de la pila (antes del subsistema) que empieza por «SISTEMA(S)»/«SYSTEM(S)»;
 *      si la pila es un solo título que empieza así, es sistema y subsistema a la vez («SISTEMA DE TEA»);
 *      si no hay ninguno, sigue el sistema anterior (o ninguno: el importador usa el sistema general).
 *    Así «CONTROLADOR PRINCIPAL F&G» seguido de «SEPARADORES…» no se vuelve sistema.
 */

export type Section = { system: string | null; subsystem: string }

const SYSTEM_HEAD = /^(?:SISTEMAS?|SYSTEMS?)\b/i

function headingText(row: unknown[]): string | null {
  const cells = row.map(v => String(v ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean)
  if (cells.length !== 1) return null
  const text = cells[0]
  if (text.length < 3 || text.length > 160) return null
  if (looksLikeTag(text)) return null
  if (/^\d+\s*[.)-]\s/.test(text) || /^NOTAS?\b/i.test(text) || /^\(?\*/.test(text)) return null
  const letters = text.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '')
  if (letters.length < 3) return null
  const lower = letters.replace(/[^a-záéíóúüñ]/g, '').length
  return lower / letters.length <= 0.2 ? text : null
}

/**
 * Sección de cada fila de datos (índice de fila → sección). `isData` decide qué fila es dato (p. ej. su tag tiene
 * forma de tag). Filas de datos antes del primer título no tienen sección.
 */
export function sectionsByRow(rawRows: unknown[][], dataStart: number, isData: (row: unknown[]) => boolean): Map<number, Section> {
  const out = new Map<number, Section>()
  let stack: string[] = []
  let current = null as Section | null
  for (let i = dataStart; i < rawRows.length; i++) {
    const row = rawRows[i]
    if (isData(row)) {
      if (stack.length > 0) {
        const subsystem = stack[stack.length - 1]
        const sysHead = [...stack].reverse().find((h, k) => SYSTEM_HEAD.test(h) && (k > 0 || stack.length === 1))
        current = { system: sysHead ?? current?.system ?? null, subsystem }
        stack = []
      }
      if (current) out.set(i, current)
      continue
    }
    const heading = headingText(row)
    if (heading) stack.push(heading)
  }
  return out
}

const STOPWORDS = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y', 'E', 'A', 'EN', 'PARA', 'CON', 'OF', 'THE', 'AND'])

/** Código estable de un título: «SISTEMA DE CRUDO» → «SISTEMA-CRUDO»; máx. 40 caracteres, corta en palabra. */
export function sectionCode(title: string): string {
  const words = title.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .split(/[^A-Z0-9]+/).filter(w => w && !STOPWORDS.has(w))
  let code = ''
  for (const w of words) {
    const next = code ? `${code}-${w}` : w
    if (next.length > 40) break
    code = next
  }
  return code || title.slice(0, 40).toUpperCase()
}
