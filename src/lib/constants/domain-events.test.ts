import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AUDIT_ENTITY_TYPES, DOMAIN_EVENT_TYPES, PUSH_EVENT_TYPES } from './domain-events'

const SQL_DIR = join(__dirname, '../../../supabase/functions-sql')
const sql = (name: string) => readFileSync(join(SQL_DIR, `${name}.sql`), 'utf8')
const ENTITIES = new Set<string>(AUDIT_ENTITY_TYPES)
/** Literales 'entidad.accion' de una entidad conocida (deja fuera p. ej. 'request.headers'). */
const eventLiterals = (body: string) =>
  [...body.matchAll(/'([a-z_]+)\.([a-z_]+)'/g)].filter(m => ENTITIES.has(m[1])).map(m => `${m[1]}.${m[2]}`)

describe('catálogo v1 de domain_events (S21, I-08)', () => {
  it('cada evento de negocio que emite la BD está en el catálogo', () => {
    const emitted = [...eventLiterals(sql('emit_domain_event')), ...eventLiterals(sql('emit_business_event'))]
    expect(emitted.length).toBeGreaterThan(10)
    for (const e of emitted) expect(DOMAIN_EVENT_TYPES).toContain(e)
  })

  it('PUSH_EVENT_TYPES = SQL push_event_types()', () => {
    expect([...eventLiterals(sql('push_event_types'))].sort()).toEqual([...PUSH_EVENT_TYPES].sort())
  })
})
