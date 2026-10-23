// Colores por sistema (P1): `systems.color` es estable dentro del proyecto. La BD asigna al crear el menos usado
// de esta paleta (= SQL system_palette(), test de paridad) y el usuario puede cambiarlo en la ficha del sistema.
export const SYSTEM_PALETTE = [
  '#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ea580c', '#0891b2',
  '#ca8a04', '#db2777', '#4f46e5', '#059669', '#b91c1c', '#7c3aed',
] as const

export const NO_SYSTEM_COLOR = '#94a3b8'

/** Color válido para `systems.color` (= CHECK systems_color_hex), en minúsculas; null si no lo es. */
export function normalizeSystemColor(raw: string | null | undefined): string | null {
  const c = (raw ?? '').trim().toLowerCase()
  return /^#[0-9a-f]{6}$/.test(c) ? c : null
}
