import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { NAV_TITLE_KEYS } from './titles'

const get = (o: Record<string, unknown>, path: string) => path.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown> | undefined)?.[k], o)

describe('glosario: menú = título (N0, H-13)', () => {
  for (const loc of ['es', 'en']) {
    it(`${loc}: cada página del menú se titula igual que su etiqueta`, () => {
      const m = JSON.parse(readFileSync(`src/i18n/messages/${loc}.json`, 'utf8'))
      for (const [nav, title] of Object.entries(NAV_TITLE_KEYS)) {
        expect(get(m, title), `${nav} → ${title}`).toBe(m.Sidebar.nav[nav])
      }
    })
  }
  it('sin «Control Tower» ni «Torre de Control» en la app en español', () => {
    const es = readFileSync('src/i18n/messages/es.json', 'utf8')
    const app = JSON.parse(es)
    delete app.Landing
    expect(JSON.stringify(app)).not.toMatch(/Torre de [Cc]ontrol|Control Tower/)
  })
})
