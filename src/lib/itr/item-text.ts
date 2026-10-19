/**
 * Texto visible de un ítem de ITR (C-21, revisión 2026-10-19). `description` es el texto base;
 * `description_es`, la traducción. Una traducción vacía o en blanco cae al texto base: con `??`
 * un '' dejaba el ítem en blanco (la regla prefer-nullish-coalescing empuja a ese error).
 */
export function itemDescription(item: { description: string; description_es?: string | null }, lang: 'es' | 'en'): string {
  const es = item.description_es?.trim()
  return lang === 'es' && es ? es : item.description
}
