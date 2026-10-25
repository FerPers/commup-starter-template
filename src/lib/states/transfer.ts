import { countParams, displayState, type DisplayState } from './tones'

export type OwnershipStage = 'commissioning' | 'shadowing' | 'joint_operation' | 'operations'

/** Traspaso a Operaciones (capa Entregado). Entregado a Operaciones es el otro relleno sólido. */
export const TRANSFER_STAGE_KEYS = ['commissioning', 'shadowing', 'jointOperation', 'operations'] as const
export const TRANSFER_STATE_KEYS = ['pendingSignatures', 'pendingSignaturesCount', 'completed', 'cancelled'] as const

export function transferStageState(stage: OwnershipStage | string): DisplayState {
  switch (stage) {
    case 'operations': return displayState('transferStage', 'operations', 'okSolid')
    case 'joint_operation': return displayState('transferStage', 'jointOperation', 'work')
    case 'shadowing': return displayState('transferStage', 'shadowing', 'work')
    default: return displayState('transferStage', 'commissioning', 'none')
  }
}

/** Un traspaso lleva dos firmas de personas distintas (Comisionamiento y Operaciones). */
export function transferState(t: { status: 'pending_signatures' | 'completed' | 'cancelled' | string; signaturesDone?: number | null }): DisplayState {
  if (t.status === 'completed') return displayState('transfer', 'completed', 'ok')
  if (t.status === 'cancelled') return displayState('transfer', 'cancelled', 'none', { icon: 'cancelled' })
  const params = countParams(t.signaturesDone, 2)
  return params ? displayState('transfer', 'pendingSignaturesCount', 'wait', { params }) : displayState('transfer', 'pendingSignatures', 'wait')
}
