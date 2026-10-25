import { displayState, type DisplayState } from './tones'

export type HandoverPackageStatus = 'DRAFT' | 'GENERATING' | 'ISSUED' | 'PARTIAL' | 'FAILED' | 'SUPERSEDED'

/** Paquete de handover (capa Entregado). PARCIAL = firmado y verificable pero incompleto (A10): ámbar, nunca verde. */
export const HANDOVER_STATE_KEYS = ['draft', 'generating', 'issued', 'partial', 'failed', 'superseded'] as const

export function handoverState(status: HandoverPackageStatus | string): DisplayState {
  switch (status) {
    case 'ISSUED': return displayState('handover', 'issued', 'ok')
    case 'PARTIAL': return displayState('handover', 'partial', 'cond')
    case 'FAILED': return displayState('handover', 'failed', 'bad')
    case 'GENERATING': return displayState('handover', 'generating', 'work')
    case 'SUPERSEDED': return displayState('handover', 'superseded', 'none', { icon: 'cancelled' })
    default: return displayState('handover', 'draft', 'none')
  }
}
