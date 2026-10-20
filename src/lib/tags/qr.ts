// QR / NFC de tags (S13, F-18/C-31). Puro: lo usan el escáner (cliente), las etiquetas PDF (servidor) y Tag 360.
//
// - La etiqueta impresa lleva `<origen>/tag_360/<uuid>`: el UUID no se repite entre proyectos, el número sí
//   (fases, brownfield), así que es lo único que resuelve sin ambigüedad.
// - Un QR o NFC ajeno (texto plano, `commup://tag/…`, URL con el número) se acepta tal cual: Tag 360 busca por la
//   clave normalizada `tags.tag_key` y, si hay varias coincidencias, ofrece elegir.

const MAX_TAG_TEXT = 120

export function tagQrUrl(origin: string, tagId: string): string {
  return `${origin.replace(/\/+$/, '')}/tag_360/${tagId}`
}

/** Identificador del tag (UUID o número, sin cambiar mayúsculas) a partir del texto escaneado o tecleado. */
export function parseTagScan(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null
  const url = text.match(/\/tag_360\/([^?#]+)/i) ?? text.match(/^commup:\/\/tag\/([^?#]+)/i)
  let id = url ? url[1].replace(/\/+$/, '') : text
  try { id = decodeURIComponent(id) } catch { /* %-secuencia inválida: se usa tal cual */ }
  id = id.trim()
  if (!id || id.length > MAX_TAG_TEXT || /[\r\n]/.test(id)) return null
  return id
}

/** Ruta de Tag 360 para el identificador; `lastProjectId` ordena primero ese proyecto si hay varias coincidencias. */
export function tag360Path(id: string, lastProjectId?: string | null): string {
  const q = lastProjectId ? `?p=${encodeURIComponent(lastProjectId)}` : ''
  return `/tag_360/${encodeURIComponent(id)}${q}`
}
