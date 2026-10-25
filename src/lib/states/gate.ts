import type { GateStatus } from '@/lib/readiness/gates'
import { countParams, displayState, type DisplayState } from './tones'

/**
 * Liberación de un sistema en un gate (capa Liberado). Liberado es el único estado de registro en relleno sólido.
 *
 * «No listo» se parte en tres (D7, motor en E4: `work_state` del gate):
 * - nodata  = la fase no tiene ITR en el alcance del sistema; no cuenta como 0 pendientes
 * - work    = trabajo en curso (ITR por aprobar, gate anterior sin aprobar): no es un bloqueo
 * - blocked = no se resuelve haciendo el trabajo planeado (Cat A, ITR no conforme, anterior en regresión,
 *             restricción en nivel 4, dependencia o registro que bloquea, documento superado con política «bloquear»)
 * Sin `work_state` (antes de E4) queda «No listo» en rojo, como hasta ahora.
 */
export type GateWorkState = 'nodata' | 'work' | 'blocked'

export const GATE_STATE_KEYS = [
  'noData', 'inExecution', 'blocked', 'notReady', 'ready', 'readyWithConditions',
  'pendingSignatures', 'pendingSignaturesCount', 'released', 'releasedWithConditions', 'needsReview', 'regressed',
] as const

export function gateState(g: { status: GateStatus; workState?: GateWorkState | null; signaturesDone?: number | null; signaturesRequired?: number | null }): DisplayState {
  switch (g.status) {
    case 'approved': return displayState('gate', 'released', 'okSolid')
    case 'approved_with_conditions': return displayState('gate', 'releasedWithConditions', 'okSolid', { accent: 'cond' })
    case 'approved_needs_review': return displayState('gate', 'needsReview', 'cond')
    case 'regressed': return displayState('gate', 'regressed', 'bad', { icon: 'regressed' })
    case 'pending_signatures': {
      const params = countParams(g.signaturesDone, g.signaturesRequired)
      return params ? displayState('gate', 'pendingSignaturesCount', 'wait', { params }) : displayState('gate', 'pendingSignatures', 'wait')
    }
    case 'ready': return displayState('gate', 'ready', 'wait')
    case 'ready_with_conditions': return displayState('gate', 'readyWithConditions', 'wait', { accent: 'cond' })
    default:
      if (g.workState === 'nodata') return displayState('gate', 'noData', 'nodata')
      if (g.workState === 'work') return displayState('gate', 'inExecution', 'work')
      if (g.workState === 'blocked') return displayState('gate', 'blocked', 'bad')
      return displayState('gate', 'notReady', 'bad')
  }
}
