/**
 * A08 — Contrato de estados (maqueta «A08 + A19», aprobada por Luis 2026-10-25: paleta A).
 *
 * Seis preguntas en orden (las «capas»): Alcance → Diligenciado → Conforme → Aprobado → Liberado → Entregado.
 * Cada registro responde la suya y un 100 % en una no dice nada de la siguiente.
 *
 * Ocho tonos, un significado cada uno (texto e ícono siempre; nunca solo color):
 * - none     gris: no empezó, o no aplica
 * - nodata   rayado: no se sabe; nunca cuenta como 0 pendientes
 * - work     azul: en trabajo, le toca a quien lo tiene
 * - wait     violeta: espera a otra persona (revisar, firmar, verificar, aprobar)
 * - ok       verde: aceptado y vigente (registro, en chip)
 * - okSolid  verde sólido: Liberado o Entregado (nivel sistema); el único relleno
 * - cond     ámbar: aceptado con condiciones, o desactualizado
 * - bad      rojo: bloquea o falló; solo esto es rojo
 *
 * Colores por token (G-10): chip = fondo 50 + texto 700 + borde 200; el relleno usa `--solid-*` con texto blanco.
 */

export type Tone = 'none' | 'nodata' | 'work' | 'wait' | 'ok' | 'okSolid' | 'cond' | 'bad'

export const TONES: readonly Tone[] = ['none', 'nodata', 'work', 'wait', 'ok', 'okSolid', 'cond', 'bad']

/** Ícono por significado; `StateChip` lo traduce a lucide. */
export type StateIcon =
  | 'none' | 'nodata' | 'work' | 'wait' | 'ok' | 'cond' | 'bad'
  | 'returned' | 'regressed' | 'cancelled' | 'category'

export type ToneStyle = { bg: string; fg: string; border: string; borderStyle: 'solid' | 'dashed'; icon: StateIcon }

export const TONE_STYLE: Record<Tone, ToneStyle> = {
  none:    { bg: 'var(--gray-100)',    fg: 'var(--text-body)',   border: 'var(--gray-200)',    borderStyle: 'solid',  icon: 'none' },
  nodata:  { bg: 'var(--nodata-bg)',   fg: 'var(--text-body)',   border: 'var(--nodata-border)', borderStyle: 'dashed', icon: 'nodata' },
  work:    { bg: 'var(--primary-50)',  fg: 'var(--primary-700)', border: 'var(--primary-200)', borderStyle: 'solid',  icon: 'work' },
  wait:    { bg: 'var(--violet-50)',   fg: 'var(--violet-700)',  border: 'var(--violet-200)',  borderStyle: 'solid',  icon: 'wait' },
  ok:      { bg: 'var(--success-50)',  fg: 'var(--success-700)', border: 'var(--success-200)', borderStyle: 'solid',  icon: 'ok' },
  okSolid: { bg: 'var(--solid-success-700)', fg: '#fff',         border: 'var(--solid-success-700)', borderStyle: 'solid', icon: 'ok' },
  cond:    { bg: 'var(--warning-50)',  fg: 'var(--warning-700)', border: 'var(--warning-200)', borderStyle: 'solid',  icon: 'cond' },
  bad:     { bg: 'var(--danger-50)',   fg: 'var(--danger-700)',  border: 'var(--danger-200)',  borderStyle: 'solid',  icon: 'bad' },
}

/** Familias de registros; la etiqueta de cada estado vive en `States.<familia>.<clave>` (es y en). */
export type StateFamily =
  | 'itr' | 'punch' | 'punchCategory' | 'certificate' | 'pssr' | 'gate'
  | 'transferStage' | 'transfer' | 'handover' | 'requirement'

/** La capa (pregunta del contrato) que responde cada familia. */
export type Layer = 'scope' | 'filled' | 'conforming' | 'approved' | 'released' | 'handedOver'
export const LAYERS: readonly Layer[] = ['scope', 'filled', 'conforming', 'approved', 'released', 'handedOver']

export type DisplayState = {
  family: StateFamily
  /** Clave de la etiqueta en `States.<family>`. */
  key: string
  tone: Tone
  icon: StateIcon
  /** Valores de la etiqueta ICU (p. ej. `{ done: 1, required: 3 }`). */
  params?: Record<string, number | string>
  /** Marca secundaria (p. ej. Liberado con condiciones = sólido con borde ámbar). */
  accent?: Tone
}

export function displayState(family: StateFamily, key: string, tone: Tone, extra: Partial<Pick<DisplayState, 'icon' | 'params' | 'accent'>> = {}): DisplayState {
  return { family, key, tone, icon: extra.icon ?? TONE_STYLE[tone].icon, ...(extra.params ? { params: extra.params } : {}), ...(extra.accent ? { accent: extra.accent } : {}) }
}

/** Aceptado y vigente: lo único que puede sumar como «hecho» en un porcentaje. */
export const isAcceptedTone = (t: Tone) => t === 'ok' || t === 'okSolid'

/** n/m solo si las dos cifras se conocen (si no, la etiqueta sin cuenta). */
export function countParams(done: number | null | undefined, required: number | null | undefined): { done: number; required: number } | null {
  return typeof done === 'number' && typeof required === 'number' && required > 0 ? { done, required } : null
}
