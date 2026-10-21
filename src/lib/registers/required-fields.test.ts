import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REGISTER_CATALOG } from './catalog'

// S23 (D-22): la RPC transition_register_item exige los mismos campos por estado que el formulario.
describe('campos obligatorios de registros F3 = SQL register_required_fields', () => {
  it('cada (tipo, campo, estado) del catálogo está en la función SQL y viceversa', () => {
    const sql = readFileSync(join(__dirname, '../../../supabase/functions-sql/register_required_fields.sql'), 'utf8')
    const fromSql = [...sql.matchAll(/\('([a-z_]+)', '([a-z_]+)', '([a-z_]+)'\)/g)].map(m => `${m[1]}.${m[2]}.${m[3]}`).sort()
    const fromTs = REGISTER_CATALOG.flatMap(t => t.fields.filter(f => f.requiredFor).map(f => `${t.kind}.${f.key}.${f.requiredFor}`)).sort()
    expect(fromSql).toEqual(fromTs)
  })
})
