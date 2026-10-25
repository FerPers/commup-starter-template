import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// A08 · E3: las pantallas pintan los estados con `@/lib/states`. Esta prueba impide volver a las paletas sueltas que
// confundían diligenciado con aprobado: un mapa de estados con «completed» en verde junto a «approved» (el ITR viejo:
// completado verde, aprobado violeta), o «approved» en violeta. Las familias propias (estado del tag, planes de trabajo,
// preservación) no tienen «approved» y no entran.

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return walk(p)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : []
  })
}

const FILES = walk('src').filter(f => !f.startsWith(join('src', 'lib', 'states')) && !f.includes(`${join('src', 'components', 'landing')}`))

describe('sin paletas de estado sueltas (A08)', () => {
  it('ningún mapa pone «completed» en verde junto a «approved»', () => {
    const offenders = FILES.filter(f => /completed:\s*\{[^}]*(success|green)[^}]*\}[\s\S]{0,400}approved:|approved:[\s\S]{0,400}completed:\s*\{[^}]*(success|green)/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('ningún mapa pinta «approved» en violeta (violeta = espera a otra persona)', () => {
    const offenders = FILES.filter(f => /approved:\s*\{[^}]*violet/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
