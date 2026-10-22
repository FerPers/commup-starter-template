import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildCrumbs } from './crumbs'

const P = 'abc47484-59d3-4f51-8966-7fb4f1174ba8'
const T = '11111111-2222-4333-8444-555555555555'
const I = '99999999-2222-4333-8444-555555555555'
const labels = (p: string) => buildCrumbs(p).map(c => c.label)

describe('migas de pan (N0, H-06)', () => {
  it('dentro de un ITR llega hasta el ITR, con el tag enlazado', () => {
    const c = buildCrumbs(`/projects/${P}/tags/${T}/itrs/${I}`)
    expect(c.map(x => x.label)).toEqual(['nav:projects', P, 'nav:tags', 'entity:tag', 'entity:itr'])
    expect(c[3].href).toBe(`/projects/${P}/tags/${T}`)
    expect(c[4].href).toBeUndefined()
  })

  it('la página propia del punch cuelga del punch list del proyecto (N1b)', () => {
    const c = buildCrumbs(`/projects/${P}/punches/${I}`)
    expect(c.map(x => x.label)).toEqual(['nav:projects', P, 'nav:punchList', 'entity:punch'])
    expect(c[2].href).toBe(`/projects/${P}/punches`)
  })

  it('Readiness y la ficha de sistema viven dentro del proyecto (N2a)', () => {
    expect(labels(`/projects/${P}/readiness`)).toEqual(['nav:projects', P, 'nav:readiness'])
    expect(labels(`/projects/${P}/systems/${I}`)).toEqual(['nav:projects', P, 'nav:systems', 'entity:system'])
  })

  it('colecciones sin página no son miga (nunca un enlace a 404)', () => {
    expect(labels(`/projects/${P}/startup/runs/${I}`)).toEqual(['nav:projects', P, 'nav:startup', 'entity:run'])
    expect(labels(`/projects/${P}/startup/performance/runs/${I}`)).toEqual(['nav:projects', P, 'nav:startup', 'nav:performance', 'entity:attempt'])
    expect(labels(`/projects/${P}/daily/action/${I}`)).toEqual(['nav:projects', P, 'nav:daily', 'entity:action'])
  })

  it('admin, Control Tower y secciones nuevas en español (sin titleize)', () => {
    expect(labels('/admin/test-equipment')).toEqual(['sub:admin', 'nav:testEquipment'])
    expect(labels(`/control-tower/${I}`)).toEqual(['nav:controlTower', 'entity:system'])
    expect(labels(`/projects/${P}/vendors`)).toEqual(['nav:projects', P, 'nav:vendors'])
    expect(labels(`/projects/${P}/daily/lookahead`)).toEqual(['nav:projects', P, 'nav:daily', 'sub:lookahead'])
  })

  it('toda clave usada existe en es y en en', () => {
    for (const loc of ['es', 'en']) {
      const m = JSON.parse(readFileSync(`src/i18n/messages/${loc}.json`, 'utf8'))
      const src = readFileSync('src/lib/navigation/crumbs.ts', 'utf8')
      for (const [, ns, key] of src.matchAll(/'(nav|sub|entity):([\w]+)'/g)) {
        const bag = ns === 'nav' ? m.Sidebar.nav : m.Breadcrumbs[ns]
        expect(bag?.[key], `${loc} ${ns}:${key}`).toBeTruthy()
      }
      for (const k of ['tag', 'itr', 'system', 'run', 'attempt', 'detail', 'action', 'constraint', 'tq', 'decision']) {
        expect(m.Breadcrumbs.entity[k], `${loc} entity:${k}`).toBeTruthy()
      }
    }
  })
})
