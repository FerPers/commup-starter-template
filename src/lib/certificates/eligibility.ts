/**
 * Gate de certificados — lógica pura (Sprint T fase 2, 2026-09-04).
 *
 * Espejo en TypeScript de las reglas de `compute_system_readiness` (SQL):
 *   - MC bloqueado si no hay ITRs, si falta alguno por aprobar o si hay punches Cat A abiertos.
 *   - Cat B abiertos no bloquean, pero cada uno exige una excepción justificada al emitir.
 *   - Cat C no interviene en la elegibilidad del certificado (solo en RFC del readiness).
 * Un punch está "abierto" si su estado es open o in_progress (closed/cancelled no cuentan).
 *
 * La usan `actions/certificates.ts` y la página de certificados; los tests viven en
 * `eligibility.test.ts` y el contraste con el SQL real en `tests/db/readiness.test.ts`.
 */

export type ItrLike = { status: string }
export type PunchLike = {
  id: string
  punch_number: string
  description: string
  category: string
  status: string
}

export type EligibilityLevel = 'green' | 'yellow' | 'red'

export type Eligibility = {
  eligible: EligibilityLevel
  totalItrs: number
  approvedItrs: number
  openCatA: number
  openCatBPunches: { id: string; punch_number: string; description: string }[]
}

export type PunchException = { punchId: string; justification: string }

export function isOpenPunchStatus(status: string): boolean {
  return status === 'open' || status === 'in_progress'
}

/** Evalúa la elegibilidad de un subsistema×fase a partir de sus ITRs y punches (abiertos o no). */
export function evaluateEligibility(itrs: ItrLike[], punches: PunchLike[]): Eligibility {
  const totalItrs = itrs.length
  const approvedItrs = itrs.filter(i => i.status === 'approved').length
  const open = punches.filter(p => isOpenPunchStatus(p.status))
  const openCatA = open.filter(p => p.category === 'A').length
  const openCatBPunches = open
    .filter(p => p.category === 'B')
    .map(p => ({ id: p.id, punch_number: p.punch_number, description: p.description }))

  let eligible: EligibilityLevel
  if (openCatA > 0 || totalItrs === 0 || approvedItrs < totalItrs) {
    eligible = 'red'
  } else if (openCatBPunches.length > 0) {
    eligible = 'yellow'
  } else {
    eligible = 'green'
  }

  return { eligible, totalItrs, approvedItrs, openCatA, openCatBPunches }
}

/** Excepciones válidas: solo Cat B abiertos del subsistema y con justificación no vacía (recortada). */
export function acceptedExceptions(el: Eligibility, exceptions: PunchException[]): PunchException[] {
  const catBIds = new Set(el.openCatBPunches.map(p => p.id))
  return exceptions
    .filter(e => catBIds.has(e.punchId) && e.justification.trim().length > 0)
    .map(e => ({ punchId: e.punchId, justification: e.justification.trim() }))
}

/** Motivo por el que NO se puede emitir el certificado, o null si procede. */
export function issuanceBlocker(el: Eligibility, exceptions: PunchException[] = []): string | null {
  if (el.openCatA > 0) {
    return `Hay ${el.openCatA} punch(es) Cat A abiertos — deben cerrarse antes de emitir`
  }
  if (el.totalItrs === 0) return 'No hay ITRs asignados en esta fase para el subsistema'
  if (el.approvedItrs < el.totalItrs) {
    return `Faltan ${el.totalItrs - el.approvedItrs} ITR(s) por aprobar`
  }
  const justified = new Set(acceptedExceptions(el, exceptions).map(e => e.punchId))
  const missing = el.openCatBPunches.filter(p => !justified.has(p.id)).length
  if (missing > 0) {
    return `Deben justificarse todos los punches Cat B abiertos (${missing} sin justificación)`
  }
  return null
}

/**
 * Número de certificado: `<tipo>/<subsistema>` la primera vez; reemisiones llevan sufijo
 * `-R<n>` donde n = cantidad previa + 1 (la 2ª emisión es `-R2`).
 */
export function buildCertificateNumber(certType: string, subsystemCode: string, existingCount: number): string {
  const base = `${certType}/${subsystemCode}`
  return existingCount <= 0 ? base : `${base}-R${existingCount + 1}`
}
