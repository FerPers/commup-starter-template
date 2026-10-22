/**
 * Glosario aplicado (N0, H-13): la etiqueta del menú (Sidebar.nav) es igual al título (h1) de su página.
 * Las páginas cuyo h1 no tiene clave propia usan directamente la etiqueta del menú. Test de paridad en titles.test.ts.
 * Desempeño (PTC) es una pestaña del hub de Arranque: su h1 es el del hub.
 */
export const NAV_TITLE_KEYS: Record<string, string> = {
  readiness: 'ControlTower.title',
  controlTower: 'ControlTower.portfolio.title',
  opsPunches: 'OpsPunches.title',
  handover: 'AdminHandover.title',
  config: 'Config.title',
  dataQuality: 'DataQuality.title',
  registerTypes: 'Registers.admin.title',
  registers: 'Registers.title',
  documents: 'Documents.title',
  vendors: 'Vendors.title',
  signatories: 'Signatories.title',
  signals: 'Signals.title',
  loops: 'Signals.loops.title',
  workPlans: 'WorkPlans.title',
  planning: 'Planning.title',
  instrumentation: 'SignalsHub.title',
  auditLog: 'AuditLog.title',
  punchList: 'PunchList.title',
  preservation: 'Preservation.title',
  certificates: 'Certificates.view.title',
  kpis: 'Kpis.title',
  projects: 'Projects.title',
  gates: 'GatesAdmin.title',
  testEquipment: 'TestEquipment.title',
  users: 'Users.title',
  companies: 'Companies.title',
  daily: 'Daily.title',
  startup: 'Startup.title',
  systems: 'Systems.title',
}
