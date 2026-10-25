import { displayState, type DisplayState } from './tones'

export type PssrStatus = 'draft' | 'in_progress' | 'pending_approval' | 'approved' | 'rejected'

/** PSSR (capa Aprobado): enviado = espera la aprobación de Comisionamiento. */
export const PSSR_STATE_KEYS = ['draft', 'inProgress', 'toApprove', 'approved', 'rejected'] as const

export function pssrState(status: PssrStatus | string): DisplayState {
  switch (status) {
    case 'approved': return displayState('pssr', 'approved', 'ok')
    case 'rejected': return displayState('pssr', 'rejected', 'bad')
    case 'pending_approval': return displayState('pssr', 'toApprove', 'wait')
    case 'in_progress': return displayState('pssr', 'inProgress', 'work')
    default: return displayState('pssr', 'draft', 'none')
  }
}
