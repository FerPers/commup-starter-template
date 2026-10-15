// Colores por sistema para el P&ID (fase 2): paleta categórica estable. El índice sale del
// orden por código de los sistemas presentes, así el mismo plano siempre pinta igual.
export const SYSTEM_PALETTE = [
  '#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ea580c', '#0891b2',
  '#ca8a04', '#db2777', '#4f46e5', '#059669', '#b91c1c', '#7c3aed',
] as const

export const NO_SYSTEM_COLOR = '#94a3b8'

/** id de sistema → color, asignado por orden de código. Más sistemas que colores: la paleta se repite. */
export function systemColorMap(systems: { id: string; code: string }[]): Map<string, string> {
  const unique = [...new Map(systems.map(s => [s.id, s])).values()].sort((a, b) => a.code.localeCompare(b.code))
  return new Map(unique.map((s, i) => [s.id, SYSTEM_PALETTE[i % SYSTEM_PALETTE.length]]))
}
