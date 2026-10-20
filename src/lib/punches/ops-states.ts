/**
 * Máquina de estados del seguimiento de Operaciones de un punch Cat B transferido (S06, C-04/A-03).
 * Espejo de `update_punch_ops_status` (supabase/functions-sql/update_punch_ops_status.sql): verificar
 * solo desde «resuelto», cerrar solo desde «verificado», y cada uno lo hace otra persona (la BD lo exige).
 */
export const OPS_STATES = ['in_progress_ops', 'deferred', 'resolved_ops', 'verified_ops', 'closed_final', 'cancelled_ops'] as const
export type OpsState = (typeof OPS_STATES)[number]

const WORKING: readonly string[] = ['transferred_to_ops', 'in_progress_ops', 'deferred']

export function nextOpsStates(current: string | null | undefined): OpsState[] {
  const cur = current ?? 'active'
  if (WORKING.includes(cur)) return (['in_progress_ops', 'deferred', 'resolved_ops', 'cancelled_ops'] as const).filter(s => s !== cur)
  if (cur === 'resolved_ops') return ['verified_ops', 'in_progress_ops']
  if (cur === 'verified_ops') return ['closed_final']
  return []
}
