import { beforeEach, describe, expect, it, vi } from 'vitest'

// A09 (revisión 2026-10-23 hallazgo 8): un fallo de auditoría se revisa, se reintenta y, si se pierde, queda a la vista.
const h = vi.hoisted(() => ({ adminResult: { error: null } as { error: { message: string } | null } | 'throw', adminInserts: 0 }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ insert: async () => { h.adminInserts++; if (h.adminResult === 'throw') throw new Error('fetch failed'); return h.adminResult } }),
  }),
}))
import { logActivity } from './log-activity'

const input = { orgId: 'org', userId: 'u', entityType: 'itr', entityId: 'i', action: 'deleted', payload: { itrNumber: 'I01A/PT-1' } }
function client(result: { error: { message: string } | null } | 'throw') {
  const rows: unknown[] = []
  return { rows, db: { from: () => ({ insert: async (row: unknown) => { rows.push(row); if (result === 'throw') throw new TypeError('fetch failed'); return result } }) } }
}

let error: ReturnType<typeof vi.spyOn>
let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  h.adminResult = { error: null }; h.adminInserts = 0
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('logActivity (A09)', () => {
  it('escribe la fila con la sesión del usuario y no reintenta si salió bien', async () => {
    const c = client({ error: null })
    // @ts-expect-error cliente de prueba con solo from().insert()
    expect(await logActivity(c.db, input)).toEqual({ ok: true })
    expect(c.rows[0]).toMatchObject({ org_id: 'org', user_id: 'u', entity_type: 'itr', entity_id: 'i', action: 'deleted' })
    expect(h.adminInserts).toBe(0)
  })

  it('un { error } de Supabase ya no se pierde: se reintenta con la cuenta de servicio', async () => {
    const c = client({ error: { message: 'new row violates row-level security policy' } })
    // @ts-expect-error cliente de prueba con solo from().insert()
    expect(await logActivity(c.db, input)).toEqual({ ok: true })
    expect(h.adminInserts).toBe(1)
    expect(warn).toHaveBeenCalledWith('[activity_log] retried with service role', expect.stringContaining('row-level security'))
  })

  it('si también falla el reintento, devuelve el error y deja el registro completo en el log', async () => {
    h.adminResult = { error: { message: 'connection refused' } }
    const c = client('throw')
    // @ts-expect-error cliente de prueba con solo from().insert()
    expect(await logActivity(c.db, input)).toEqual({ ok: false, error: 'connection refused' })
    expect(error).toHaveBeenCalledWith('[activity_log] LOST', expect.stringContaining('I01A/PT-1'))
  })

  it('nunca lanza, aunque falle todo', async () => {
    h.adminResult = 'throw'
    const c = client('throw')
    // @ts-expect-error cliente de prueba con solo from().insert()
    await expect(logActivity(c.db, input)).resolves.toEqual({ ok: false, error: 'fetch failed' })
  })
})
