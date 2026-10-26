/**
 * ¿Parece un número de tag? Las listas de ingeniería intercalan títulos de sección («SEPARADORES GENERALES
 * 762101A/B», «CUARTO SATÉLITE 1») y notas al pie («1. Los diagramas de lazo…», «NOTAS:») en la misma columna
 * del tag; antes bastaba «una letra y un dígito» y esas filas entraban como tags y como señales.
 *
 * Un tag: 2–40 caracteres, al menos una letra y un dígito, a lo sumo un espacio interno («FT 101», «P-101 A»),
 * sin «:» final ni numeración de nota («1. …», «2) …»).
 */
export function looksLikeTag(value: string): boolean {
  const v = value.trim()
  if (v.length < 2 || v.length > 40) return false
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return false
  if ((v.match(/\s+/g) ?? []).length > 1) return false
  if (/[:;]$/.test(v)) return false
  if (/^\d+\s*[.)]\s/.test(v)) return false
  return true
}
