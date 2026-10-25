import type { Database } from '@/types/supabase.generated'
import { countParams, displayState, type DisplayState } from './tones'

export type CertificateStatus = Database['public']['Enums']['certificate_status']

/**
 * Certificado (capa Aprobado). `issue_certificate` lo crea ya `issued` y las firmas (Completamiento, Cliente,
 * Autoridad) llegan después: emitido con firmas pendientes = «Emitido · firmas n/m» en violeta (espera a otras
 * personas); verde solo con todas. `rejected` en la BD = revocado (`revoke_certificate`). Bloqueado = la base dejó de
 * cumplir. `in_review` es un estado heredado que ninguna función escribe hoy.
 */
export const CERTIFICATE_STATE_KEYS = ['pending', 'blocked', 'signing', 'signingCount', 'issuedSigning', 'issued', 'revoked'] as const

export function certificateState(c: { status: CertificateStatus; isBlocked?: boolean | null; signaturesDone?: number | null; signaturesRequired?: number | null }): DisplayState {
  if (c.status === 'rejected') return displayState('certificate', 'revoked', 'bad', { icon: 'regressed' })
  if (c.isBlocked) return displayState('certificate', 'blocked', 'bad')
  if (c.status === 'issued') {
    const params = countParams(c.signaturesDone, c.signaturesRequired)
    return params && params.done < params.required ? displayState('certificate', 'issuedSigning', 'wait', { params }) : displayState('certificate', 'issued', 'ok')
  }
  if (c.status === 'in_review') {
    const params = countParams(c.signaturesDone, c.signaturesRequired)
    return params ? displayState('certificate', 'signingCount', 'wait', { params }) : displayState('certificate', 'signing', 'wait')
  }
  return displayState('certificate', 'pending', 'none')
}

/** Firmas de un certificado: Completamiento, Cliente y Autoridad (`CERT_ROLE_CAPACITY`). */
export const CERTIFICATE_SIGNATURES_REQUIRED = 3
