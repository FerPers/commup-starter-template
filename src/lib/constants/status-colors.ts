// Paletas de punch compartidas por PunchListView, PunchDetail, TagPunchTab, NewPunchForm y la disposición del PSSR.
// A08 (contrato de estados, 2026-10-25): salen de `@/lib/states` (punchState / punchCategoryState), no de colores
// propios: el estado del punch no usa rojo (Abierto = gris) y la gravedad la lleva la categoría (Cat A rojo).
// Las etiquetas siguen en cada vista (i18n). El ITR ya no tiene paleta aquí: `itrState` + `StateChip`.
import { TONE_STYLE, punchCategoryState, punchState, type PunchCategory } from '@/lib/states'

const tone = (t: ReturnType<typeof punchState>['tone']) => ({ color: TONE_STYLE[t].fg, bg: TONE_STYLE[t].bg, border: TONE_STYLE[t].border })

export const PUNCH_CATEGORY_CFG = Object.fromEntries((['A', 'B', 'C'] as const).map(c => [c, { label: `Cat ${c}`, ...tone(punchCategoryState(c).tone) }])) as
  Record<PunchCategory, { label: string; color: string; bg: string; border: string }>

/** `resolved` = sub-estado de in_progress (resolved_at): espera verificación en campo por otra persona. */
export const PUNCH_STATUS_COLORS = {
  open:        tone(punchState({ status: 'open' }).tone),
  in_progress: tone(punchState({ status: 'in_progress' }).tone),
  resolved:    tone(punchState({ status: 'in_progress', resolvedAt: 'x' }).tone),
  closed:      tone(punchState({ status: 'closed' }).tone),
  cancelled:   tone(punchState({ status: 'cancelled' }).tone),
} as const
