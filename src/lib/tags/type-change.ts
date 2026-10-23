// R3: forma de lo que devuelve `tag_type_change_preview` (SQL, migración 20261208120000). La BD calcula con las reglas
// del motor de requisitos qué gana y qué deja de requerirse el conjunto de tags con el tipo nuevo; aquí solo se tipa.

export type CodeCount = { code: string; n: number }

export type TagTypePreview = {
  tags: number
  /** Tags cuyo tipo cambia de verdad. */
  changed: number
  required_before: number
  required_after: number
  /** Requisitos (tag × código) que aparecen con el tipo nuevo. */
  gain: number
  /** De esos, cuántos no tienen ITR todavía (los que «Generar ITR» crearía). */
  gain_to_generate: number
  gain_codes: CodeCount[]
  /** Requisitos sin ITR que desaparecen (nada que hacer). */
  dropped: number
  /** ITR existentes que hoy son requeridos y quedan «fuera de requisitos» (nunca se borran). */
  outside: number
  outside_signed: number
  outside_codes: CodeCount[]
  /** Reglas aceptadas de la matriz del tipo nuevo (0 = tipo sin reglas: los tags pasan a «Sin regla»). */
  type_rules: number
}

/** Motivo mínimo cuando el cambio deja ITR fuera de requisitos. */
export const TYPE_CHANGE_REASON_MIN = 10

export const needsReason = (p: Pick<TagTypePreview, 'outside'>) => p.outside > 0

/** Lista corta de códigos («E01A ×4, I01A ×4 … +3»). */
export function codeList(codes: CodeCount[], max = 4): string {
  const head = codes.slice(0, max).map(c => (c.n > 1 ? `${c.code} ×${c.n}` : c.code)).join(', ')
  return codes.length > max ? `${head} … +${codes.length - max}` : head
}
