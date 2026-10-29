import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ADMIN_GROUPS, PERSONAL_ITEMS, PORTFOLIO_ITEMS, PROJECT_ITEMS, PROJECT_TOP, buildMenu, phaseShortcuts, pickOpenPhase, visibleEntries, type MenuItemDef, type MenuPhase } from './menu'

const ALL_ITEMS: MenuItemDef[] = [...PERSONAL_ITEMS, ...PROJECT_TOP, ...PROJECT_ITEMS, ...PORTFOLIO_ITEMS, ...ADMIN_GROUPS.flatMap(g => g.items)]
const P = 'abc47484-59d3-4f51-8966-7fb4f1174ba8'

/** Página que sirve un href del menú. */
function pageFile(href: string): string {
  const path = href.split('?')[0].replace('/projects/{p}', '/projects/[id]')
  return `src/app/(dashboard)${path}/page.tsx`
}

/** Ítems que el menú oculta a un rol aunque la página no lo bloquea (lectura abierta, edición restringida). */
const UX_ONLY = new Set(['itrTemplates', 'preservationTemplates', 'pssrTemplates'])

describe('menú por rol (N1) con módulos fijos y fases de la org (A19 · C)', () => {
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

  it('metas de la propuesta: inspector ≤ 9, líder ≤ 17, cliente ≤ 11 (Portafolio = su inicio, Luis 2026-10-23), arquitecto ≈ 10', () => {
    expect(visibleEntries(buildMenu('inspector', P))).toBeLessThanOrEqual(9)
    expect(visibleEntries(buildMenu('leader', P))).toBeLessThanOrEqual(17)
    expect(visibleEntries(buildMenu('client', P))).toBeLessThanOrEqual(11)
    expect(visibleEntries(buildMenu('architect', P))).toBeLessThanOrEqual(10)
  })

  it('nada desaparece: lo permitido que no es de la audiencia queda en «Más…»', () => {
    for (const role of ['inspector', 'leader', 'architect', 'client']) {
      const m = buildMenu(role, P)
      const shown = new Set([...m.personal, ...m.project, ...m.groups.flatMap(g => g.items), ...m.config, ...m.portfolio, ...m.more, ...m.admin.flatMap(g => g.items)].map(l => l.key))
      for (const i of [...PROJECT_TOP, ...PROJECT_ITEMS, ...PORTFOLIO_ITEMS]) {
        const ok = !i.tier || (role === 'architect' ? ['privileged', 'editor'] : role === 'leader' ? ['editor'] : []).includes(i.tier)
        if (ok) expect(shown.has(i.key), `${role}: ${i.key}`).toBe(true)
      }
    }
  })

  it('owner/admin: módulos fijos por tipo de trabajo, configuración plegada y una sección por fase de la org', () => {
    const owner = buildMenu('owner', P)
    expect(owner.project.map(l => l.key)).toEqual(['overview', 'readiness'])
    expect(owner.groups.map(g => g.group)).toEqual(['work', 'field', 'startup', 'mgmt'])
    // A19: ITR y Punch tienen un lugar fijo, fuera de cualquier fase
    expect(owner.groups[0].items.map(l => l.key)).toEqual(['systems', 'tags', 'itrs', 'punches', 'documents'])
    expect(owner.config.map(l => l.key)).toEqual(['scope', 'vendors', 'signatories', 'engineering'])
    expect(owner.phaseMode).toBe('each')
  })

  it('líder: los mismos grupos con sus ítems y las fases juntas en «Por fase»; inspector y cliente, lista plana', () => {
    const lead = buildMenu('leader', P)
    expect(lead.groups[0].items.map(l => l.key)).toEqual(['systems', 'tags', 'itrs', 'punches', 'documents'])
    expect(lead.config.map(l => l.key)).toEqual(['vendors'])
    expect(lead.phaseMode).toBe('together')
    for (const role of ['inspector', 'client', 'architect']) {
      const m = buildMenu(role, P)
      expect(m.groups).toEqual([])
      expect(m.phaseMode).toBeNull()
    }
  })

  it('atajos de fase: la misma lista filtrada (ITR y punch por código de fase, matriz por gate)', () => {
    const p: MenuPhase = { gateId: 'g1', gateCode: 'RFC', gateName: 'Commissioning', phaseCode: 'C', approved: 2, total: 7 }
    expect(phaseShortcuts(P, p).map(s => s.href)).toEqual([`/projects/${P}/itrs?phase=C`, `/projects/${P}/punches?phase=C`, `/projects/${P}/readiness?gate=RFC`])
  })

  it('fase abierta por defecto (D2): la liberación siguiente de más sistemas; en empate, la primera', () => {
    const ph = (gateId: string): MenuPhase => ({ gateId, gateCode: gateId, gateName: gateId, phaseCode: gateId, approved: 0, total: 3 })
    const phases = [ph('MC'), ph('RFC'), ph('RFSU')]
    expect(pickOpenPhase(phases, ['RFC', 'RFC', 'MC', null])).toBe('RFC')
    expect(pickOpenPhase(phases, ['MC', 'RFC'])).toBe('MC')
    expect(pickOpenPhase(phases, [null, null])).toBeNull()
  })

  it('el arquitecto empieza por planificación; el cliente no ve Importar ni Escanear', () => {
    const arch = buildMenu('architect', P)
    expect(arch.project.map(l => l.key).slice(0, 3)).toEqual(['overview', 'readiness', 'planning'])
    const client = buildMenu('client', P)
    // Su inicio (homeForRole) es el Portafolio: visible, no en «Más…»
    expect(client.portfolio.map(l => l.key)).toContain('dashboard')
    const keys = [...client.personal, ...client.project, ...client.more].map(l => l.key)
    expect(keys).not.toContain('engineering')
    expect(keys).not.toContain('scan')
    expect(buildMenu('leader', P).project[0].href).toBe(`/projects/${P}`)
  })

  it('Portafolio unificado (V1): ninguna entrada lleva a /control-tower', () => {
    expect(ALL_ITEMS.filter(i => i.href.startsWith('/control-tower')).map(i => i.key)).toEqual([])
  })

  it('las etiquetas existen en es y en', () => {
    for (const loc of ['es', 'en']) {
      const m = JSON.parse(readFileSync(`src/i18n/messages/${loc}.json`, 'utf8'))
      for (const i of ALL_ITEMS) expect(m.Sidebar.nav[i.labelKey], `${loc} nav.${i.labelKey}`).toBeTruthy()
      for (const g of ['g_work', 'g_field', 'g_startup', 'g_mgmt', 'config', 'phases', 'byPhase', 'more', 'portfolio', 'adminOrg', 'adminTemplates', 'adminResources', 'adminIntegration', 'adminControl']) {
        expect(m.Sidebar.groups[g], `${loc} groups.${g}`).toBeTruthy()
      }
    }
  })
})
