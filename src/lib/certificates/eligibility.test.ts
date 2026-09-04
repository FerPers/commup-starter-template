import { describe, expect, it } from 'vitest'
import {
  acceptedExceptions,
  buildCertificateNumber,
  evaluateEligibility,
  isOpenPunchStatus,
  issuanceBlocker,
  type PunchLike,
} from './eligibility'

const punch = (over: Partial<PunchLike> & { id: string }): PunchLike => ({
  punch_number: `P-${over.id}`,
  description: `punch ${over.id}`,
  category: 'A',
  status: 'open',
  ...over,
})
const approved = { status: 'approved' }
const pending = { status: 'in_progress' }

describe('isOpenPunchStatus', () => {
  it('open/in_progress abiertos; closed/cancelled no', () => {
    expect(['open', 'in_progress', 'closed', 'cancelled'].map(isOpenPunchStatus)).toEqual([true, true, false, false])
  })
})

describe('evaluateEligibility', () => {
  it('rojo sin ITRs aunque no haya punches', () => {
    const el = evaluateEligibility([], [])
    expect(el.eligible).toBe('red')
    expect(el.totalItrs).toBe(0)
  })

  it('rojo si falta algún ITR por aprobar', () => {
    const el = evaluateEligibility([approved, pending], [])
    expect(el).toMatchObject({ eligible: 'red', totalItrs: 2, approvedItrs: 1 })
  })

  it('rojo con Cat A abierto aunque todos los ITRs estén aprobados', () => {
    const el = evaluateEligibility([approved], [punch({ id: 'a1' })])
    expect(el.eligible).toBe('red')
    expect(el.openCatA).toBe(1)
  })

  it('Cat A cerrado o cancelado no bloquea', () => {
    const el = evaluateEligibility([approved], [
      punch({ id: 'a1', status: 'closed' }),
      punch({ id: 'a2', status: 'cancelled' }),
    ])
    expect(el.eligible).toBe('green')
    expect(el.openCatA).toBe(0)
  })

  it('amarillo con Cat B abierto (open o in_progress) y lista los punches', () => {
    const el = evaluateEligibility([approved], [
      punch({ id: 'b1', category: 'B' }),
      punch({ id: 'b2', category: 'B', status: 'in_progress' }),
      punch({ id: 'b3', category: 'B', status: 'closed' }),
    ])
    expect(el.eligible).toBe('yellow')
    expect(el.openCatBPunches.map(p => p.id)).toEqual(['b1', 'b2'])
    expect(el.openCatBPunches[0]).toEqual({ id: 'b1', punch_number: 'P-b1', description: 'punch b1' })
  })

  it('Cat A abierto pesa más que Cat B: rojo', () => {
    const el = evaluateEligibility([approved], [punch({ id: 'b1', category: 'B' }), punch({ id: 'a1' })])
    expect(el.eligible).toBe('red')
  })

  it('Cat C abierto no afecta la elegibilidad del certificado', () => {
    const el = evaluateEligibility([approved, approved], [punch({ id: 'c1', category: 'C' })])
    expect(el).toMatchObject({ eligible: 'green', totalItrs: 2, approvedItrs: 2, openCatA: 0 })
    expect(el.openCatBPunches).toEqual([])
  })
})

describe('issuanceBlocker', () => {
  it('prioriza Cat A sobre ITRs faltantes', () => {
    const el = evaluateEligibility([pending], [punch({ id: 'a1' })])
    expect(issuanceBlocker(el)).toMatch(/1 punch\(es\) Cat A/)
  })

  it('sin ITRs → mensaje específico', () => {
    expect(issuanceBlocker(evaluateEligibility([], []))).toMatch(/No hay ITRs/)
  })

  it('ITRs pendientes → cuenta los que faltan', () => {
    expect(issuanceBlocker(evaluateEligibility([approved, pending, pending], []))).toBe('Faltan 2 ITR(s) por aprobar')
  })

  it('Cat B sin justificación bloquea; justificación en blanco no cuenta', () => {
    const el = evaluateEligibility([approved], [punch({ id: 'b1', category: 'B' }), punch({ id: 'b2', category: 'B' })])
    expect(issuanceBlocker(el)).toMatch(/2 sin justificación/)
    expect(issuanceBlocker(el, [{ punchId: 'b1', justification: '   ' }])).toMatch(/2 sin justificación/)
    expect(issuanceBlocker(el, [{ punchId: 'b1', justification: 'ok' }])).toMatch(/1 sin justificación/)
  })

  it('todo justificado → procede (null)', () => {
    const el = evaluateEligibility([approved], [punch({ id: 'b1', category: 'B' })])
    expect(issuanceBlocker(el, [{ punchId: 'b1', justification: ' transferible a ops ' }])).toBeNull()
  })

  it('verde sin excepciones → procede', () => {
    expect(issuanceBlocker(evaluateEligibility([approved], []))).toBeNull()
  })
})

describe('acceptedExceptions', () => {
  it('descarta punches ajenos al subsistema, cerrados o sin justificación, y recorta el texto', () => {
    const el = evaluateEligibility([approved], [
      punch({ id: 'b1', category: 'B' }),
      punch({ id: 'b2', category: 'B', status: 'closed' }),
    ])
    const out = acceptedExceptions(el, [
      { punchId: 'b1', justification: '  motivo  ' },
      { punchId: 'b2', justification: 'cerrado, no aplica' },
      { punchId: 'zz', justification: 'otro subsistema' },
      { punchId: 'b1', justification: '' },
    ])
    expect(out).toEqual([{ punchId: 'b1', justification: 'motivo' }])
  })
})

describe('buildCertificateNumber', () => {
  it('primera emisión sin sufijo; reemisiones con -R<n>', () => {
    expect(buildCertificateNumber('MC', 'SS-01', 0)).toBe('MC/SS-01')
    expect(buildCertificateNumber('MC', 'SS-01', 1)).toBe('MC/SS-01-R2')
    expect(buildCertificateNumber('RFSU', 'SS-01', 3)).toBe('RFSU/SS-01-R4')
  })
})
