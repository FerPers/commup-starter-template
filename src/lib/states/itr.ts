import type { Database } from '@/types/supabase.generated'
import { normalizeRequired } from '@/lib/itr/signatures'
import { countParams, displayState, type DisplayState } from './tones'

export type ItrStatus = Database['public']['Enums']['itr_status']

/**
 * ITR (capas Diligenciado · Conforme · Aprobado). Los códigos de la BD y de la API no cambian; solo su lectura:
 * `completed` = diligenciado, todavía sin todas las firmas (nunca verde); `rejected` = falla crítica = «No conforme».
 * Devuelto (E2: `itrs.returned_at`) se ve hasta la siguiente firma del ejecutor.
 */
export const ITR_STATE_KEYS = ['notStarted', 'inProgress', 'inProgressPct', 'returned', 'filledIn', 'awaitingSignatures', 'nonconforming', 'approved'] as const

export type ItrStateInput = {
  status: ItrStatus
  progressPct?: number | null
  signaturesDone?: number | null
  signaturesRequired?: number | null
  returnedAt?: string | null
}

export function itrState(i: ItrStateInput): DisplayState {
  if (i.status === 'approved') return displayState('itr', 'approved', 'ok')
  if (i.status === 'rejected') return displayState('itr', 'nonconforming', 'bad')
  if (i.returnedAt && !(i.signaturesDone ?? 0)) return displayState('itr', 'returned', 'work', { icon: 'returned' })
  if (i.status === 'completed') {
    const params = countParams(i.signaturesDone, i.signaturesRequired)
    return params ? displayState('itr', 'awaitingSignatures', 'wait', { params }) : displayState('itr', 'filledIn', 'wait')
  }
  if (i.status === 'in_progress') {
    return typeof i.progressPct === 'number'
      ? displayState('itr', 'inProgressPct', 'work', { params: { pct: Math.round(i.progressPct) } })
      : displayState('itr', 'inProgress', 'work')
  }
  return displayState('itr', 'notStarted', 'none')
}

/**
 * Estado de una fila con sus firmas (lista de ITR, pestaña del tag): firmas hechas de las que exige el ITR
 * (`required_signatures`, congeladas al crearlo) y la devolución (E2).
 */
export function itrRowState(r: {
  status: string
  progress_pct?: number | null
  signatures: ReadonlyArray<{ role: string }>
  required_signatures: ReadonlyArray<string> | null | undefined
  returned_at?: string | null
}): DisplayState {
  const required = normalizeRequired(r.required_signatures)
  return itrState({
    status: r.status as ItrStatus,
    progressPct: r.progress_pct,
    signaturesDone: r.signatures.filter(s => (required as string[]).includes(s.role)).length,
    signaturesRequired: required.length,
    returnedAt: r.returned_at,
  })
}

/** Estados de la BD en orden (filtros y conteos por estado). */
export const ITR_STATUSES: readonly ItrStatus[] = ['not_started', 'in_progress', 'completed', 'approved', 'rejected']
