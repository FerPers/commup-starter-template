/**
 * C-29 (N1b): «Siguiente pendiente» en la ejecución del ITR desde el teléfono.
 * Recibe los ítems obligatorios que faltan, en el orden de la plantilla, y la posición vertical de cada uno
 * respecto de la pantalla (getBoundingClientRect().top). Devuelve el primero que está por debajo de la
 * franja superior; si ya se pasaron todos, vuelve al primero (recorrido circular).
 */
export function nextPendingItemId(
  missingInOrder: readonly string[],
  topOf: (id: string) => number | null,
  /** Lo que queda por encima de esta línea (encabezado, ítem actual) ya se vio. */
  threshold = 120,
): string | null {
  if (missingInOrder.length === 0) return null
  for (const id of missingInOrder) {
    const top = topOf(id)
    if (top !== null && top > threshold) return id
  }
  return missingInOrder[0]
}
