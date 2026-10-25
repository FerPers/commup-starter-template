import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isDone } from '@/lib/readiness/matrix'
import type { GateStatus } from '@/lib/readiness/gates'
import {
  STATE_KEYS, TONES, TONE_STYLE, LAYERS, isAcceptedTone,
  certificateState, gateState, handoverState, itrState, pssrState, punchCategoryState, punchState, requirementState,
  transferStageState, transferState,
  type DisplayState, type ItrStatus, type StateFamily,
} from './index'

// A08 — contrato de estados (maqueta «A08 + A19», paleta A aprobada por Luis 2026-10-25). Cada regla «nunca» de la
// maqueta es una prueba aquí; una pantalla que pinte estados con `@/lib/states` las cumple por construcción.

const messages = Object.fromEntries(['es', 'en'].map(l => [l, JSON.parse(readFileSync(`src/i18n/messages/${l}.json`, 'utf8')).States]))

const ITR: ItrStatus[] = ['not_started', 'in_progress', 'completed', 'approved', 'rejected']
const GATES: GateStatus[] = ['not_ready', 'ready', 'ready_with_conditions', 'pending_signatures', 'approved', 'approved_with_conditions', 'approved_needs_review', 'regressed']
const SIGS: [number | null, number | null][] = [[null, null], [0, 3], [1, 3], [2, 3], [3, 3]]

/** Todos los estados que producen las funciones del contrato, con todas las entradas que importan. */
function allStates(): DisplayState[] {
  const out: DisplayState[] = []
  for (const status of ITR) for (const [done, req] of SIGS) for (const returnedAt of [null, '2026-10-24T10:00:00Z']) for (const progressPct of [null, 40]) {
    out.push(itrState({ status, signaturesDone: done, signaturesRequired: req, returnedAt, progressPct }))
  }
  for (const status of ['open', 'in_progress', 'closed', 'cancelled'] as const) for (const resolvedAt of [null, '2026-10-24']) out.push(punchState({ status, resolvedAt }))
  for (const c of ['A', 'B', 'C'] as const) out.push(punchCategoryState(c))
  for (const status of ['pending', 'in_review', 'issued', 'rejected'] as const) for (const isBlocked of [false, true]) for (const [done, req] of SIGS) {
    out.push(certificateState({ status, isBlocked, signaturesDone: done, signaturesRequired: req }))
  }
  for (const s of ['draft', 'in_progress', 'pending_approval', 'approved', 'rejected']) out.push(pssrState(s))
  for (const status of GATES) for (const workState of [null, 'nodata', 'work', 'blocked'] as const) for (const [done, req] of SIGS) {
    out.push(gateState({ status, workState, signaturesDone: done, signaturesRequired: req }))
  }
  for (const s of ['commissioning', 'shadowing', 'joint_operation', 'operations']) out.push(transferStageState(s))
  for (const status of ['pending_signatures', 'completed', 'cancelled']) for (const signaturesDone of [null, 0, 1]) out.push(transferState({ status, signaturesDone }))
  for (const s of ['DRAFT', 'GENERATING', 'ISSUED', 'PARTIAL', 'FAILED', 'SUPERSEDED']) out.push(handoverState(s))
  for (const s of ['untyped', 'missing', 'generated', 'in_progress', 'approved', 'excluded', 'outside']) out.push(requirementState(s))
  return out
}

describe('contrato de estados (A08)', () => {
  const states = allStates()

  it('cada estado producido tiene una clave conocida, un tono y un ícono', () => {
    for (const s of states) {
      expect(STATE_KEYS[s.family], `${s.family}.${s.key}`).toContain(s.key)
      expect(TONES).toContain(s.tone)
      expect(s.icon).toBeTruthy()
    }
  })

  it('cada clave de cada familia se produce con alguna entrada (no hay claves muertas)', () => {
    const seen = new Set(states.map(s => `${s.family}.${s.key}`))
    for (const [family, keys] of Object.entries(STATE_KEYS)) for (const k of keys) expect(seen, `${family}.${k}`).toContain(`${family}.${k}`)
  })

  it('cada clave tiene etiqueta en es y en, y no hay etiquetas sin estado', () => {
    for (const loc of ['es', 'en']) {
      for (const [family, keys] of Object.entries(STATE_KEYS)) {
        expect(Object.keys(messages[loc][family]).sort(), `${loc}.${family}`).toEqual([...keys].sort())
      }
      for (const layer of LAYERS) expect(messages[loc].layers[layer].name, `${loc}.layers.${layer}`).toBeTruthy()
    }
  })

  it('las etiquetas usan exactamente los parámetros que reciben', () => {
    for (const s of states) for (const loc of ['es', 'en']) {
      const label: string = messages[loc][s.family][s.key]
      const inLabel = [...label.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()
      expect(inLabel, `${loc} ${s.family}.${s.key}`).toEqual(Object.keys(s.params ?? {}).sort())
    }
  })

  it('nunca: un ITR diligenciado (completed) se ve aceptado, tenga las firmas que tenga', () => {
    for (const s of states.filter(x => x.family === 'itr' && (x.key === 'filledIn' || x.key === 'awaitingSignatures'))) {
      expect(s.tone).toBe('wait')
    }
    for (const [done, req] of SIGS) expect(isAcceptedTone(itrState({ status: 'completed', signaturesDone: done, signaturesRequired: req }).tone)).toBe(false)
  })

  it('ITR: solo «approved» es verde; «rejected» es No conforme en rojo; devuelto solo mientras nadie firmó', () => {
    for (const status of ITR) {
      expect(isAcceptedTone(itrState({ status }).tone)).toBe(status === 'approved')
    }
    expect(itrState({ status: 'rejected', returnedAt: '2026-10-24' })).toMatchObject({ key: 'nonconforming', tone: 'bad' })
    expect(itrState({ status: 'completed', returnedAt: '2026-10-24', signaturesDone: 0, signaturesRequired: 3 })).toMatchObject({ key: 'returned', icon: 'returned' })
    expect(itrState({ status: 'completed', returnedAt: '2026-10-24', signaturesDone: 1, signaturesRequired: 3 })).toMatchObject({ key: 'awaitingSignatures', params: { done: 1, required: 3 } })
  })

  it('nunca: un paquete Parcial se ve igual que uno Emitido', () => {
    expect(handoverState('PARTIAL').tone).toBe('cond')
    expect(handoverState('ISSUED').tone).toBe('ok')
  })

  it('nunca: una liberación en regresión o por revisar cuenta como liberada', () => {
    for (const status of GATES) {
      expect(isAcceptedTone(gateState({ status }).tone), status).toBe(isDone(status))
    }
    expect(gateState({ status: 'regressed' }).tone).toBe('bad')
    expect(gateState({ status: 'approved_needs_review' }).tone).toBe('cond')
  })

  it('«No listo» se lee según su causa; sin causa conocida queda en rojo como hasta ahora', () => {
    expect(gateState({ status: 'not_ready', workState: 'nodata' }).tone).toBe('nodata')
    expect(gateState({ status: 'not_ready', workState: 'work' }).tone).toBe('work')
    expect(gateState({ status: 'not_ready', workState: 'blocked' }).tone).toBe('bad')
    expect(gateState({ status: 'not_ready' })).toMatchObject({ key: 'notReady', tone: 'bad' })
  })

  it('el relleno sólido es solo para Liberado y Entregado (nivel sistema)', () => {
    const solid = new Set(states.filter(s => s.tone === 'okSolid').map(s => `${s.family}.${s.key}`))
    expect([...solid].sort()).toEqual(['gate.released', 'gate.releasedWithConditions', 'transferStage.operations'])
  })

  it('violeta = espera a otra persona: firmar, verificar o aprobar', () => {
    const wait = new Set(states.filter(s => s.tone === 'wait').map(s => `${s.family}.${s.key}`))
    expect([...wait].sort()).toEqual([
      'certificate.signing', 'certificate.signingCount',
      'gate.pendingSignatures', 'gate.pendingSignaturesCount', 'gate.ready', 'gate.readyWithConditions',
      'itr.awaitingSignatures', 'itr.filledIn',
      'pssr.toApprove',
      'punch.resolved',
      'transfer.pendingSignatures', 'transfer.pendingSignaturesCount',
    ])
  })

  it('punch: el estado nunca es rojo; la gravedad la lleva la categoría (Cat A rojo)', () => {
    for (const s of states.filter(x => x.family === 'punch')) expect(s.tone).not.toBe('bad')
    expect(punchCategoryState('A').tone).toBe('bad')
    expect(punchCategoryState('B').tone).toBe('cond')
    expect(punchCategoryState('C').tone).toBe('none')
  })

  it('«sin información» nunca suma como hecho', () => {
    for (const s of states.filter(x => x.tone === 'nodata')) expect(isAcceptedTone(s.tone)).toBe(false)
  })

  it('los tonos usan tokens (G-10): ningún hex salvo el blanco sobre el relleno', () => {
    for (const [tone, st] of Object.entries(TONE_STYLE)) {
      for (const v of [st.bg, st.fg, st.border]) expect(v === '#fff' || /^var\(--[\w-]+\)$/.test(v), `${tone}: ${v}`).toBe(true)
    }
    const css = readFileSync('src/app/globals.css', 'utf8')
    for (const st of Object.values(TONE_STYLE)) for (const v of [st.bg, st.fg, st.border]) {
      const token = v.match(/^var\((--[\w-]+)\)$/)?.[1]
      if (token) expect(css, token).toContain(`${token}:`)
    }
  })

  it('las familias del contrato son las que tienen etiquetas', () => {
    const families = Object.keys(STATE_KEYS) as StateFamily[]
    expect(Object.keys(messages.es).filter(k => k !== 'layers').sort()).toEqual([...families].sort())
  })
})
