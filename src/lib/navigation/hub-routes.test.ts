import { describe, expect, it } from 'vitest'
import { DAILY_TABS, STARTUP_TABS, dailyTabForKind, dailyTabHref, legacyTab, startupTabHref } from './hub-routes'

describe('pestañas por ruta de los hubs (H-18)', () => {
  it('la primera pestaña es la raíz del hub', () => {
    expect(dailyTabHref('p', 'actions')).toBe('/projects/p/daily')
    expect(dailyTabHref('p', 'tqs')).toBe('/projects/p/daily/tqs')
    expect(startupTabHref('p', 'procedures')).toBe('/projects/p/startup')
    expect(startupTabHref('p', 'lineups')).toBe('/projects/p/startup/lineups')
  })
  it('un ?tab= viejo redirige solo si es otra pestaña conocida', () => {
    expect(legacyTab(DAILY_TABS, 'constraints')).toBe('constraints')
    expect(legacyTab(DAILY_TABS, 'actions')).toBeNull()
    expect(legacyTab(DAILY_TABS, 'nada')).toBeNull()
    expect(legacyTab(STARTUP_TABS, undefined)).toBeNull()
    expect(legacyTab(STARTUP_TABS, 'lineups')).toBe('lineups')
  })
  it('cada tipo de ítem vuelve a su lista', () => {
    expect(dailyTabForKind('tq')).toBe('tqs')
    expect(dailyTabForKind('decision')).toBe('decisions')
  })
})
