import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ADMIN_GROUPS, PERSONAL_ITEMS, PORTFOLIO_ITEMS, PROJECT_ITEMS, PROJECT_TOP, buildMenu, visibleEntries, type MenuItemDef } from './menu'

const ALL_ITEMS: MenuItemDef[] = [...PERSONAL_ITEMS, ...PROJECT_TOP, ...PROJECT_ITEMS, ...PORTFOLIO_ITEMS, ...ADMIN_GROUPS.flatMap(g => g.items)]
const P = 'abc47484-59d3-4f51-8966-7fb4f1174ba8'

/** Página que sirve un href del menú. */
function pageFile(href: string): string {
  const path = href.split('?')[0].replace('/projects/{p}', '/projects/[id]')
  return `src/app/(dashboard)${path}/page.tsx`
}

/** Ítems que el menú oculta a un rol aunque la página no lo bloquea (lectura abierta, edición restringida). */
const UX_ONLY = new Set(['itrTemplates', 'preservationTemplates', 'pssrTemplates'])

describe('menú por fase y rol (N1)', () => {
  it('cada entrada lleva a una página que existe', () => {
    for (const i of ALL_ITEMS) expect(existsSync(pageFile(i.href)), `${i.key} → ${pageFile(i.href)}`).toBe(true)
  })

  it('el permiso del menú es el mismo que el guard de su página (H-07)', () => {
    for (const i of ALL_ITEMS) {
      const src = readFileSync(pageFile(i.href), 'utf8')
      const guard = src.match(/denyAccess\('(\w+)'\)/)?.[1]
      if (guard) expect(i.tier, `${i.key}: la página exige ${guard}`).toBe(guard)
      else if (i.tier) expect(UX_ONLY.has(i.key), `${i.key}: el menú lo oculta (${i.tier}) pero la página no lo bloquea`).toBe(true)
    }
  })

  it('metas de la propuesta: inspector ≤ 9, líder ≤ 17, cliente ≤ 10, arquitecto ≈ 10', () => {
    expect(visibleEntries(buildMenu('inspector', P))).toBeLessThanOrEqual(9)
    expect(visibleEntries(buildMenu('leader', P))).toBeLessThanOrEqual(17)
    expect(visibleEntries(buildMenu('client', P))).toBeLessThanOrEqual(10)
    expect(visibleEntries(buildMenu('architect', P))).toBeLessThanOrEqual(10)
  })

  it('nada desaparece: lo permitido que no es de la audiencia queda en «Más…»', () => {
    for (const role of ['inspector', 'leader', 'architect', 'client']) {
      const m = buildMenu(role, P)
      const shown = new Set([...m.personal, ...m.project, ...m.phases.flatMap(p => p.items), ...m.portfolio, ...m.more, ...m.admin.flatMap(g => g.items)].map(l => l.key))
      for (const i of [...PROJECT_TOP, ...PROJECT_ITEMS, ...PORTFOLIO_ITEMS]) {
        const ok = !i.tier || (role === 'architect' ? ['privileged', 'editor'] : role === 'leader' ? ['editor'] : []).includes(i.tier)
        if (ok) expect(shown.has(i.key), `${role}: ${i.key}`).toBe(true)
      }
    }
  })

  it('owner/admin ve el proyecto por fases; el arquitecto empieza por planificación; el cliente no ve Importar ni Escanear', () => {
    const owner = buildMenu('owner', P)
    expect(owner.phases.map(p => p.phase)).toEqual(['prep', 'mc', 'com', 'su', 'mgmt'])
    expect(owner.project.map(l => l.key)).toEqual(['overview', 'readiness'])
    const arch = buildMenu('architect', P)
    expect(arch.project.map(l => l.key).slice(0, 3)).toEqual(['overview', 'readiness', 'planning'])
    const client = buildMenu('client', P)
    const keys = [...client.personal, ...client.project, ...client.more].map(l => l.key)
    expect(keys).not.toContain('import')
    expect(keys).not.toContain('scan')
    expect(buildMenu('leader', P).project[0].href).toBe(`/projects/${P}`)
  })

  it('las etiquetas existen en es y en', () => {
    for (const loc of ['es', 'en']) {
      const m = JSON.parse(readFileSync(`src/i18n/messages/${loc}.json`, 'utf8'))
      for (const i of ALL_ITEMS) expect(m.Sidebar.nav[i.labelKey], `${loc} nav.${i.labelKey}`).toBeTruthy()
      for (const g of ['phase_prep', 'phase_mc', 'phase_com', 'phase_su', 'phase_mgmt', 'more', 'portfolio', 'adminOrg', 'adminTemplates', 'adminResources', 'adminIntegration', 'adminControl']) {
        expect(m.Sidebar.groups[g], `${loc} groups.${g}`).toBeTruthy()
      }
    }
  })
})
