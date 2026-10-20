import { describe, expect, it } from 'vitest'
import { planSignal, signalPayloadColumns } from './signal-merge'

const existing = {
  tag_id: 'T', signal_tag: 'PT-101', signal_type: 'AI', description: 'Presión', junction_box: 'JB-01', marshalling: 'MC-1',
  io_card: 'C3', io_channel: '04', dcs_tag: 'PI101', hmi_display: 'D-10', loop_id: 'L-1', service: 'Gas',
}

describe('reimportar señales sin borrar la cadena (S07, F-06)', () => {
  it('un índice sin columnas de cadena ni LAZO no toca JB, I/O, DCS, HMI ni el lazo', () => {
    const present = new Set(['signal_tag', 'signal_type', 'description', 'service'])
    const plan = planSignal({ signal_tag: 'PT-101', description: 'Presión de entrada', service: '' }, present, existing, { tagId: 'T', signalType: 'AI', loopId: null })
    expect(plan.payload).toEqual({ tag_id: 'T', signal_tag: 'PT-101', signal_type: 'AI', description: 'Presión de entrada', service: 'Gas' })
    expect(plan.changes).toEqual(['description'])
  })

  it('con la cadena presente actualiza solo las celdas con valor; LAZO vacío no desvincula', () => {
    const present = new Set(['signal_tag', 'signal_type', 'junction_box', 'io_channel', 'loop_number'])
    const plan = planSignal({ signal_tag: 'PT-101', junction_box: 'JB-02', io_channel: '' }, present, existing, { tagId: 'T', signalType: 'AI', loopId: null })
    expect(plan.payload).toMatchObject({ junction_box: 'JB-02', io_channel: '04', loop_id: 'L-1' })
    expect(plan.changes).toEqual(['junction_box'])
  })

  it('claves iguales para señales nuevas y existentes', () => {
    const present = new Set(['signal_tag', 'signal_type', 'junction_box', 'loop_number', 'pid'])
    const a = planSignal({ signal_tag: 'PT-101' }, present, existing, { tagId: 'T', signalType: 'AI', loopId: 'L-2' })
    const b = planSignal({ signal_tag: 'TT-9', junction_box: 'JB-9', pid_drawing: ' pid-1 ' }, present, null, { tagId: 'T2', signalType: 'AI', loopId: null })
    expect(Object.keys(a.payload).sort()).toEqual(Object.keys(b.payload).sort())
    expect(a.payload.loop_id).toBe('L-2')
    expect(b.payload).toMatchObject({ junction_box: 'JB-9', pid_drawing: 'PID-1', loop_id: null })
    expect(signalPayloadColumns(present)).toEqual(['pid_drawing', 'junction_box', 'loop_id'])
  })
})
