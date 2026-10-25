import { displayState, type DisplayState } from './tones'

/** Estado de un requisito ITR del tag (capa Alcance; `tag_itr_requirements`), más `untyped` = tag sin tipo de equipo. */
export type RequirementStatus = 'untyped' | 'missing' | 'generated' | 'in_progress' | 'approved' | 'excluded' | 'outside'

export const REQUIREMENT_STATE_KEYS = ['untyped', 'missing', 'generated', 'inProgress', 'approved', 'excluded', 'outside'] as const

export function requirementState(state: RequirementStatus | string): DisplayState {
  switch (state) {
    case 'untyped': return displayState('requirement', 'untyped', 'nodata')
    case 'generated': return displayState('requirement', 'generated', 'work')
    case 'in_progress': return displayState('requirement', 'inProgress', 'work')
    case 'approved': return displayState('requirement', 'approved', 'ok')
    case 'excluded': return displayState('requirement', 'excluded', 'none', { icon: 'cancelled' })
    case 'outside': return displayState('requirement', 'outside', 'cond')
    default: return displayState('requirement', 'missing', 'none')
  }
}
