// Matriz causa-efecto (fase 4 · bloque D, migración 20261016210000). Lógica pura compartida por
// la pantalla y las acciones: catálogos, validación de entradas y lectura de la matriz.

export const CE_VOTINGS = ['1oo1', '1oo2', '2oo2', '2oo3', 'other'] as const
export type CeVoting = typeof CE_VOTINGS[number]

export const CE_ACTIONS = ['close', 'open', 'trip', 'start', 'stop', 'alarm', 'other'] as const
export type CeAction = typeof CE_ACTIONS[number]

export const CE_ACTION_LABELS: Record<CeAction, string> = {
  close: 'Cerrar', open: 'Abrir', trip: 'Disparo', start: 'Arrancar', stop: 'Parar', alarm: 'Alarma', other: 'Otra',
}

export const CE_VOTING_LABELS: Record<CeVoting, string> = {
  '1oo1': '1oo1', '1oo2': '1oo2', '2oo2': '2oo2', '2oo3': '2oo3', other: 'Otra',
}

export type CeLinkType = 'direct' | 'delayed'
export type CeLink = { cause_id: string; effect_id: string; link_type: CeLinkType; delay_s: number | null }

export type CeCause = { id: string; seq: number; code: string; description: string; tag_number: string | null; signal_tag: string | null; condition: string | null; setpoint: string | null; voting: CeVoting | null; notes: string | null }
export type CeEffect = { id: string; seq: number; code: string; description: string; tag_number: string | null; action: CeAction; notes: string | null }

/** Código de causa/efecto: mayúsculas, sin espacios extremos, 1–30 caracteres. */
export function normalizeCeCode(value: string): string | null {
  const code = value.trim().toUpperCase().replace(/\s+/g, ' ')
  return code.length >= 1 && code.length <= 30 ? code : null
}

/** Retardo de un cruce: vacío = directo; número ≥ 0 = con retardo (s). */
export function parseDelay(value: string): { link_type: CeLinkType; delay_s: number | null } | { error: string } {
  const raw = value.trim().replace(',', '.')
  if (raw === '') return { link_type: 'direct', delay_s: null }
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return { error: 'El retardo debe ser un número de segundos ≥ 0' }
  return { link_type: 'delayed', delay_s: n }
}

/** Siguiente número de orden para una causa o efecto nuevo. */
export function nextSeq(rows: { seq: number }[]): number {
  return rows.reduce((max, r) => Math.max(max, r.seq), 0) + 10
}

/** Huecos de la matriz: causas sin efecto y efectos sin causa (casi siempre un error de carga). */
export function matrixGaps(causes: { id: string }[], effects: { id: string }[], links: { cause_id: string; effect_id: string }[]) {
  const linkedCauses = new Set(links.map(l => l.cause_id))
  const linkedEffects = new Set(links.map(l => l.effect_id))
  return {
    causesWithoutEffect: causes.filter(c => !linkedCauses.has(c.id)).map(c => c.id),
    effectsWithoutCause: effects.filter(e => !linkedEffects.has(e.id)).map(e => e.id),
  }
}

/** Texto corto de una celda: «X» directo, «T5s» con retardo. */
export function linkLabel(link: Pick<CeLink, 'link_type' | 'delay_s'> | undefined): string {
  if (!link) return ''
  return link.link_type === 'delayed' ? `T${link.delay_s ?? ''}s` : 'X'
}
