/**
 * ¿Parece un número de tag? Las listas de ingeniería intercalan títulos de sección («SEPARADORES GENERALES
 * 762101A/B», «CUARTO SATÉLITE 1») y notas al pie («1. Los diagramas de lazo…», «NOTAS:») en la misma columna
 * del tag; antes bastaba «una letra y un dígito» y esas filas entraban como tags y como señales.
 *
 * Un tag: 2–40 caracteres, al menos una letra y un dígito, a lo sumo un espacio interno («FT 101», «P-101 A»),
 * sin «:» final ni numeración de nota («1. …», «2) …»). Sin dígitos solo con forma de código: mayúsculas en tres o
 * más segmentos con guion y sin espacios («TA-AC-URV», «CPF-DPS-A» de la lista eléctrica ELE-LI-102), que un título
 * de sección no tiene.
 */
const CODE_WITHOUT_DIGITS = /^[A-ZÁÉÍÓÚÜÑ]{1,8}(?:-[A-ZÁÉÍÓÚÜÑ0-9]{1,12}){2,}$/

export function looksLikeTag(value: string): boolean {
  const v = value.trim()
  if (v.length < 2 || v.length > 40) return false
  if (!/[A-Za-z]/.test(v)) return false
  if (!/\d/.test(v)) return CODE_WITHOUT_DIGITS.test(v)
  if ((v.match(/\s+/g) ?? []).length > 1) return false
  if (/[:;]$/.test(v)) return false
  if (/^\d+\s*[.)]\s/.test(v)) return false
  return true
}

/**
 * Números de tag de una celda de la lista. Las listas mecánicas agrupan trenes y equipos en una sola fila
 * (CPF Orotoy, MEE-LI-100 / MER-LI-102 / MEE-LI-101, 2026-10-29), y las señales y los instrumentos los nombran
 * uno por uno («P-762101A»):
 *  - letras: «P-762402 A/B/C/D/E/F», «P-762401A/B», «F-762002 A/C» → P-762402A…F; «P-762002 A» → P-762002A;
 *    «PR03-COND-01-A/B» → PR03-COND-01-A y PR03-COND-01-B (el guion se conserva);
 *  - tags completos: «TRF-76029001/TRF-76029002» → los dos;
 *  - números: «TK-762101 / 02», «BG-762103/ 04» → TK-762101, TK-762102 (el sufijo cambia los últimos dígitos);
 *  - dos tags en la celda (paquete y su bomba): «PQUIM-762102 P-762106» → los dos.
 * Lo que no es tag (títulos, «N/D», «HOLD») devuelve [].
 */
export function expandTagCell(value: string): string[] {
  const text = value.replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim()
  if (!text) return []
  const tokens: string[] = []
  for (const tok of text.split(' ')) {
    const prev = tokens[tokens.length - 1]
    if (prev && /\d$/.test(prev) && /^[A-Z](?:\/[A-Z])*$/i.test(tok)) tokens[tokens.length - 1] = prev + tok
    else tokens.push(tok)
  }
  const pieces = tokens.length > 1 && tokens.every(looksLikeTag) ? tokens : [tokens.join(' ')]
  return [...new Set(pieces.flatMap(expandGroup).filter(looksLikeTag))]
}

function expandGroup(tag: string): string[] {
  // Tags completos a cada lado de la barra (ELE-LI-102: «TRF-76029001/TRF-76029002», «PR02-DB-01A/PR02-DB-01B»).
  const parts = tag.split('/')
  if (parts.length > 1 && parts.every(p => looksLikeTag(p) && /^[A-Z]/i.test(p))) return parts
  const letters = /^(.*(?:\d-?|-))([A-Z](?:\/[A-Z])+)$/i.exec(tag)
  if (letters) return letters[2].split('/').map(l => letters[1] + l)
  const numbers = /^(.*?)(\d+)((?:\/\d+)+)$/.exec(tag)
  if (numbers && /[A-Z]/i.test(numbers[1])) {
    const [, prefix, first, rest] = numbers
    return [first, ...rest.slice(1).split('/')].map(n => n.length < first.length ? prefix + first.slice(0, first.length - n.length) + n : prefix + n)
  }
  return [tag]
}
