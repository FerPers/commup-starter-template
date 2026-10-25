import type { Database } from '@/types/supabase.generated'
import { countParams, displayState, type DisplayState } from './tones'

export type CertificateStatus = Database['public']['Enums']['certificate_status']

/** Certificado (capa Aprobado). `rejected` en la BD = revocado (`revoke_certificate`). Bloqueado = la base dejó de cumplir. */
export const CERTIFICATE_STATE_KEYS = ['pending', 'blocked', 'signing', 'signingCount', 'issued', 'revoked'] as const

export function certificateState(c: { status: CertificateStatus; isBlocked?: boolean | null; signaturesDone?: number | null; signaturesRequired?: number | null }): DisplayState {
  if (c.status === 'rejected') return displayState('certificate', 'revoked', 'bad', { icon: 'regressed' })
  if (c.isBlocked) return displayState('certificate', 'blocked', 'bad')
  if (c.status === 'issued') return displayState('certificate', 'issued', 'ok')
  if (c.status === 'in_review') {
    const params = countParams(c.signaturesDone, c.signaturesRequired)
    return params ? displayState('certificate', 'signingCount', 'wait', { params }) : displayState('certificate', 'signing', 'wait')
  }
  return displayState('certificate', 'pending', 'none')
}
