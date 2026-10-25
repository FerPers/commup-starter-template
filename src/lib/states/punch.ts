import type { Database } from '@/types/supabase.generated'
import { displayState, type DisplayState } from './tones'

export type PunchStatus = Database['public']['Enums']['punch_status']
export type PunchCategory = Database['public']['Enums']['punch_category']

/**
 * Punch: el estado no usa rojo (D5); la gravedad la dice la categoría (Cat A en rojo porque bloquea).
 * «Resuelto · por verificar» = `in_progress` con `resolved_at`: espera que otra persona lo verifique en campo.
 */
export const PUNCH_STATE_KEYS = ['open', 'inProgress', 'resolved', 'closed', 'cancelled'] as const
export const PUNCH_CATEGORY_KEYS = ['A', 'B', 'C'] as const

export function punchState(p: { status: PunchStatus; resolvedAt?: string | null }): DisplayState {
  switch (p.status) {
    case 'closed': return displayState('punch', 'closed', 'ok')
    case 'cancelled': return displayState('punch', 'cancelled', 'none', { icon: 'cancelled' })
    case 'in_progress': return p.resolvedAt ? displayState('punch', 'resolved', 'wait') : displayState('punch', 'inProgress', 'work')
    default: return displayState('punch', 'open', 'none')
  }
}

export function punchCategoryState(category: PunchCategory): DisplayState {
  const tone = category === 'A' ? 'bad' : category === 'B' ? 'cond' : 'none'
  return displayState('punchCategory', category, tone, { icon: 'category' })
}
