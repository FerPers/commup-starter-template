import { describe, expect, it } from 'vitest'
import { dominantSubsystemByPid, pidSheetKey } from './pid-place'

describe('pidSheetKey', () => {
  it('el número de la hoja, sin contratista, hoja ni revisión', () => {
    expect(pidSheetKey('ECP-ULL-17004-GDA-IE01-0-PRO-PID-133_2-2-B')).toBe('133')
    expect(pidSheetKey('ECP-ULL-17004-GLC-IE01-0-PRO-PID-121_1-2-B /2-2')).toBe('121')
    expect(pidSheetKey('ECP-ULL-17004-GLC-IE01-0-PRO-PID-120')).toBe('120')
    expect(pidSheetKey('P&ID 128')).toBe('128')
  })
  it('sin P&ID no hay hoja', () => {
    for (const v of ['No encontrado', '', null, undefined, 'ECP-ULL-17004-GDA-IE01-0-MEE-HD-117']) expect(pidSheetKey(v)).toBeNull()
  })
})

describe('dominantSubsystemByPid', () => {
  it('el subsistema con más tags de la hoja', () => {
    const m = dominantSubsystemByPid([
      { pid_drawing: '…-PRO-PID-129', subsystem_id: 'gas' },
      { pid_drawing: '…-PRO-PID-129', subsystem_id: 'gas' },
      { pid_drawing: '…-PRO-PID-129_1-2', subsystem_id: 'crudo' },
      { pid_drawing: '…-PRO-PID-135-B', subsystem_id: 'tea' },
      { pid_drawing: null, subsystem_id: 'x' },
    ])
    expect(m.get('129')).toBe('gas')
    expect(m.get('135')).toBe('tea')
    expect(m.size).toBe(2)
  })
})
