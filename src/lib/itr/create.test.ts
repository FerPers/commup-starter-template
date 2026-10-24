import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/i18n/action-errors', () => ({ assignmentDbError: async (m: string) => m }))
import { batchItrId, isRequestId } from './create'
import { assignmentDbErrorKey } from './signatures'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

// A03: id idempotente del ITR por solicitud.
describe('batchItrId', () => {
  const req = '7d1e5c2a-0f3b-4c55-9a51-3f0f2f1b6c10'
  it('la misma solicitud y la misma fuente dan el mismo id (reintentar no duplica)', () => {
    expect(batchItrId(req, 'tpl:loop:1')).toBe(batchItrId(req.toUpperCase(), 'tpl:loop:1'))
  })
  it('otra fuente u otra solicitud dan otro id', () => {
    expect(batchItrId(req, 'tpl:loop:1')).not.toBe(batchItrId(req, 'tpl:loop:2'))
    expect(batchItrId(req, 'tpl:loop:1')).not.toBe(batchItrId('00000000-0000-4000-8000-000000000000', 'tpl:loop:1'))
  })
  it('es un UUID válido', () => {
    expect(batchItrId(req, 'tpl:cause:9')).toMatch(UUID)
    expect(isRequestId(batchItrId(req, 'x'))).toBe(true)
    expect(isRequestId('nope')).toBe(false)
  })
})

describe('assignmentDbErrorKey (A03)', () => {
  it('traduce los rechazos de create_itr', () => {
    expect(assignmentDbErrorKey('Missing signer for required role supervisor')).toBe('missing_role_db')
    expect(assignmentDbErrorKey('A client cannot be the ITR executor')).toBe('client_executor_db')
    expect(assignmentDbErrorKey('Assigned user is not a project organization member (inactive or expired)')).toBe('not_member')
  })
})
