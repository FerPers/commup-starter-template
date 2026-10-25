/** A08 — contrato de estados: un solo lugar para el tono, el ícono y la etiqueta de cada estado. Ver `tones.ts`. */
import { CERTIFICATE_STATE_KEYS } from './certificate'
import { GATE_STATE_KEYS } from './gate'
import { HANDOVER_STATE_KEYS } from './handover'
import { ITR_STATE_KEYS } from './itr'
import { PSSR_STATE_KEYS } from './pssr'
import { PUNCH_CATEGORY_KEYS, PUNCH_STATE_KEYS } from './punch'
import { REQUIREMENT_STATE_KEYS } from './requirement'
import type { StateFamily } from './tones'
import { TRANSFER_STAGE_KEYS, TRANSFER_STATE_KEYS } from './transfer'

export * from './tones'
export * from './itr'
export * from './punch'
export * from './certificate'
export * from './pssr'
export * from './gate'
export * from './transfer'
export * from './handover'
export * from './requirement'

/** Claves de etiqueta por familia (las prueba `contract.test.ts` contra es y en). */
export const STATE_KEYS: Record<StateFamily, readonly string[]> = {
  itr: ITR_STATE_KEYS,
  punch: PUNCH_STATE_KEYS,
  punchCategory: PUNCH_CATEGORY_KEYS,
  certificate: CERTIFICATE_STATE_KEYS,
  pssr: PSSR_STATE_KEYS,
  gate: GATE_STATE_KEYS,
  transferStage: TRANSFER_STAGE_KEYS,
  transfer: TRANSFER_STATE_KEYS,
  handover: HANDOVER_STATE_KEYS,
  requirement: REQUIREMENT_STATE_KEYS,
}

